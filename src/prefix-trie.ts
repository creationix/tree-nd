const VALUE = Symbol('value');

interface TrieNode {
  [key: string]: TrieNode;
  [VALUE]?: JSONValue;
}

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

function isTerm(char: string): boolean {
  return char === '/' || char === ':' || char === '!' || char === '\n';
}

class PathMapLine extends Array<string | null | number> {}

export function escapeSegment(segment: string): string {
  return segment.replace(/[\\/:!]/g, (c) => `\\${c}`);
}

export function unescapeSegment(escapedSegment: string): string {
  return escapedSegment.replace(/\\(.)/g, (_, c) => c);
}

export function encodePathMapLine(line: PathMapLine): string {
  return line
    .map((item) => {
      if (typeof item === 'string') {
        return `/${escapeSegment(item)}`;
      }
      if (item === null) {
        return '!';
      }
      if (typeof item === 'number') {
        return `:${encodeInt(item)}`;
      }
      throw new TypeError(`Invalid value: ${JSON.stringify(item)}`);
    })
    .join('');
}

export function decodePathMapLine(data: string): PathMapLine {
  if (isTerm(data[0]) === false) {
    throw new Error('Invalid path map line');
  }
  let offset = 0;
  const line = new PathMapLine();
  const length = data.length;
  while (offset < length) {
    const char = data[offset];
    if (char === '\n') {
      offset++;
      return line;
    }
    if (char === '/') {
      offset++;
      const start = offset;
      while (offset < length) {
        const c = data[offset];
        if (isTerm(c)) {
          break;
        }
        if (c === '\\') {
          offset += 2;
        } else {
          offset++;
        }
      }
      line.push(unescapeSegment(data.substring(start, offset)));
    } else if (char === '!') {
      line.push(null);
      offset++;
    } else if (char === ':') {
      offset++;
      const start = offset;
      while (isVarInt(data[offset])) {
        offset++;
      }
      line.push(decodeInt(data.substring(start, offset)));
    } else {
      throw new Error(`Unexpected character: ${char}`);
    }
  }
  throw new Error('Unexpected EOF');
}

function ensurePathMapLine(node: PathMapLine | JSONValue): PathMapLine {
  if (node instanceof PathMapLine) return node;
  throw new Error('Unexpected JSON payload');
}

export class PrefixTrieReader {
  private rootOffset: number;
  private data: Uint8Array;
  private parsedLines: Map<number, PathMapLine | JSONValue>;

  constructor(data: Uint8Array | string) {
    const bytes =
      typeof data === 'string' ? new TextEncoder().encode(data) : data;
    // Find the start of the last line
    let offset = bytes.length;
    while (bytes[offset - 1] === 0x0a) {
      offset--;
    }
    while (bytes[offset - 1] !== 0x0a) {
      offset--;
    }
    this.rootOffset = offset;
    this.data = bytes;
    this.parsedLines = new Map();
  }

  find(path: string): JSONValue | undefined {
    if (path[0] !== '/') {
      throw new TypeError('Paths must start with /');
    }
    const data = this.data;
    const parsedLines = this.parsedLines;

    let leaf: JSONValue | undefined;
    let node: PathMapLine = ensurePathMapLine(getLine(this.rootOffset));
    for (const rawPart of path.substring(1).split('/')) {
      const part = decodeURIComponent(rawPart);
      const index = node.indexOf(part);
      if (index < 0) return; // No matching node
      const next = node[index + 1];
      if (typeof next === 'string') {
        throw new Error('Unexpected string');
      } else if (next === null) {
        leaf = null;
        node = [];
      } else if (typeof next === 'number') {
        const line = getLine(next);
        if (line instanceof PathMapLine) {
          node = line;
        } else {
          leaf = line;
          node = [];
        }
      }
    }
    if (leaf === undefined) {
      if (node[0] === null) {
        leaf = null;
      } else if (typeof node[0] === 'number') {
        leaf = getLine(node[0]);
        node = [];
      }
    }
    return leaf;

    // Get the line and ending offset with a given start offset
    function getLine(offset: number) {
      let cached = parsedLines.get(offset);
      if (!cached) {
        const c = String.fromCharCode(data[offset]);
        cached =
          c === '/' || c === '!' || c === ':' || c === '\n'
            ? decodePathMapLine(getUTF8Line(data, offset))
            : (JSON.parse(getUTF8Line(data, offset)) as JSONValue);
        parsedLines.set(offset, cached);
      }
      return cached;
    }
  }
}

export class PrefixTrie {
  private root: TrieNode;
  constructor() {
    this.root = {};
  }

  bulkInsert(entries: Record<string, JSONValue>): void {
    for (const [key, value] of Object.entries(entries)) {
      this.insert(key, value);
    }
  }

  insert(path: string, value: JSONValue): void {
    if (path[0] !== '/') {
      throw new TypeError('Paths must start with /');
    }
    let current = this.root;
    for (const partRaw of path.split('/')) {
      const part = decodeURIComponent(partRaw);
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    current[VALUE] = value;
  }

  find(path: string): JSONValue | undefined {
    if (path[0] !== '/') {
      throw new TypeError('Paths must start with /');
    }
    let current = this.root;
    for (const rawPart of path.split('/')) {
      const part = decodeURIComponent(rawPart);
      if (!current[part]) {
        return;
      }
      current = current[part];
    }
    return current[VALUE];
  }

  // Depth first traversal of leaves and nodes
  stringify(debug = false): string {
    const { root } = this;
    let offset = 0;
    const lines: string[] = [];
    const seenLines: Record<string, number> = {};
    walkNode(root[''], '');
    return lines.join('');

    function push(str: string): number {
      const seenIndex = seenLines[str];
      if (seenIndex !== undefined) {
        return seenIndex;
      }
      const start = offset;
      seenLines[str] = start;
      offset +=
        str[0] === '\x1b' ? 0 : new TextEncoder().encode(str).length + 1;
      lines.push(`${str}\n`);
      return start;
    }

    function pushLeaf(value: JSONValue, path?: string) {
      if (value === null) return null;
      const line = JSON.stringify(value);
      if (debug && seenLines[line] === undefined) {
        push(green(`LEAF: ${path}`));
      }
      return push(line);
    }

    function walkNode(node: TrieNode, path?: string): number {
      const line: PathMapLine = [];

      // If the node is both a leaf and a node, write the leaf first
      const initialLeaf = node[VALUE];
      if (initialLeaf !== undefined) {
        line.push(pushLeaf(initialLeaf, path));
      }

      // Walk the node sorted to increase deduplication chances
      for (const key of Object.keys(node).sort()) {
        const child = node[key];
        line.push(key);
        let subpath = '';
        if (debug) {
          subpath = (path === undefined ? '' : `${path}/`) + escapeSlash(key);
        }

        const childLeaf = getLeafOnly(child);
        if (childLeaf !== undefined) {
          line.push(pushLeaf(childLeaf, subpath));
        } else {
          line.push(walkNode(child, subpath));
        }
      }
      const encodedLine = encodePathMapLine(line);
      if (debug && seenLines[encodedLine] === undefined) {
        push(path ? yellow(`NODE: ${path}`) : red('ROOT:'));
      }
      return push(encodedLine);
    }
  }
}

function red(str: string): string {
  return `\x1b[31m${str}\x1b[0m`;
}
function yellow(str: string): string {
  return `\x1b[33m${str}\x1b[0m`;
}
function green(str: string): string {
  return `\x1b[32m${str}\x1b[0m`;
}

// Get the leaf value if this node is only a leaf
function getLeafOnly(node: TrieNode) {
  if (Object.keys(node).length === 0 && node[VALUE] !== undefined) {
    return node[VALUE];
  }
}

// Reduced form of encodeURIComponent that only escapes `/`
// Used for debugging paths
function escapeSlash(segment: string): string {
  return segment.replace(/\//g, '%2f');
}

function getUTF8Line(data: Uint8Array, start: number): string {
  let end = start;
  while (data[end++] !== 0x0a) {
    if (end >= data.length) {
      throw new Error('Unexpected EOF');
    }
  }
  return new TextDecoder().decode(data.subarray(start, end));
}

function isVarInt(char: string): boolean {
  return (char >= '0' && char <= '9') || (char >= 'a' && char <= 'z');
}

// Decode an integer using the same digits at base64URL,
// but as a big-endian integer
function decodeInt(num: string): number {
  if (num === '') return 0;
  return parseInt(num, 36);
}

// Encode a number using big-endian b64Chars
function encodeInt(num: number): string {
  return num === 0 ? '' : num.toString(36);
}

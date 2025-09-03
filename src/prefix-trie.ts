export const VALUE = Symbol('value');

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

class PathMapNode {
  [VALUE]?: null | number;
  [key: string]: null | number;
}

export function escapeSegment(segment: string): string {
  return segment.replace(/[\\/:!]/g, (c) => `\\${c}`);
}

export function unescapeSegment(escapedSegment: string): string {
  return escapedSegment.replace(/\\(.)/g, (_, c) => c);
}

export function encodePathMapNode(node: PathMapNode): string {
  const entries: [string | typeof VALUE, null | number][] =
    Object.entries(node);
  const value = node[VALUE];
  if (value !== undefined) entries.unshift([VALUE, value]);
  return entries
    .map(([key, value]) => {
      return (
        (key === VALUE ? '' : `/${escapeSegment(key)}`) +
        (value === null ? '!' : `:${encodeBase36(value)}`)
      );
    })
    .join('');
}

export function decodePathMapNode(data: string): PathMapNode {
  if (isTerm(data[0]) === false) {
    throw new Error('Invalid path map line');
  }
  let offset = 0;
  const node = new PathMapNode();
  const length = data.length;
  let key: string | typeof VALUE | undefined = VALUE;
  while (offset < length) {
    const char = data[offset];
    if (char === '\n') {
      offset++;
      return node;
    }
    if (char === '/') {
      if (key && key !== VALUE) {
        throw new Error('Unexpected key after key');
      }
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
      key = unescapeSegment(data.substring(start, offset));
    } else if (char === '!') {
      if (key === undefined) {
        throw new Error("Expected key before '!'");
      }
      node[key] = null;
      key = undefined;
      offset++;
    } else if (char === ':') {
      if (key === undefined) {
        throw new Error("Expected key before ':'");
      }
      offset++;
      const start = offset;
      while (isBase36(data[offset])) {
        offset++;
      }
      node[key] = decodeBase36(data.substring(start, offset));
      key = undefined;
    } else {
      throw new Error(`Unexpected character: ${char}`);
    }
  }
  throw new Error('Unexpected EOF');
}

function ensurePathMapNode(node: PathMapNode | JSONValue): PathMapNode {
  if (node instanceof PathMapNode) return node;
  throw new Error('Unexpected JSON payload');
}

export class PrefixTrieReader {
  private rootOffset: number;
  private data: Uint8Array;
  private parsedLines: Map<number, PathMapNode | JSONValue>;

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
    let node: PathMapNode | undefined = ensurePathMapNode(
      getLine(this.rootOffset),
    );
    for (const rawPart of path.substring(1).split('/')) {
      const part = decodeURIComponent(rawPart);
      const entry = node?.[part];
      if (entry === undefined) return; // No matching node
      if (entry === null) {
        leaf = null;
        node = undefined;
      } else {
        const line = getLine(entry);
        if (line instanceof PathMapNode) {
          node = line;
        } else {
          leaf = line;
          node = undefined;
        }
      }
    }
    if (leaf === undefined && node !== undefined) {
      const top = node[VALUE];
      if (top === null) {
        leaf = null;
      } else if (typeof top === 'number') {
        leaf = getLine(top);
        node = undefined;
      }
    }
    return leaf;

    // Get the line and ending offset with a given start offset
    function getLine(offset: number) {
      let cached = parsedLines.get(offset);
      if (!cached) {
        const line = getUTF8Line(data, offset);
        cached = isTerm(String.fromCharCode(data[offset]))
          ? decodePathMapNode(line)
          : (JSON.parse(line) as JSONValue);
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

  // Encode the prefix trie using pmap format
  // This is interleaved lines of JSON leaves and pmap entries
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
      const line = new PathMapNode();
      // If the node is both a leaf and a node, write the leaf first
      const leaf = node[VALUE];
      if (leaf !== undefined) {
        line[VALUE] = pushLeaf(leaf, path);
      }
      // Walk the node sorted to increase deduplication chances
      for (const key of Object.keys(node).sort()) {
        const child = node[key];
        const subpath = debug
          ? `${path ?? ''}/${key.replace(/\//g, '%2f')}`
          : undefined;
        const childLeaf = child[VALUE];
        if (childLeaf !== undefined && Object.keys(child).length === 0) {
          line[key] = pushLeaf(childLeaf, subpath);
        } else {
          line[key] = walkNode(child, subpath);
        }
      }
      const encodedLine = encodePathMapNode(line);
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

// Get the UTF-8 line from the data at a given offset
function getUTF8Line(data: Uint8Array, start: number): string {
  let end = start;
  while (data[end++] !== 0x0a) {
    if (end >= data.length) {
      throw new Error('Unexpected EOF');
    }
  }
  return new TextDecoder().decode(data.subarray(start, end));
}

// Check if a character is a base-36 digit
function isBase36(char: string): boolean {
  return (char >= '0' && char <= '9') || (char >= 'a' && char <= 'z');
}

// Encode a number using big-endian base-36 digits with empty string for zero
function encodeBase36(num: number): string {
  return num === 0 ? '' : num.toString(36);
}

// Decode a number using big-endian base-36 digits with empty string for zero
function decodeBase36(num: string): number {
  return num === '' ? 0 : parseInt(num, 36);
}

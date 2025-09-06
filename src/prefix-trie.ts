export const VALUE = Symbol('value');

interface TrieNode {
  [key: string]: TrieNode;
  [VALUE]?: JSONValue;
}

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

type PathMapLineLeaf = true | number;

export class PathMapLine {
  [VALUE]?: PathMapLineLeaf;
  [key: string]: PathMapLineLeaf;
}

export class PrefixTrieWriter {
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
      if (value === true) return true;
      const line = JSON.stringify(value);
      if (debug && seenLines[line] === undefined) {
        push(green(`LEAF: ${path}`));
      }
      return push(line);
    }

    function walkNode(trieNode: TrieNode, path?: string): number {
      const node = new PathMapLine();
      // If the node is both a leaf and a node, write the leaf first
      const leaf = trieNode[VALUE];
      if (leaf !== undefined) {
        node[VALUE] = pushLeaf(leaf, path);
      }
      // Walk the node sorted to increase deduplication chances
      for (const key of Object.keys(trieNode).sort()) {
        const child = trieNode[key];
        const subpath = debug
          ? `${path ?? ''}/${key.replace(/\//g, '%2f')}`
          : undefined;
        const childLeaf = child[VALUE];
        if (childLeaf !== undefined && Object.keys(child).length === 0) {
          node[key] = pushLeaf(childLeaf, subpath);
        } else {
          node[key] = walkNode(child, subpath);
        }
      }
      const encodedLine = encodePathMapNode(node);
      if (debug && seenLines[encodedLine] === undefined) {
        push(path ? yellow(`NODE: ${path}`) : red('ROOT:'));
      }
      return push(encodedLine);
    }
  }
}

export function encodePathMapNode(line: PathMapLine): string {
  const entries: [string | typeof VALUE, PathMapLineLeaf][] =
    Object.entries(line);
  const value = line[VALUE];
  if (value !== undefined) entries.unshift([VALUE, value]);
  return entries
    .map(([key, value]) => {
      return (
        (key === VALUE ? '' : `/${escapeSegment(key)}`) +
        (value === true ? '!' : `:${encodeBase16(value)}`)
      );
    })
    .join('');
}

export function decodePathMapNode(data: string): PathMapLine {
  if (isPmapDelimiter(data[0]) === false) {
    throw new Error('Invalid path map line');
  }
  const line = new PathMapLine();
  let key: string | typeof VALUE = VALUE;
  const parts = data.split(/((?:\\[/:!]|[^/:!\n])*)/g);
  for (let i = 0, l = parts.length; i < l; i += 2) {
    const typ = parts[i];
    const val = parts[i + 1];
    if (typ === '\n') break;
    if (typ === '/') {
      key = val.replace(/\\(.)/g, '$1');
    } else if (typ === ':' || typ === '!') {
      line[key] = (typ === '!' && true) || parseInt(val, 16) || 0;
    }
  }
  return line;
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
    let node: PathMapLine | undefined = ensurePathMapNode(
      getLine(this.rootOffset),
    );
    for (const rawPart of path.substring(1).split('/')) {
      const part = decodeURIComponent(rawPart);
      const entry = node?.[part];
      if (entry === undefined) return; // No matching node
      if (entry === true) {
        leaf = true;
        node = undefined;
      } else {
        const line = getLine(entry);
        if (line instanceof PathMapLine) {
          node = line;
        } else {
          leaf = line;
          node = undefined;
        }
      }
    }
    if (leaf === undefined && node !== undefined) {
      const top = node[VALUE];
      if (top === true) {
        leaf = true;
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
        cached = isPmapDelimiter(String.fromCharCode(data[offset]))
          ? decodePathMapNode(line)
          : (JSON.parse(line) as JSONValue);
        parsedLines.set(offset, cached);
      }
      return cached;
    }
  }
}

function ensurePathMapNode(node: PathMapLine | JSONValue): PathMapLine {
  if (node instanceof PathMapLine) return node;
  throw new Error('Unexpected JSON payload');
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

function isPmapDelimiter(char: string): boolean {
  return char === '/' || char === ':' || char === '!' || char === '\n';
}

function escapeSegment(segment: string): string {
  return segment.replace(/[\\/:!]/g, (c) => `\\${c}`);
}

function unescapeSegment(escapedSegment: string): string {
  return escapedSegment.replace(/\\(.)/g, (_, c) => c);
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

// Check if a character is a base-16 digit
function isBase16(char: string): boolean {
  return (char >= '0' && char <= '9') || (char >= 'a' && char <= 'f');
}

// Encode a number using big-endian base-16 digits with empty string for zero
function encodeBase16(num: number): string {
  return num === 0 ? '' : num.toString(16);
}

// Decode a number using big-endian base-16 digits with empty string for zero
function decodeBase16(num: string): number {
  return num === '' ? 0 : parseInt(num, 16);
}

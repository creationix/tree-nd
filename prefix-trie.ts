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

function isB36(char: string): boolean {
  return (char >= '0' && char <= '9') || (char >= 'a' && char <= 'z');
}

function isTerm(char: string): boolean {
  return (
    char === '/' ||
    char === '<' ||
    char === '>' ||
    char === '!' ||
    char === '\n'
  );
}

function identity(char: string): string {
  return char;
}

type PathMapEntry = string | null | { leaf: number } | { node: number };
class PathMapLine extends Array<PathMapEntry> {}

export function encodePathMapLine(line: PathMapLine, offset: number): string {
  return line
    .map((item) => {
      if (typeof item === 'string') {
        return `/${item.replace(/[\\/<>!]/g, (c) => `\\${c}`)}`;
      }
      if (item === null) {
        return '!';
      }
      if ('leaf' in item) {
        return `>${b36Encode(offset - item.leaf)}`;
      }
      if ('node' in item) {
        return `<${b36Encode(offset - item.node)}`;
      }
      throw new TypeError(`Invalid value: ${item}`);
    })
    .join('');
}

export function decodeJsonLine(data: string, offset = 0): JSONValue {
  const start = offset;
  const length = data.length;
  while (offset < length) {
    if (data[offset] === '\n') {
      return JSON.parse(data.substring(start, offset));
    }
    offset++;
  }
  throw new Error('Unexpected EOF');
}

export function decodePathMapLine(data: string, offset = 0): PathMapLine {
  const line = new PathMapLine();
  const length = data.length;
  while (offset < length) {
    const char = data[offset];
    if (char === '\n') {
      offset++;
      for (let i = 0, l = line.length; i < l; i++) {
        const entry = line[i];
        if (entry && typeof entry === 'object') {
          if ('leaf' in entry) {
            entry.leaf += offset;
          } else if ('node' in entry) {
            entry.node += offset;
          }
        }
      }
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
      line.push(data.substring(start, offset).replace(/\\(.)/g, identity));
    } else if (char === '!') {
      line.push(null);
      offset++;
    } else if (char === '<' || char === '>') {
      offset++;
      const start = offset;
      while (isB36(data[offset])) {
        offset++;
      }
      const num =
        offset === start ? 0 : parseInt(data.substring(start, offset), 36);
      if (char === '<') {
        line.push({ node: num });
      } else {
        line.push({ leaf: num });
      }
    }
  }
  throw new Error('Unexpected EOF');
}

function ensurePathMapLine(node: PathMapLine | JSONValue): PathMapLine {
  if (node instanceof PathMapLine) return node;
  throw new Error('Unexpected JSON payload');
}

function isLeaf(entry: PathMapEntry): entry is { leaf: number } {
  return Boolean(entry && typeof entry === 'object' && 'leaf' in entry);
}

export class PrefixTrieReader {
  private data: string;
  private parsedLines: Map<number, PathMapLine | JSONValue>;

  constructor(data: string) {
    this.data = data;
    this.parsedLines = new Map();
  }

  find(path: string): JSONValue | undefined {
    if (path[0] !== '/') {
      throw new TypeError('Paths must start with /');
    }
    const data = this.data;
    const parsedLines = this.parsedLines;

    let leaf: JSONValue | undefined;
    let node: PathMapLine = ensurePathMapLine(getLine(0));
    for (const rawPart of path.substring(1).split('/')) {
      const part = decodeURIComponent(rawPart);
      const index = node.indexOf(part);
      console.log({ part, node, index });
      if (index < 0) return; // No matching node
      const next = node[index + 1];
      if (typeof next === 'string') {
        // This is where chained path optimization might go
        throw new Error('Unexpected string');
      } else if (next === null) {
        leaf = null;
        node = [];
      } else if (isLeaf(next)) {
        leaf = getLine(next.leaf);
        node = [];
      } else if ('node' in next) {
        node = ensurePathMapLine(getLine(next.node));
      }
    }
    if (leaf === undefined && isLeaf(node[0])) {
      leaf = getLine(node[0].leaf);
      node = [];
    }
    return leaf;

    // Get the line and ending offset with a given start offset
    function getLine(offset: number) {
      let cached = parsedLines.get(offset);
      if (!cached) {
        const c = data[offset];
        cached =
          c === '/' || c === '!' || c === '<' || c === '>' || c === '\n'
            ? decodePathMapLine(data, offset)
            : decodeJsonLine(data, offset);
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
    walk(root[''], '');
    return lines.reverse().join('');

    function push(str: string): number {
      const seenIndex = seenLines[str];
      if (seenIndex !== undefined) {
        return seenIndex;
      }
      offset +=
        str[0] === '\x1b' ? 0 : new TextEncoder().encode(str).length + 1;
      lines.push(`${str}\n`);
      seenLines[str] = offset;
      return offset;
    }

    function pushLeaf(value: JSONValue, path?: string) {
      if (value === null) return null;
      const entry = { leaf: push(JSON.stringify(value)) };
      if (debug) {
        push(green(`LEAF: ${path}`));
      }
      return entry;
    }

    function walk(node: TrieNode, path?: string): number {
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

        // // Optimize chains of single entry nodes
        // while (true) {
        //   const segment = getSingleSegment(child);
        //   if (segment === undefined) {
        //     break;
        //   }
        //   line.push(segment);
        //   if (debug) {
        //     subpath += `/${escapeSlash(segment)}`;
        //   }
        //   child = child[segment];
        // }

        const childLeaf = getLeafOnly(child);
        if (childLeaf !== undefined) {
          line.push(pushLeaf(childLeaf, subpath));
        } else {
          line.push({ node: walk(child, subpath) });
        }
      }
      const pos = push(encodePathMapLine(line, offset));
      if (debug) {
        push(path ? yellow(`NODE: ${path}`) : red('ROOT:'));
      }
      return pos;
    }
  }
}

function b36Encode(val: number): string {
  return val ? val.toString(36) : '';
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

function getSingleSegment(node: TrieNode): string | undefined {
  const keys = Object.keys(node);
  if (node[VALUE] === undefined && keys.length === 1) {
    return keys[0];
  }
}

// Reduced form of encodeURIComponent that only escapes `/`
// Used for debugging paths
function escapeSlash(segment: string): string {
  return segment.replace(/\//g, '%2f');
}

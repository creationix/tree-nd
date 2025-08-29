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

type StringifyLine = (
  | string
  | 0
  | { leafOffset: number }
  | { childOffset: number }
)[];

export class PrefixTrie {
  private separator: string;
  private root: TrieNode;
  constructor(separator = '/') {
    this.separator = separator;
    this.root = {};
  }

  bulkInsert(entries: Record<string, JSONValue>): void {
    for (const [key, value] of Object.entries(entries)) {
      this.insert(key, value);
    }
  }

  insert(key: string, value: JSONValue): void {
    const parts = key.split(this.separator);
    // Inject leading slash if missing
    if (parts[0] !== '') {
      parts.unshift('');
    }
    let current = this.root;
    for (const partRaw of parts) {
      const part = decodeURIComponent(partRaw);
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    current[VALUE] = value;
  }

  find(key: string): JSONValue | undefined {
    const parts = key.split(this.separator);
    if (parts[0] !== '') {
      parts.unshift('');
    }
    let current = this.root;
    for (const part of parts) {
      if (!current[part]) {
        return;
      }
      current = current[part];
    }
    return current[VALUE];
  }

  // Depth first traversal of leaves and nodes
  stringify(debug = false): string {
    const { root, separator } = this;
    let offset = 0;
    const lines: string[] = [];
    const seenLines: Record<string, number> = {};
    console.log(root);
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

    function walk(node: TrieNode, path: string): number {
      const line: StringifyLine = [];
      const leaf = node[VALUE];
      if (leaf !== undefined) {
        if (leaf === null) {
          line.push(0);
        } else {
          line.push({ leafOffset: push(JSON.stringify(leaf)) });
          if (debug) {
            push(green(`LEAF: ${path}`));
          }
        }
      }
      for (const key of Object.keys(node).sort()) {
        let child = node[key];
        line.push(key);
        let subpath = path + separator + escapeSlash(key);
        let segment: string | undefined;
        // biome-ignore lint/suspicious/noAssignInExpressions: it's fine, really
        while ((segment = getSingleSegment(child)) !== undefined) {
          line.push(segment);
          subpath += separator + escapeSlash(segment);
          child = child[segment];
        }
        const leaf = getLeafOnly(child);
        if (leaf === null) {
          line.push(0);
        } else if (leaf !== undefined) {
          line.push({ leafOffset: push(JSON.stringify(leaf)) });
          if (debug) {
            push(green(`LEAF: ${subpath}`));
          }
        } else {
          line.push({ childOffset: walk(child, subpath) });
        }
      }
      const pos = push(compactEncode(line, offset));
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

// A custom serilization for prefix nodes that is cheaper than JSON
// String path segments are `/${segment}`
// The string escapes `/`, `\`, `<`, `>`, and `!` characters using `\`
// Leaf pointers are `>${base_36_dist}
// Node pointers are `<${base_36_dist}
// Null Leaves are tab characters `!`
function compactEncode(val: StringifyLine, offset: number): string {
  return val
    .map((item) => {
      if (typeof item === 'string') {
        return `/${item.replace(/[\\/<>!]/g, (c) => `\\${c}`)}`;
      }
      if (item === 0) return '!';
      if ('leafOffset' in item) {
        return `>${b36Encode(offset - item.leafOffset)}`;
      }
      if ('childOffset' in item) {
        return `<${b36Encode(offset - item.childOffset)}`;
      }
      throw new TypeError(`Invalid value: ${val}`);
    })
    .join('');
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

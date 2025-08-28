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

class PrefixTrie {
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
    let current = this.root;
    for (const part of parts) {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    current[VALUE] = value;
  }

  find(key: string): JSONValue | undefined {
    const parts = key.split(this.separator);
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
    walk(root[''], '');
    return lines.join('');

    function push(str: string, lengthOverride?: number): number {
      const seenIndex = seenLines[str];
      if (seenIndex !== undefined) {
        return seenIndex;
      }
      const pos = offset;
      seenLines[str] = pos;
      offset += lengthOverride ?? new TextEncoder().encode(str).length + 1;
      lines.push(`${str}\n`);
      return pos;
    }

    function walk(node: TrieNode, path: string, skipLeaf = false): number {
      const line: (string | number)[] = [];
      if (!skipLeaf) {
        const leaf = getLeafOnly(node);
        if (leaf !== undefined) {
          if (debug) {
            push(green(`LEAF: ${path}`), 0);
          }
          const leafOffset = push(JSON.stringify(leaf));
          line.push(offset - leafOffset);
        }
      }
      for (const key of Object.keys(node).sort()) {
        let child = node[key];
        line.push(key);
        let subpath = path + separator + key;
        let segment: string | undefined;
        while ((segment = getSingleSegment(child)) !== undefined) {
          line.push(segment);
          subpath += separator + segment;
          child = child[segment];
        }
        const leaf = getLeafOnly(child);
        if (leaf === null) {
          line.push(0);
        } else if (leaf !== undefined) {
          if (debug) {
            push(green(`LEAF: ${subpath}`), 0);
          }
          const leafOffset = push(JSON.stringify(leaf));
          line.push(offset - leafOffset);
        } else {
          const childOffset = walk(child, subpath);
          line.push(-(offset - childOffset));
        }
      }
      if (debug) {
        push(path ? yellow(`NODE: ${path}`) : red('ROOT:'), 0);
      }
      return push(compactEncode(line));
    }
  }
}

const b64Digits =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Url Safe Base64 digits, but normal integer.
//   A-Z a-z 0-9 - _
function b64Encode(num: number): string {
  if (!Number.isInteger(num)) throw new TypeError(`${num} is not an integer.`);
  const digits: string[] = [];
  while (num > 0) {
    digits.push(b64Digits[num & 63]);
    num >>>= 6;
  }
  return digits.reverse().join('');
}

// A custom serilization for prefix nodes that is cheaper than JSON
// String path segments are `/${segment}`
// The string escapes `/`, `\`, `<`, `>`, and `!` characters using `\`
// Leaf pointers are `>${base_36_dist}
// Node pointers are `<${base_36_dist}
// Null Leaves are tab characters `!`
function compactEncode(val: unknown[]): string {
  return val
    .map((item) => {
      if (typeof item === 'string') {
        return `/${item.replace(/[\\/<>!]/g, (c) => `\\${c}`)}`;
      }
      if (typeof item === 'number') {
        if (Number.isInteger(item)) {
          if (item === 0) return '!';
          if (item < 0) return `<${b64Encode(-item)}`;
          return `>${b64Encode(item)}`;
        }
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

const trie = new PrefixTrie();
trie.bulkInsert({
  '/foo': '/foo.html',
  '/foo/bar': ['/foo/bar.html', 307],
  '/foo/baz/': null,
  '/apple/pie': { yummy: true },
});

console.log(trie.stringify(true));

/*
"/foo.html"                    LEAF: /foo
["/foo/bar.html",307]          LEAF: /foo/bar
[12,"bar",22,"baz","",0]       NODE: /foo
{"yummy":true}                 LEAF: /apple/pie
["foo",-25,"apple","pie",15]   ROOT:
*/

import { readFileSync, writeFileSync } from 'node:fs';
const trie2 = new PrefixTrie();
const data = JSON.parse(
  readFileSync('./hof-prd-product-list-page-paths.json', 'utf8'),
);
for (const path of data) {
  trie2.insert(path, null);
}
writeFileSync('./hof-prd-product-list-page-paths.pmap', trie2.stringify(false));

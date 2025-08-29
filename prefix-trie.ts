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

class PrefixTrie {
  private separator: string;
  private root: TrieNode;
  constructor(separator = '/') {
    this.separator = separator;
    this.root = {};
  }

  bulkInsert(entries: Record<string, JSONValue>): void {
    console.log('\nINPUT:');
    console.log(entries);
    for (const [key, value] of Object.entries(entries)) {
      this.insert(key, value);
    }
    console.log('\nOUTPUT:');
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
      // console.log({ path, node });
      const line: StringifyLine = [];
      const leaf = node[VALUE];
      if (leaf !== undefined) {
        line.push({ leafOffset: push(JSON.stringify(leaf)) });
        if (debug) {
          push(green(`LEAF: ${path}`));
        }
      }
      for (const key of Object.keys(node).sort()) {
        let child = node[key];
        line.push(key);
        let subpath = path + separator + key;
        let segment: string | undefined;
        // biome-ignore lint/suspicious/noAssignInExpressions: it's fine, really
        while ((segment = getSingleSegment(child)) !== undefined) {
          line.push(segment);
          subpath += separator + segment;
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
        return `>${b36Encode(item.leafOffset)}`;
      }
      if ('childOffset' in item) {
        return `<${b36Encode(item.childOffset)}`;
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

// const trie = new PrefixTrie();
// trie.bulkInsert({
//   '/foo': '/foo.html',
//   '/foo/bar': ['/foo/bar.html', 307],
//   '/foo/baz/': null,
//   '/apple/pie': { yummy: true },
// });

// console.log(trie.stringify(true));

const trie3 = new PrefixTrie();
trie3.bulkInsert({
  '': 0,
  '/': 1,
  '/f': 2,
  '/fo': 3,
  '/foo': 4,
  '/foo/': 5,
  // '/women/trousers/yoga-pants/black': 1,
  // '/women/trousers/yoga-pants/blue': 2,
  // '/women/trousers/yoga-pants/brown': 3,
  // '/women/trousers/zip-off-trousers/blue': 4,
  // '/women/trousers/zip-off-trousers/black': 5,
  // '/women/trousers/zip-off-trousers/brown': 6,
});
console.log(trie3.stringify(true));

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

/*
/apple/pie<w/foo<
48 /bar>/baz/!
36 ["/foo/bar.html",307]
14 {"yummy":true}
*/

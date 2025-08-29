import { describe, it, expect, beforeEach } from 'bun:test';
import { PrefixTrie } from './prefix-trie.ts';

describe('prefix-trie', () => {
  let trie: PrefixTrie;

  beforeEach(() => {
    trie = new PrefixTrie();
  });

  it('should insert and find values', () => {
    trie.insert('foo', { bar: 'baz' });
    expect(trie.find('foo')).toEqual({ bar: 'baz' });
  });

  it('should return undefined for non-existent keys', () => {
    expect(trie.find('non-existent')).toBeUndefined();
  });

  it('should work with bulk inserts', () => {
    const input = {
      '/foo': '/foo.html',
      '/foo/bar': ['/foo/bar.html', 307],
      '/foo/baz/': null,
      '/apple/pie': { yummy: true },
    };
    trie.bulkInsert(input);
    // Verify everything is in there
    for (const [k, v] of Object.entries(input)) {
      expect(trie.find(k)).toEqual(v);
    }
    // Log the result
    console.log('INPUT', input);
    console.log(trie.stringify(true));

    // Verify the string encoding is correct
    expect(trie.stringify()).toEqual(
      '/apple/pie>1c/foo<\n' +
        '>m/bar>/baz/!\n' +
        '["/foo/bar.html",307]\n' +
        '"/foo.html"\n' +
        '{"yummy":true}\n',
    );
  });

  it('should do proper prefixes', () => {
    const input = {
      '': 0,
      '/': 1,
      '/f': 2,
      '/fo': 3,
      '/foo': 4,
      '/foo/': 5,
    };
    trie.bulkInsert(input);
    // Verify everything is in there
    for (const [k, v] of Object.entries(input)) {
      expect(trie.find(k)).toEqual(v);
    }
    // Log the result
    console.log('INPUT', input);
    console.log(trie.stringify(true));

    // Verify the string encoding is correct
    expect(trie.stringify()).toEqual(
      '>f/>d/f>b/fo>9/foo<\n' +
        '>2/>\n' +
        '5\n' +
        '4\n' +
        '3\n' +
        '2\n' +
        '1\n' +
        '0\n',
    );
  });
  it('should escape paths as needed', () => {
    const paths: string[][] = [
      ['fancy/path', 'with', 'more'],
      ['and', '<b>bold</b>', 'path'],
      ['what\\is', 'this?'],
      ['exciting!', 'times!'],
    ];
    const input = Object.fromEntries(
      paths.map((path) => [
        path.map((segment) => segment.replace(/\//g, '%2f')).join('/'),
        path,
      ]),
    );
    trie.bulkInsert(input);
    // Log the result
    console.log('INPUT', input);
    console.log(trie.stringify(true));

    expect(trie.stringify()).toEqual(
      '/and/\\<b\\>bold\\<\\/b\\>/path>21/exciting\\!/times\\!>1e/fancy\\/path/with/more>l/what\\\\is/this?>\n' +
        '["what\\\\is","this?"]\n' +
        '["fancy/path","with","more"]\n' +
        '["exciting!","times!"]\n' +
        '["and","<b>bold</b>","path"]\n',
    );
  });
});

// // const trie = new PrefixTrie();

// // console.log(trie.stringify(true));

// const trie3 = new PrefixTrie();
// trie3.bulkInsert({

//   // '/women/trousers/yoga-pants/black': 1,
//   // '/women/trousers/yoga-pants/blue': 2,
//   // '/women/trousers/yoga-pants/brown': 3,
//   // '/women/trousers/zip-off-trousers/blue': 4,
//   // '/women/trousers/zip-off-trousers/black': 5,
//   // '/women/trousers/zip-off-trousers/brown': 6,
// });
// console.log(trie3.stringify(true));

// /*
// "/foo.html"                    LEAF: /foo
// ["/foo/bar.html",307]          LEAF: /foo/bar
// [12,"bar",22,"baz","",0]       NODE: /foo
// {"yummy":true}                 LEAF: /apple/pie
// ["foo",-25,"apple","pie",15]   ROOT:
// */

// import { readFileSync, writeFileSync } from 'node:fs';
// const trie2 = new PrefixTrie();
// const data = JSON.parse(
//   readFileSync('./hof-prd-product-list-page-paths.json', 'utf8'),
// );
// for (const path of data) {
//   trie2.insert(path, null);
// }
// writeFileSync('./hof-prd-product-list-page-paths.pmap', trie2.stringify(false));

// /*
// /apple/pie<w/foo<
// 48 /bar>/baz/!
// 36 ["/foo/bar.html",307]
// 14 {"yummy":true}
// */

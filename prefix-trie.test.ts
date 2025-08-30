import { describe, it, expect, beforeEach } from 'bun:test';
import {
  encodePathMapLine,
  decodePathMapLine,
  PrefixTrie,
  PrefixTrieReader,
} from './prefix-trie.ts';

describe('pathmap-line', () => {
  it('should encode correctly', () => {
    expect(encodePathMapLine([], 0)).toEqual('');
    expect(encodePathMapLine(['hello', null, 'world', null], 0)).toEqual(
      '/hello!/world!',
    );
    expect(encodePathMapLine([{ node: 0 }, null, { leaf: 0 }], 0)).toEqual(
      '<!>',
    );
    expect(encodePathMapLine([{ node: 10 }, null, { leaf: 10 }], 10)).toEqual(
      '<!>',
    );
    expect(encodePathMapLine([{ node: 10 }, null, { leaf: 10 }], 11)).toEqual(
      '<1!>1',
    );
    expect(encodePathMapLine([{ node: 10 }, null, { leaf: 10 }], 46)).toEqual(
      '<10!>10',
    );
    expect(
      encodePathMapLine(
        [{ node: 10 }, { leaf: 20 }, { node: 30 }, { leaf: 40 }],
        100,
      ),
    ).toEqual('<2i>28<1y>1o');
    expect(encodePathMapLine(['fancy/paths', 'with\\slashes'], 0)).toEqual(
      '/fancy\\/paths/with\\\\slashes',
    );
    expect(encodePathMapLine(['fancy <b> bold', 'paths!'], 0)).toEqual(
      '/fancy \\<b\\> bold/paths\\!',
    );
  });

  it.only('should decode correctly', () => {
    expect(decodePathMapLine('/fancy\\/paths/with\\\\slashes\n')).toEqual([
      'fancy/paths',
      'with\\slashes',
    ]);
    expect(decodePathMapLine('\n!\n')).toEqual([]);
    expect(decodePathMapLine('\n!\n', 1)).toEqual([null]);
    expect(() => decodePathMapLine('\n!\n', 3)).toThrowError();
    expect(decodePathMapLine('/hello/world\n')).toEqual(['hello', 'world']);
    expect(decodePathMapLine('<!>\n')).toEqual([
      { node: 4 },
      null,
      { leaf: 4 },
    ]);
    expect(decodePathMapLine('/foo>3\n', 0)).toEqual(['foo', { leaf: 10 }]);
    expect(decodePathMapLine('<2i>28<1y>1o\n', 0)).toEqual([
      { node: 103 },
      { leaf: 93 },
      { node: 83 },
      { leaf: 73 },
    ]);
    expect(decodePathMapLine('      \n<2i>28<1y>1o\n', 7)).toEqual([
      { node: 110 },
      { leaf: 100 },
      { node: 90 },
      { leaf: 80 },
    ]);
  });
});
describe('prefix-trie', () => {
  it('should insert and find values', () => {
    const writer = new PrefixTrie();
    writer.insert('/foo', { bar: 'baz' });
    expect(writer.find('/foo')).toEqual({ bar: 'baz' });
    expect(writer.find('/')).toBeUndefined();
    console.log(writer.stringify(true));
    const reader = new PrefixTrieReader(writer.stringify());
    expect(reader.find('/foo')).toEqual({ bar: 'baz' });
    expect(reader.find('/')).toBeUndefined();
  });

  it('should round-trip basic shapes', () => {
    const writer = new PrefixTrie();
    const input = {
      '/foo': { path: 'foo' },
      '/foo/bar': true,
      '/foo/baz': false,
      '/foo/zag': null,
      '/foo/array': [1, 2, 3],
    };
    writer.bulkInsert(input);
    for (const [k, v] of Object.entries(input)) {
      expect(writer.find(k)).toEqual(v);
    }
    console.log(writer.stringify(true));
    const reader = new PrefixTrieReader(writer.stringify());
    for (const [k, v] of Object.entries(input)) {
      expect(reader.find(k)).toEqual(v);
    }
  });

  it('should round trip all kinds of prefixes', () => {
    const writer = new PrefixTrie();
    const input = {
      '/': '/',
      '/a': '/',
      '/a/': '/a/',
      '/ab': '/ab',
      '/ab/': '/ab/',
    };
    writer.bulkInsert(input);
    for (const [k, v] of Object.entries(input)) {
      expect(writer.find(k)).toEqual(v);
    }
    console.log(writer.stringify(true));
    const reader = new PrefixTrieReader(writer.stringify());
    for (const [k, v] of Object.entries(input)) {
      expect(reader.find(k)).toEqual(v);
    }
  });

  it('should escape paths as needed', () => {
    const paths: string[][] = [
      ['fancy/path', 'with special'],
      ['fancy/characters', '<b>bold</b>', 'path'],
      ['c:\\\\Users', 'win32?'],
      ['exciting!', 'times!'],
    ];
    const input = Object.fromEntries(
      paths.map((path) => [
        // '/' + path.map((segment) => segment.replace(/\//g, '%2f')).join('/'),
        `/${path.map((segment) => encodeURIComponent(segment)).join('/')}`,
        path,
      ]),
    );
    const writer = new PrefixTrie();
    writer.bulkInsert(input);

    console.log('INPUT', input);
    console.log(writer.stringify(true));

    for (const [k, v] of Object.entries(input)) {
      expect(writer.find(k)).toEqual(v);
    }

    const reader = new PrefixTrieReader(writer.stringify());
    for (const [k, v] of Object.entries(input)) {
      expect(reader.find(k)).toEqual(v);
    }
  });

  //   //   expect(trie.stringify()).toEqual(
  //   //     '/and/\\<b\\>bold\\<\\/b\\>/path>21/exciting\\!/times\\!>1e/fancy\\/path/with/more>l/what\\\\is/this?>\n' +
  //   //       '["what\\\\is","this?"]\n' +
  //   //       '["fancy/path","with","more"]\n' +
  //   //       '["exciting!","times!"]\n' +
  //   //       '["and","<b>bold</b>","path"]\n',
  //   //   );
  //   // });
});

// // // const trie = new PrefixTrie();

// // // console.log(trie.stringify(true));

// // const trie3 = new PrefixTrie();
// // trie3.bulkInsert({

// //   // '/women/trousers/yoga-pants/black': 1,
// //   // '/women/trousers/yoga-pants/blue': 2,
// //   // '/women/trousers/yoga-pants/brown': 3,
// //   // '/women/trousers/zip-off-trousers/blue': 4,
// //   // '/women/trousers/zip-off-trousers/black': 5,
// //   // '/women/trousers/zip-off-trousers/brown': 6,
// // });
// // console.log(trie3.stringify(true));

// // /*
// // "/foo.html"                    LEAF: /foo
// // ["/foo/bar.html",307]          LEAF: /foo/bar
// // [12,"bar",22,"baz","",0]       NODE: /foo
// // {"yummy":true}                 LEAF: /apple/pie
// // ["foo",-25,"apple","pie",15]   ROOT:
// // */

// // import { readFileSync, writeFileSync } from 'node:fs';
// // const trie2 = new PrefixTrie();
// // const data = JSON.parse(
// //   readFileSync('./hof-prd-product-list-page-paths.json', 'utf8'),
// // );
// // for (const path of data) {
// //   trie2.insert(path, null);
// // }
// // writeFileSync('./hof-prd-product-list-page-paths.pmap', trie2.stringify(false));

// // /*
// // /apple/pie<w/foo<
// // 48 /bar>/baz/!
// // 36 ["/foo/bar.html",307]
// // 14 {"yummy":true}
// // */

import { describe, it, expect } from 'bun:test';

import {
  encodePathMapNode,
  decodePathMapNode,
  PrefixTrieWriter,
  PrefixTrieReader,
  VALUE,
} from '../src/prefix-trie.ts';

describe('pathmap-line', () => {
  it('should encode correctly', () => {
    expect(encodePathMapNode({})).toEqual('');
    expect(encodePathMapNode({ hello: true, world: true })).toEqual(
      '/hello!/world!',
    );
    expect(encodePathMapNode({ [VALUE]: 0, a: true, b: 0 })).toEqual(':/a!/b:');
    expect(encodePathMapNode({ [VALUE]: 10, a: true, b: 10 })).toEqual(
      ':a/a!/b:a',
    );
    expect(encodePathMapNode({ [VALUE]: 1, '': 2, a: 3, b: 4 })).toEqual(
      ':1/:2/a:3/b:4',
    );
    expect(encodePathMapNode({ a: 10, b: 20, c: 30, d: 40 })).toEqual(
      '/a:a/b:14/c:1e/d:28',
    );
    expect(
      encodePathMapNode({ 'fancy/paths': true, 'with\\slashes': true }),
    ).toEqual('/fancy\\/paths!/with\\\\slashes!');
    expect(encodePathMapNode({ 'fancy:pants': true, 'paths!': true })).toEqual(
      '/fancy\\:pants!/paths\\!!',
    );
  });

  it('should decode correctly', () => {
    expect(decodePathMapNode('/fancy\\/paths!/with\\\\slashes!\n')).toEqual({
      'fancy/paths': true,
      'with\\slashes': true,
    });
    expect(decodePathMapNode('\n!\n')).toEqual({});
    expect(decodePathMapNode('!\n')).toEqual({ [VALUE]: true });
    expect(() => decodePathMapNode('')).toThrowError();
    expect(() => decodePathMapNode('bad\n')).toThrowError();
    expect(decodePathMapNode('/hello:1/world:2\n')).toEqual({
      hello: 1,
      world: 2,
    });
    expect(decodePathMapNode(':4/a!/b:5\n')).toEqual({
      [VALUE]: 4,
      a: true,
      b: 5,
    });
    expect(decodePathMapNode('/foo:a\n')).toEqual({ foo: 10 });
    expect(decodePathMapNode('/0:5a/1:50/2:46/3:3c\n')).toEqual({
      0: 90,
      1: 80,
      2: 70,
      3: 60,
    });
    expect(decodePathMapNode(':1/:2/a:3\n')).toEqual({
      [VALUE]: 1,
      '': 2,
      a: 3,
    });
  });
});
describe('prefix-trie', () => {
  it('should encode correctly', () => {
    const writer = new PrefixTrieWriter();
    writer.insert('/foo', 'f');
    expect(writer.stringify()).toEqual('"f"\n/foo:\n');
    writer.insert('/foo/bar', 'b');
    expect(writer.stringify()).toEqual('"f"\n"b"\n:/bar:4\n/foo:8\n');
    writer.insert('/foo/', '/');
    expect(writer.stringify()).toEqual('"f"\n"/"\n"b"\n:/:4/bar:8\n/foo:c\n');
  });
  it('should decode correctly', () => {
    let reader = new PrefixTrieReader('"f"\n/foo:\n');
    expect(reader.find('/foo')).toEqual('f');
    reader = new PrefixTrieReader('"f"\n"b"\n:/bar:4\n/foo:8\n');
    expect(reader.find('/foo')).toEqual('f');
    expect(reader.find('/foo/bar')).toEqual('b');
    reader = new PrefixTrieReader('"f"\n"/"\n"b"\n:/:4/bar:8\n/foo:c\n');
    expect(reader.find('/foo')).toEqual('f');
    expect(reader.find('/foo/bar')).toEqual('b');
    expect(reader.find('/foo/')).toEqual('/');
  });

  it('should insert and find values', () => {
    const writer = new PrefixTrieWriter();
    writer.insert('/foo', { bar: 'baz' });
    expect(writer.find('/foo')).toEqual({ bar: 'baz' });
    expect(writer.find('/')).toBeUndefined();
    // console.log(writer.stringify(true));
    const reader = new PrefixTrieReader(writer.stringify());
    expect(reader.find('/foo')).toEqual({ bar: 'baz' });
    expect(reader.find('/')).toBeUndefined();
  });

  it('should round-trip basic shapes', () => {
    const writer = new PrefixTrieWriter();
    const input = {
      '/foo': { path: 'foo' },
      '/foo/': { path: 'foo/' },
      '/foo/bar': true,
      '/foo/baz': false,
      '/foo/zag': null,
      '/foo/array': [1, 2, 3],
    };
    writer.bulkInsert(input);
    for (const [k, v] of Object.entries(input)) {
      expect(writer.find(k)).toEqual(v);
    }
    // console.log(writer.stringify(true));
    const reader = new PrefixTrieReader(writer.stringify());
    for (const [k, v] of Object.entries(input)) {
      expect(reader.find(k)).toEqual(v);
    }
  });

  it('should round trip all kinds of prefixes', () => {
    const writer = new PrefixTrieWriter();
    const input = {
      '/': '/',
      '/2': '/',
      '/a': '/a',
      '/a/': '/a/',
      '/ab': '/ab',
      '/ab/': '/ab/',
      '/n': null,
      '/nu': null,
      '/nul': null,
      '/null': null,
      '/null/': null,
      '/null/v': null,
      '/null/va': null,
      '/null/val': null,
      '/null/valu': null,
      '/null/value': null,
      '/null/value/': null,
    };
    writer.bulkInsert(input);
    for (const [k, v] of Object.entries(input)) {
      expect(writer.find(k)).toEqual(v);
    }
    // console.log(writer.stringify(true));
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
        `/${path.map((segment) => encodeURIComponent(segment)).join('/')}`,
        path,
      ]),
    );
    const writer = new PrefixTrieWriter();
    writer.bulkInsert(input);
    // console.log(writer.stringify(true));
    for (const [k, v] of Object.entries(input)) {
      expect(writer.find(k)).toEqual(v);
    }

    const reader = new PrefixTrieReader(writer.stringify());
    for (const [k, v] of Object.entries(input)) {
      expect(reader.find(k)).toEqual(v);
    }
  });

  it('should round trip realistic data without deduplication', () => {
    const writer = new PrefixTrieWriter();
    const input = {
      '/women/trousers/yoga-pants/black': 1,
      '/women/trousers/yoga-pants/blue': 2,
      '/women/trousers/yoga-pants/brown': 3,
      '/women/trousers/zip-off-trousers/blue': 4,
      '/women/trousers/zip-off-trousers/black': 5,
      '/women/trousers/zip-off-trousers/brown': 6,
    };
    writer.bulkInsert(input);
    for (const [k, v] of Object.entries(input)) {
      expect(writer.find(k)).toEqual(v);
    }
    // console.log(writer.stringify(true));
    expect(writer.stringify().length).toBeLessThan(120);
    const reader = new PrefixTrieReader(writer.stringify());
    for (const [k, v] of Object.entries(input)) {
      expect(reader.find(k)).toEqual(v);
    }
  });

  it('should round trip realistic data with deduplication', () => {
    const writer = new PrefixTrieWriter();
    const input = {
      '/women/trousers/yoga-pants/black': 1,
      '/women/trousers/yoga-pants/blue': 2,
      '/women/trousers/yoga-pants/brown': 3,
      '/women/trousers/zip-off-trousers/blue': 2,
      '/women/trousers/zip-off-trousers/black': 1,
      '/women/trousers/zip-off-trousers/brown': 3,
    };
    writer.bulkInsert(input);
    for (const [k, v] of Object.entries(input)) {
      expect(writer.find(k)).toEqual(v);
    }
    // console.log(writer.stringify());
    expect(writer.stringify().length).toBeLessThan(90);
    const reader = new PrefixTrieReader(writer.stringify());
    for (const [k, v] of Object.entries(input)) {
      expect(reader.find(k)).toEqual(v);
    }
  });

  it('should round trip realistic data with all null values', () => {
    const writer = new PrefixTrieWriter();
    const input = {
      '/women/trousers/yoga-pants/black': null,
      '/women/trousers/yoga-pants/blue': null,
      '/women/trousers/yoga-pants/brown': null,
      '/women/trousers/zip-off-trousers/blue': null,
      '/women/trousers/zip-off-trousers/black': null,
      '/women/trousers/zip-off-trousers/brown': null,
    };
    writer.bulkInsert(input);
    for (const [k, v] of Object.entries(input)) {
      expect(writer.find(k)).toEqual(v);
    }
    // console.log(writer.stringify());
    const reader = new PrefixTrieReader(writer.stringify());
    for (const [k, v] of Object.entries(input)) {
      expect(reader.find(k)).toEqual(v);
    }
  });

  it('should use byte offsets with unicode characters', () => {
    const writer = new PrefixTrieWriter();
    const input = {
      '/poems/runes': 'ᚠᛇᚻ᛫ᛒᛦᚦ᛫ᚠᚱᚩᚠᚢᚱ᛫ᚠᛁᚱᚪ᛫ᚷᛖᚻᚹᛦᛚᚳᚢᛗ',
      '/poems/middle/english': 'An preost wes on leoden, Laȝamon was ihoten',
      '/poems/middle/deutsch': 'Sîne klâwen durh die wolken sint geslagen',
      '/poems/ελληνικά': 'Τη γλώσσα μου έδωσαν ελληνική',
      '/poems/русский': 'На берегу пустынных волн',
      '/poems/russian': 'На берегу пустынных волн',
      '/poems/ქართული': 'ვეპხის ტყაოსანი შოთა რუსთაველი',
      '/poems/georgian': 'ვეპხის ტყაოსანი შოთა რუსთაველი',
      '/poems/phonemic/𐐼𐐯𐑅𐐨𐑉𐐯𐐻':
        '𐐙𐐩𐑃 𐐺𐐨𐐮𐑍 𐑄 𐑁𐐲𐑉𐑅𐐻 𐐹𐑉𐐮𐑌𐑅𐐲𐐹𐐲𐑊 𐐮𐑌 𐑉𐐮𐑂𐐨𐑊𐐲𐐼 𐑉𐐮𐑊𐐮𐐾𐐲𐑌',
      '/poems/phonemic/deseret':
        '𐐙𐐩𐑃 𐐺𐐨𐐮𐑍 𐑄 𐑁𐐲𐑉𐑅𐐻 𐐹𐑉𐐮𐑌𐑅𐐲𐐹𐐲𐑊 𐐮𐑌 𐑉𐐮𐑂𐐨𐑊𐐲𐐼 𐑉𐐮𐑊𐐮𐐾𐐲𐑌',
      '/poems/phonemic/𐑖𐑱𐑝𐑰𐑩𐑯': '·𐑛𐑧𐑔 𐑦𐑥𐑐𐑤𐑲𐑟 𐑗𐑱𐑯𐑡 𐑯 𐑦𐑯𐑛𐑦𐑝𐑦𐑡𐑵𐑨𐑤𐑦𐑑𐑦;',
      '/poems/phonemic/shavian': '·𐑛𐑧𐑔 𐑦𐑥𐑐𐑤𐑲𐑟 𐑗𐑱𐑯𐑡 𐑯 𐑦𐑯𐑛𐑦𐑝𐑦𐑡𐑵𐑨𐑤𐑦𐑑𐑦;',
      '/emojis/smileys': '😂🫠😉☺️🥲😋🫣🤫🤔🫡',
      '/emojis/animals/mammals': '🐵🐒🦍🦧🐶🐕🦮🐕‍🦺🐩🐺🦊',
      '/emojis/animals/marine-animals': '🐳🐋🐬🦭🐟🐠🐡🦈🐙🐚🪸🪼',
      '/emojis/animals/insects-and-bugs': '🐌🦋🐛🐜🐝🪲🐞🦗🪳🕷️🕸️🦂🦟🪰🪱🦠',
      '/emojis/🌈': '🟥🟧🟨🟩🟦🟪',
      '/emojis/rainbow': '🟥🟧🟨🟩🟦🟪',
    };
    writer.bulkInsert(input);
    for (const [k, v] of Object.entries(input)) {
      expect(writer.find(k)).toEqual(v);
    }
    // console.log('\nINPUT');
    // console.log(input);
    // console.log('\nOUTPUT');
    // console.log(writer.stringify());
    expect(writer.stringify().length).toBe(786);
    const reader = new PrefixTrieReader(writer.stringify());
    for (const [k, v] of Object.entries(input)) {
      expect(reader.find(k)).toEqual(v);
    }
  });
});

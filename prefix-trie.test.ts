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
});

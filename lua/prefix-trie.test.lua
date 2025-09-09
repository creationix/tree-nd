local PrefixTrie = require 'prefix-trie'
local assert = require 'luassert'
local inspect = require 'inspect'
local p = function(...)
  print(inspect(...))
end

-- Basic tests for encoding and decoding lines

-- Encode Line Tests
assert.same('', PrefixTrie.encodeLine {})
assert.same('/hello!/world!', PrefixTrie.encodeLine { hello = true, world = true })
assert.same(':/a!/b:', PrefixTrie.encodeLine { [0] = 0, a = true, b = 0 })
assert.same(':a/a!/b:a', PrefixTrie.encodeLine { [0] = 10, a = true, b = 10 })
assert.same(':1/:2/a:3/b:4', PrefixTrie.encodeLine { [0] = 1, [''] = 2, a = 3, b = 4 })
assert.same('/a:a/b:14/c:1e/d:28', PrefixTrie.encodeLine { a = 10, b = 20, c = 30, d = 40 })
assert.same(
  '/fancy\\/paths!/with\\\\slashes!',
  PrefixTrie.encodeLine { ['fancy/paths'] = true, [ [[with\slashes]] ] = true }
)
assert.same('/fancy\\:pants!/paths\\!!', PrefixTrie.encodeLine { ['fancy:pants'] = true, ['paths!'] = true })

-- Decode Line Tests
assert.same({}, PrefixTrie.decodeLine '')
assert.same({ hello = true, world = true }, PrefixTrie.decodeLine '/hello!/world!')
assert.same({ [0] = 0, a = true, b = 0 }, PrefixTrie.decodeLine ':/a!/b:')
assert.same({ [0] = 10, a = true, b = 10 }, PrefixTrie.decodeLine ':a/a!/b:a')
assert.same({ [0] = 1, [''] = 2, a = 3, b = 4 }, PrefixTrie.decodeLine ':1/:2/a:3/b:4')
assert.same({ a = 10, b = 20, c = 30, d = 40 }, PrefixTrie.decodeLine '/a:a/b:14/c:1e/d:28')
assert.same(
  { ['fancy/paths'] = true, [ [[with\slashes]] ] = true },
  PrefixTrie.decodeLine '/fancy\\/paths!/with\\\\slashes!'
)
assert.same({ ['fancy:pants'] = true, ['paths!'] = true }, PrefixTrie.decodeLine '/fancy\\:pants!/paths\\!!')

-- Insert into tries
local trie = PrefixTrie.new()
trie:insert('/hello/world', 1)
trie:insert('/hello/there', 2)
trie:insert('/goodbye/cruel/world', 3)
trie:insert('/goodbye/cruel/people', 4)
trie:insert('/goodbye/friend', 5)
trie:insert('/goodbye', 6)
p(trie)
assert.same(1, trie.hello.world[0])
assert.same(2, trie.hello.there[0])
assert.same(3, trie.goodbye.cruel.world[0])
assert.same(4, trie.goodbye.cruel.people[0])
assert.same(5, trie.goodbye.friend[0])
assert.same(6, trie.goodbye[0])
-- Find in tries
assert.same(1, trie:find '/hello/world')
assert.same(2, trie:find '/hello/there')
assert.same(3, trie:find '/goodbye/cruel/world')
assert.same(4, trie:find '/goodbye/cruel/people')
assert.same(5, trie:find '/goodbye/friend')
assert.same(6, trie:find '/goodbye')
assert.same(nil, trie:find '/hello')
assert.same(nil, trie:find '/goodbye/cruel')
assert.same(nil, trie:find '/goodbye/cruel/peoples')
assert.same(nil, trie:find '/goodbye/friends')
assert.same(nil, trie:find '/unknown/path')
-- Serialize trie to file
print(trie:stringify())

trie = PrefixTrie.new()
trie:bulkInsert {
  [''] = true,
  ['/'] = true,
  ['/a'] = true,
  ['/aa'] = true,
  ['/aa/'] = true,
  ['/aa/b'] = true,
  ['/aa/bb'] = true,
  ['/aa/bb/'] = true,
}
assert.same('!/!\n!/!/b!/bb:\n!/!/a!/aa:4\n', trie:stringify())

local input = {
  ['/poems/runes'] = 'ᚠᛇᚻ᛫ᛒᛦᚦ᛫ᚠᚱᚩᚠᚢᚱ᛫ᚠᛁᚱᚪ᛫ᚷᛖᚻᚹᛦᛚᚳᚢᛗ',
  ['/poems/middle/english'] = 'An preost wes on leoden, Laȝamon was ihoten',
  ['/poems/middle/deutsch'] = 'Sîne klâwen durh die wolken sint geslagen',
  ['/poems/ελληνικά'] = 'Τη γλώσσα μου έδωσαν ελληνική',
  ['/poems/русский'] = 'На берегу пустынных волн',
  ['/poems/russian'] = 'На берегу пустынных волн',
  ['/poems/ქართული'] = 'ვეპხის ტყაოსანი შოთა რუსთაველი',
  ['/poems/georgian'] = 'ვეპხის ტყაოსანი შოთა რუსთაველი',
  ['/poems/phonemic/𐐼𐐯𐑅𐐨𐑉𐐯𐐻'] = '𐐙𐐩𐑃 𐐺𐐨𐐮𐑍 𐑄 𐑁𐐲𐑉𐑅𐐻 𐐹𐑉𐐮𐑌𐑅𐐲𐐹𐐲𐑊 𐐮𐑌 𐑉𐐮𐑂𐐨𐑊𐐲𐐼 𐑉𐐮𐑊𐐮𐐾𐐲𐑌',
  ['/poems/phonemic/deseret'] = '𐐙𐐩𐑃 𐐺𐐨𐐮𐑍 𐑄 𐑁𐐲𐑉𐑅𐐻 𐐹𐑉𐐮𐑌𐑅𐐲𐐹𐐲𐑊 𐐮𐑌 𐑉𐐮𐑂𐐨𐑊𐐲𐐼 𐑉𐐮𐑊𐐮𐐾𐐲𐑌',
  ['/poems/phonemic/𐑖𐑱𐑝𐑰𐑩𐑯'] = '·𐑛𐑧𐑔 𐑦𐑥𐑐𐑤𐑲𐑟 𐑗𐑱𐑯𐑡 𐑯 𐑦𐑯𐑛𐑦𐑝𐑦𐑡𐑵𐑨𐑤𐑦𐑑𐑦;',
  ['/poems/phonemic/shavian'] = '·𐑛𐑧𐑔 𐑦𐑥𐑐𐑤𐑲𐑟 𐑗𐑱𐑯𐑡 𐑯 𐑦𐑯𐑛𐑦𐑝𐑦𐑡𐑵𐑨𐑤𐑦𐑑𐑦;',
  ['/emojis/smileys'] = '😂🫠😉☺️🥲😋🫣🤫🤔🫡',
  ['/emojis/animals/mammals'] = '🐵🐒🦍🦧🐶🐕🦮🐕‍🦺🐩🐺🦊',
  ['/emojis/animals/marine-animals'] = '🐳🐋🐬🦭🐟🐠🐡🦈🐙🐚🪸🪼',
  ['/emojis/animals/insects-and-bugs'] = '🐌🦋🐛🐜🐝🪲🐞🦗🪳🕷️🕸️🦂🦟🪰🪱🦠',
  ['/emojis/🌈'] = '🟥🟧🟨🟩🟦🟪',
  ['/emojis/rainbow'] = '🟥🟧🟨🟩🟦🟪',
}
trie = PrefixTrie.new()
trie:bulkInsert(input)
print(trie:stringify())

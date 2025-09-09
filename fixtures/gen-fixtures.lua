-- Run with Luvit: https://luvit.io/

local fs = require 'fs'
local readdirSync = fs.readdirSync
local readFileSync = fs.readFileSync
local writeFileSync = fs.writeFileSync
local json = require 'json'

local PrefixTrie = require '../lua/prefix-trie'

for _, file in ipairs(readdirSync '.') do
  if file:match '%.json$' then
    print('Processing fixtures ' .. file)
    local input = json.decode(readFileSync(file))
    local writer = PrefixTrie.new()
    writer:bulkInsert(input)
    local encoded = writer:stringify()
    writeFileSync(file:gsub('%.json$', '.pmap'), encoded)

    -- local reader = PrefixTrie.new(encoded)
    -- for key, expected in pairs(input) do
    --   local actual = reader:find(key)
    --   if tostring(actual) ~= tostring(expected) then
    --     error(
    --       string.format('Mismatch found for key "%s": expected %s, got %s', key, tostring(expected), tostring(actual))
    --     )
    --   end
    -- end
  end
end

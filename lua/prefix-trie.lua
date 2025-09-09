local inspect = require 'inspect'
local p = function(...)
  print(inspect(...))
end

-- TODO: use a proper JSON library if available
local function leaf_encode(val)
  local typ = type(val)
  if typ == 'string' then
    return string.format('%q', val)
  end
  if val == nil then
    return 'null'
  end
  if typ ~= 'table' then
    return tostring(val)
  end
  local i = 0
  local is_object = false
  for k in pairs(val) do
    i = i + 1
    if k ~= i then
      is_object = true
      break
    end
  end
  ---@type string[]
  local parts = {}
  local size = 0
  for k, v in pairs(val) do
    size = size + 1
    if is_object then
      parts[size] = string.format('%q:%s', k, leaf_encode(v))
    else
      parts[size] = leaf_encode(v)
    end
  end
  if is_object then
    return '{' .. table.concat(parts, ',') .. '}'
  else
    return '[' .. table.concat(parts, ',') .. ']'
  end
end

---@class PrefixTrie
local PrefixTrie = {}

-- `0` as a key means the node itself is also a leaf
-- `true` as a value means default value (or no value at all)
-- integer as a value is pointer to another line (node or leaf)
---@alias PrefixTrie.Line table<string|0,PrefixTrie.Ptr>

---@param ptr 0|integer
---@return string
local function encodePointer(ptr)
  if ptr == true then
    return '!'
  elseif ptr == 0 then
    return ':'
  elseif type(ptr) == 'number' then
    return string.format(':%x', ptr)
  else
    error('Unsupported pointer type: ' .. type(ptr))
  end
end

---@alias PrefixTrie.Ptr true|integer

--- Iterate over a table's string keys in sorted order
---@param val PrefixTrie.Line
---@return fun(): (string, PrefixTrie.Ptr)
local function entries(val)
  ---@type string[]
  local keys = {}
  local size = 0
  for key in pairs(val) do
    if type(key) == 'string' then
      size = size + 1
      keys[size] = key
    end
  end
  table.sort(keys)
  local i = 0
  ---@return string, true|integer
  return function()
    i = i + 1
    local key = keys[i]
    if key then
      return key, val[key]
    end
  end
end

---@param line PrefixTrie.Line
---@return string
function PrefixTrie.encodeLine(line)
  ---@type string[]
  local parts = {}
  local size = 0
  -- Encode the node's leaf pointer first if there is one
  local first = line[0]
  if first then
    size = size + 1
    parts[size] = encodePointer(first)
  end
  -- Then encode the entries sorted by key
  for key, child in entries(line) do
    local escapedKey = key:gsub('([:/!\\])', '\\%1')
    size = size + 1
    parts[size] = '/' .. escapedKey .. encodePointer(child)
  end
  return table.concat(parts)
end

--- Decode a line encoded with `encodeLine`
---@param str string
---@return PrefixTrie.Line
function PrefixTrie.decodeLine(str)
  ---@type PrefixTrie.Line
  local line = {}
  ---@type string|nil
  local key
  local offset = 1
  local len = #str
  while offset <= len do
    local c = string.byte(str, offset)
    if c == 47 then -- `/`
      -- Parse a prefix segment string
      offset = offset + 1
      local start = offset
      while offset <= len do
        local cc = string.byte(str, offset)
        if cc == 92 then -- backslash
          offset = offset + 2
        elseif cc == 47 or cc == 58 or cc == 33 then -- / : !
          break
        else
          offset = offset + 1
        end
      end
      key = string.sub(str, start, offset - 1):gsub('\\(.)', '%1')
    elseif c == 58 then -- `:`
      -- Parse a hex number (or empty for 0)
      offset = offset + 1
      local start = offset
      while offset <= len do
        local cc = string.byte(str, offset)
        if cc >= 48 and cc <= 57 or cc >= 65 and cc <= 70 or cc >= 97 and cc <= 102 then
          offset = offset + 1
        else
          break
        end
      end
      local val = string.sub(str, start, offset - 1)
      line[key or 0] = tonumber(val, 16) or 0
    elseif c == 33 then -- `!`
      offset = offset + 1
      line[key or 0] = true
    end
  end
  return line
end

--- Decode a URL-encoded strings
---@param hex string
local function hex_decode(hex)
  return string.char(tonumber(hex, 16))
end

--- Get the segments of a path as an iterator
---@param path string
---@return fun(): string|nil
local function get_segments(path)
  local itr = path:gmatch '/([^/]*)'
  return function()
    local val = itr()
    return val and val:gsub('%%(%x%x)', hex_decode)
  end
end

local NodeMeta = {}

function PrefixTrie.new()
  ---@type PrefixTrie.Node
  local self = {}
  setmetatable(self, NodeMeta)
  return self
end

---@alias JsonValue boolean|number|string|JsonArray|JsonObject|JsonNull
---@alias JsonArray JsonValue[]
---@alias JsonObject table<string, JsonValue>
---@alias JsonNull ffi.cdata*

---@class PrefixTrie.Node
---@field [0] JsonValue|nil
---@field [string] PrefixTrie.Node|nil
local Node = {}
PrefixTrie.Node = Node
NodeMeta.__index = Node

--- Insert a value into the trie
---@param path string
---@param value JsonValue any value that can be JSON encoded
function Node:insert(path, value)
  local node = self
  for segment in get_segments(path) do
    local child = node[segment] or {}
    node[segment] = child
    node = child
  end
  node[0] = value
end

--- Insert multiple values into the trie
---@param entries table<string, any> any values that can be JSON encoded
function Node:bulkInsert(entries)
  for path, value in pairs(entries) do
    self:insert(path, value)
  end
end

--- Find a value in the trie
---@param path string
---@return any|nil
function Node:find(path)
  local node = self
  for segment in get_segments(path) do
    node = node[segment]
    if not node then
      return nil
    end
  end
  return node[0]
end

function Node:stringify()
  ---@type string[]
  local lines = {}
  local offset = 0
  ---@type table<string, number>
  local seen_lines = {}

  ---@param line string
  local function push_line(line)
    local seen_offset = seen_lines[line]
    if seen_offset ~= nil then
      return seen_offset
    end
    local start = offset
    seen_lines[line] = start
    table.insert(lines, line .. '\n')
    offset = offset + #line + 1
    return start
  end

  local function push_leaf(value)
    if value == true then
      return true
    end
    local encoded = leaf_encode(value)
    return push_line(encoded)
  end

  --- Walk the trie and encode each node
  ---@param node PrefixTrie.Node
  ---@return number|true
  local function walkNode(node)
    if next(node) == 0 and next(node, 0) == nil then
      return push_leaf(node[0])
    end
    ---@type PrefixTrie.Line
    local line = {}
    for key, child in pairs(node) do
      line[key] = key == 0 and push_leaf(child) or walkNode(child)
    end
    return push_line(PrefixTrie.encodeLine(line))
  end

  walkNode(self)
  return table.concat(lines)
end

NodeMeta.__tostring = Node.stringify

return PrefixTrie

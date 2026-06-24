-- extract.lua
-- Loads pfQuest vanilla (ERA) data tables and emits lean JSON lookup files
-- for the RXP guide editor. Run with: lua5.3 extract.lua <pfquest_db_dir> <out_dir>
--
-- Output files (all keyed for fast name->id lookup, plus id->record):
--   quests.json  : { byName: {lowername: id}, byId: {id: {name, lvl, min, startU, endU, pre}} }
--   npcs.json    : { byName: {lowername: [ids]}, byId: {id: {name, coords:[[x,y,zone,zoneName],...]}} }
--   items.json   : { byName: {lowername: id}, byId: {id: name} }
--   zones.json   : { byId: {id: name}, byName: {lowername: id} }
--
-- Coordinates come pre-converted to map-percentage and zone-tagged by pfQuest.

local db_dir = arg[1] or "."
local out_dir = arg[2] or "."

-- ── Load pfQuest data into the global pfDB ──────────────────────────────
dofile(db_dir .. "/init.lua")
dofile(db_dir .. "/units.lua")
dofile(db_dir .. "/enUS/units.lua")
dofile(db_dir .. "/quests.lua")
dofile(db_dir .. "/enUS/quests.lua")
dofile(db_dir .. "/items.lua")
dofile(db_dir .. "/enUS/items.lua")
dofile(db_dir .. "/zones.lua")
dofile(db_dir .. "/enUS/zones.lua")

-- ── Minimal JSON encoder (handles our value types only) ─────────────────
local function json_escape(s)
  s = s:gsub('\\', '\\\\'):gsub('"', '\\"')
  s = s:gsub('\n', '\\n'):gsub('\r', '\\r'):gsub('\t', '\\t')
  return s
end

local function encode(v)
  local t = type(v)
  if t == "nil" then return "null"
  elseif t == "number" then
    -- keep integers clean, floats as-is
    if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
    return tostring(v)
  elseif t == "boolean" then return tostring(v)
  elseif t == "string" then return '"' .. json_escape(v) .. '"'
  elseif t == "table" then
    -- array if keys are 1..n contiguous
    local n = 0
    for _ in pairs(v) do n = n + 1 end
    local is_array = (n > 0)
    for i = 1, n do if v[i] == nil then is_array = false break end end
    local parts = {}
    if is_array then
      for i = 1, n do parts[#parts+1] = encode(v[i]) end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      -- object; sort keys for stable output
      local keys = {}
      for k in pairs(v) do keys[#keys+1] = k end
      table.sort(keys, function(a,b) return tostring(a) < tostring(b) end)
      for _, k in ipairs(keys) do
        parts[#parts+1] = '"' .. json_escape(tostring(k)) .. '":' .. encode(v[k])
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

local function write_file(path, content)
  local f = assert(io.open(path, "w"))
  f:write(content)
  f:close()
end

-- ── Filter helpers ──────────────────────────────────────────────────────
-- pfQuest vanilla data carries some private-server test pollution at low IDs
-- and entries with no usable English name. We drop:
--   * empty/nil names
--   * obvious test strings (GM-only markers, "OLD", "$T", "TEST", "(123)")
local function is_garbage_name(name)
  if not name or name == "" then return true end
  if name:match("Only GM can see") then return true end
  if name:match("^OLD") then return true end
  if name:match("%$T") then return true end          -- punk/test templating
  if name:match("NEW TEST") then return true end
  if name:match("TEST AGAIN") then return true end
  if name:match("%(123%)") then return true end
  if name:match("^Test ") then return true end
  if name:match("UNUSED") then return true end
  if name:match("%[DEP%]") then return true end
  if name:match("%[DEPRECATED%]") then return true end
  if name:match("PH%]?$") then return true end        -- placeholders ending PH
  return false
end

local function lc(s) return (s or ""):lower() end

-- ── ZONES ───────────────────────────────────────────────────────────────
local zonesById, zonesByName = {}, {}
for id, name in pairs(pfDB["zones"]["enUS"]) do
  if type(name) == "string" and name ~= "" then
    zonesById[id] = name
    zonesByName[lc(name)] = id
  end
end

-- ── NPCs / UNITS ─────────────────────────────────────────────────────────
local npcsById, npcsByName = {}, {}
local npc_count, coord_count = 0, 0
for id, name in pairs(pfDB["units"]["enUS"]) do
  if type(name) == "string" and not is_garbage_name(name) then
    local rec = { name = name }
    local data = pfDB["units"]["data"][id]
    if data and data["coords"] then
      local coords = {}
      for _, c in ipairs(data["coords"]) do
        -- pfQuest coord = { mapX, mapY, zoneId, respawn }
        local x, y, zone = c[1], c[2], c[3]
        if x and y and zone and zonesById[zone] then
          coords[#coords+1] = { x, y, zone, zonesById[zone] }
          coord_count = coord_count + 1
        end
      end
      if #coords > 0 then rec.coords = coords end
    end
    -- Faction/reaction: pfQuest "fac" lists factions the unit is FRIENDLY to
    -- ("A", "H", or "AH"). Absent ⇒ hostile to players. We store it so the
    -- picker can colour names FRIENDLY vs ENEMY (|cRXP_FRIENDLY_..| / _ENEMY_).
    if data and data["fac"] then rec.fac = data["fac"] end
    npcsById[id] = rec
    local key = lc(name)
    npcsByName[key] = npcsByName[key] or {}
    npcsByName[key][#npcsByName[key]+1] = id
    npc_count = npc_count + 1
  end
end

-- ── QUESTS ───────────────────────────────────────────────────────────────
local questsById, questsByName = {}, {}
local quest_count = 0
for id, loc in pairs(pfDB["quests"]["enUS"]) do
  local title = type(loc) == "table" and loc["T"] or nil
  if type(title) == "string" and not is_garbage_name(title) then
    local rec = { name = title }
    local data = pfDB["quests"]["data"][id]
    if data then
      if data["lvl"] then rec.lvl = data["lvl"] end
      if data["min"] then rec.min = data["min"] end
      -- start/end NPCs (U) — most useful for guides
      if data["start"] and data["start"]["U"] then rec.startU = data["start"]["U"] end
      if data["end"] and data["end"]["U"] then rec.endU = data["end"]["U"] end
      if data["pre"] then rec.pre = data["pre"] end
    end
    questsById[id] = rec
    local key = lc(title)
    -- multiple quests can share a name; keep a list
    questsByName[key] = questsByName[key] or {}
    questsByName[key][#questsByName[key]+1] = id
    quest_count = quest_count + 1
  end
end

-- ── ITEMS ────────────────────────────────────────────────────────────────
local itemsById, itemsByName = {}, {}
local item_count = 0
for id, name in pairs(pfDB["items"]["enUS"]) do
  if type(name) == "string" and not is_garbage_name(name) then
    itemsById[id] = name
    local key = lc(name)
    itemsByName[key] = itemsByName[key] or {}
    itemsByName[key][#itemsByName[key]+1] = id
    item_count = item_count + 1
  end
end

-- ── WRITE OUTPUT ─────────────────────────────────────────────────────────
write_file(out_dir .. "/zones.json", encode({ byId = zonesById, byName = zonesByName }))
write_file(out_dir .. "/npcs.json", encode({ byId = npcsById, byName = npcsByName }))
write_file(out_dir .. "/quests.json", encode({ byId = questsById, byName = questsByName }))
write_file(out_dir .. "/items.json", encode({ byId = itemsById, byName = itemsByName }))

print(string.format("Zones:  %d", (function() local n=0 for _ in pairs(zonesById) do n=n+1 end return n end)()))
print(string.format("NPCs:   %d  (%d coords)", npc_count, coord_count))
print(string.format("Quests: %d", quest_count))
print(string.format("Items:  %d", item_count))

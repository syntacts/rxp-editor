// gamedata.js — local WoW Classic (ERA) data lookup for the RXP editor.
//
// Replaces most live Wowhead web searches with instant, deterministic lookups
// against bundled pfQuest-derived data. Source data is GPLv3 (pfQuest by shagu);
// see data/LICENSE-pfQuest. Underlying game content © Blizzard.
//
// Data files live in ./data/*.json and are loaded lazily on first use so the
// editor's non-AI features (and initial page load) pay no cost for them.
//
// Public API (all synchronous after load()):
//   await GameData.load()                      -> preloads all tables
//   GameData.findQuest(name)                   -> { id, name, lvl, min, startU, endU } | null | Ambiguous
//   GameData.findNpc(name)                     -> { id, name, coords } | null | Ambiguous
//   GameData.findItem(name)                    -> { id, name } | null | Ambiguous
//   GameData.findZone(name)                    -> { id, name } | null
//   GameData.gotoFor(npcName)                  -> ".goto Zone,X,Y" string | null
//   GameData.resolve(type, name)               -> uniform resolver used by the AI tool bridge
//
// "Ambiguous" results carry { ambiguous: true, matches: [...] } so the caller
// (or the AI) can disambiguate rather than silently picking wrong.

let TABLES = null;       // { quests, npcs, items, zones }
let loadingPromise = null;

async function load() {
  if (TABLES) return TABLES;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const [quests, npcs, items, zones, spells, icons] = await Promise.all([
      import("./data/quests.json"),
      import("./data/npcs.json"),
      import("./data/items.json"),
      import("./data/zones.json"),
      import("./data/spells.json"),
      import("./data/icons.json"),
    ]);
    TABLES = {
      quests: quests.default || quests,
      npcs: npcs.default || npcs,
      items: items.default || items,
      zones: zones.default || zones,
      spells: spells.default || spells,
      icons: icons.default || icons,
    };
    return TABLES;
  })();
  return loadingPromise;
}

// ── Normalisation ──────────────────────────────────────────────────────────
// Lowercase, strip RXP colour/icon markup, collapse whitespace, drop a leading
// "the ". Mirrors how authors type names vs. how the DB stores them.
function norm(s) {
  if (!s) return "";
  return s
    .replace(/\|c[A-Z_]+_([^|]+)\|r/g, "$1")          // |cRXP_FRIENDLY_Name|r -> Name
    .replace(/\|T[^|]+\|t/g, "")                        // strip icon tokens
    .replace(/\[([^\]]+)\]/g, "$1")                     // [Item Name] -> Item Name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function stripLeadingThe(s) {
  return s.replace(/^the\s+/, "");
}

// Generic name resolver against a {byName, byId} table.
// Returns: null | record | { ambiguous, matches }
function resolve(table, rawName, hydrate) {
  if (!table) return null;
  const key = norm(rawName);
  if (!key) return null;

  let ids = table.byName[key];

  // Fallbacks: try without leading "the", then a unique substring match.
  if (!ids) ids = table.byName[stripLeadingThe(key)];
  if (!ids) {
    const hits = [];
    for (const name in table.byName) {
      if (name.includes(key) || key.includes(name)) {
        for (const id of table.byName[name]) hits.push(id);
        if (hits.length > 6) break;
      }
    }
    if (hits.length > 0) ids = hits;
  }

  if (!ids || ids.length === 0) return null;

  // Dedingle: usually a number[] but zones store a bare id.
  if (!Array.isArray(ids)) ids = [ids];
  const uniq = [...new Set(ids)];

  if (uniq.length === 1) return hydrate(uniq[0]);
  return {
    ambiguous: true,
    matches: uniq.slice(0, 8).map(hydrate),
  };
}

// ── Hydrators ───────────────────────────────────────────────────────────────
function hydrateQuest(id) {
  const r = TABLES.quests.byId[id];
  if (!r) return null;
  return { id: Number(id), name: r.name, lvl: r.lvl, min: r.min, startU: r.startU, endU: r.endU, pre: r.pre };
}
function hydrateNpc(id) {
  const r = TABLES.npcs.byId[id];
  if (!r) return null;
  return { id: Number(id), name: r.name, coords: r.coords || [] };
}
function hydrateItem(id) {
  const name = TABLES.items.byId[id];
  if (!name) return null;
  return { id: Number(id), name };
}
function hydrateZone(id) {
  const name = TABLES.zones.byId[id];
  if (!name) return null;
  return { id: Number(id), name };
}

// ── Public lookups ───────────────────────────────────────────────────────────
function findQuest(name) { return resolve(TABLES?.quests, name, hydrateQuest); }
function findNpc(name)   { return resolve(TABLES?.npcs, name, hydrateNpc); }
function findItem(name)  { return resolve(TABLES?.items, name, hydrateItem); }

// Spells resolve to a list of ranks (a name like "Rend" has Rank 1..7).
// Returns { name, ranks: [{id, rank, lvl}, ...] } | null. The AI is told to
// pick the rank whose level fits the guide's bracket.
function findSpell(name) {
  if (!TABLES?.spells) return null;
  const key = norm(name);
  if (!key) return null;
  let ranks = TABLES.spells.byName[key] || TABLES.spells.byName[stripLeadingThe(key)];
  if (!ranks) {
    // substring fallback for partial names
    for (const n in TABLES.spells.byName) {
      if (n === key) { ranks = TABLES.spells.byName[n]; break; }
    }
  }
  if (!ranks || ranks.length === 0) return null;
  const canon = TABLES.spells.byId[ranks[0].id];
  return { name: canon ? canon.name : name, ranks };
}

function findZone(name) {
  if (!TABLES?.zones) return null;
  const key = norm(name);
  const id = TABLES.zones.byName[key] ?? TABLES.zones.byName[stripLeadingThe(key)];
  return id != null ? hydrateZone(id) : null;
}

// Build an RXP `.goto` line for an NPC's primary spawn.
// Picks the spawn with the most points clustered in one zone (the "main" spawn)
// to avoid emitting a stray patrol coordinate.
function gotoFor(npcName) {
  const npc = findNpc(npcName);
  if (!npc || npc.ambiguous || !npc.coords || npc.coords.length === 0) return null;
  // coords: [x, y, zoneId, zoneName]
  // Prefer the zone that appears most often; within it take the first point.
  const byZone = {};
  for (const c of npc.coords) {
    const z = c[2];
    (byZone[z] = byZone[z] || []).push(c);
  }
  let best = null;
  for (const z in byZone) {
    if (!best || byZone[z].length > byZone[best].length) best = z;
  }
  const c = byZone[best][0];
  return `.goto ${c[3]},${c[0]},${c[1]}`;
}

// Uniform resolver for the AI tool bridge (see ai-tools.js).
// type: "quest" | "npc" | "item" | "zone"
function resolveByType(type, name) {
  switch (type) {
    case "quest": return findQuest(name);
    case "npc":   return findNpc(name);
    case "item":  return findItem(name);
    case "zone":  return findZone(name);
    case "spell": return findSpell(name);
    default:      return null;
  }
}

// Substring search for the inline mention picker. Returns up to `limit`
// ranked matches: { id, name, sub, insert } where `insert` is the RXP token
// to drop into the textarea for that entity type.
//   type: "npc" | "quest" | "item" | "spell" | "zone"
function search(type, query, limit = 8) {
  if (!TABLES) return [];
  const q = norm(query);
  if (q.length < 1) return [];

  // Icons are stored as {fileId: name}; search the names (values) directly.
  if (type === "icon") {
    const icons = TABLES.icons || {};
    const scored = [];
    for (const id in icons) {
      const name = icons[id];
      let rank;
      if (name === q) rank = 0;
      else if (name.startsWith(q)) rank = 1;
      else if (name.includes("_" + q)) rank = 2;
      else if (name.includes(q)) rank = 3;
      else continue;
      scored.push({ id, name, rank });
      if (scored.length > 600) break;
    }
    scored.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name));
    return scored.slice(0, limit).map(({ id, name }) => ({
      id: Number(id),
      name,
      sub: `icon ${id}`,
      iconId: Number(id),
      insertName: `|T${id}:0|t`,
      insertId: `|T${id}:0|t`,
      insertAdvanced: `|T${id}:0|t`,
    }));
  }

  const table = type === "zone" ? TABLES.zones
    : type === "npc" ? TABLES.npcs
    : type === "quest" ? TABLES.quests
    : type === "item" ? TABLES.items
    : type === "spell" ? TABLES.spells
    : null;
  if (!table) return [];

  // Rank: exact (0) > prefix (1) > word-boundary (2) > substring (3), then by name length.
  const scored = [];
  for (const name in table.byName) {
    let rank;
    if (name === q) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (name.includes(" " + q)) rank = 2;
    else if (name.includes(q)) rank = 3;
    else continue;
    scored.push({ name, rank });
    if (scored.length > 400) break; // cap scan work on very short queries
  }
  scored.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name));

  const out = [];
  const seen = new Set();
  for (const { name } of scored) {
    if (out.length >= limit) break;
    const entries = makeEntries(type, name);
    for (const e of entries) {
      if (out.length >= limit || seen.has(type + e.id)) continue;
      seen.add(type + e.id);
      out.push(e);
    }
  }
  return out;
}

// Build display + insertion rows for a matched name key.
// Each row carries THREE insert variants, chosen by which key the user presses:
//   insertName     → Enter        → just the display name
//   insertId       → Shift+Enter  → the ID (quests/items/spells) or .goto (NPCs)
//   insertAdvanced → Cmd/Ctrl+Ent → richer RXP snippet (commented ID / coloured name)
function makeEntries(type, nameKey) {
  const T = TABLES;
  if (type === "zone") {
    const id = T.zones.byName[nameKey];
    const name = T.zones.byId[id];
    return [{ id, name, sub: `zone ${id}`,
      insertName: name, insertId: name, insertAdvanced: name }];
  }
  if (type === "npc") {
    return (T.npcs.byName[nameKey] || []).map(id => {
      const r = T.npcs.byId[id];
      const c = r.coords && r.coords[0];
      // fac lists factions the NPC is friendly to (A/H/AH); absent ⇒ hostile.
      const friendly = !!r.fac;
      const colour = friendly ? "RXP_FRIENDLY" : "RXP_ENEMY";
      const coloured = `|c${colour}_${r.name}|r`;
      const goto = c ? `.goto ${c[3]},${c[0]},${c[1]}` : coloured;
      const sub = c
        ? `${friendly ? "friendly" : "hostile"} · ${c[3]} (${c[0]}, ${c[1]})`
        : `${friendly ? "friendly" : "hostile"} · NPC #${id}`;
      return {
        id, name: r.name, sub,
        insertName: r.name,
        insertId: goto,          // Shift+Enter → the .goto line
        insertAdvanced: coloured, // Cmd+Enter → coloured name token
      };
    });
  }
  if (type === "quest") {
    return (T.quests.byName[nameKey] || []).map(id => {
      const r = T.quests.byId[id];
      return {
        id, name: r.name, sub: `quest #${id}${r.lvl ? ` · lvl ${r.lvl}` : ""}`,
        insertName: r.name,
        insertId: String(id),
        insertAdvanced: `${id} >> Turn in ${r.name}`,
      };
    });
  }
  if (type === "item") {
    return (T.items.byName[nameKey] || []).map(id => {
      const name = T.items.byId[id];
      return {
        id, name, sub: `item #${id}`,
        insertName: name,
        insertId: String(id),
        insertAdvanced: `|cRXP_LOOT_${name}|r`,
      };
    });
  }
  if (type === "spell") {
    return (T.spells.byName[nameKey] || []).map(r => {
      const name = T.spells.byId[r.id]?.name || nameKey;
      const label = r.rank ? `${name} (${r.rank})` : name;
      // Advanced snippet keeps the rank so it's clear which rank was inserted
      // (the ID encodes it, but showing it makes the line self-documenting).
      const trainText = r.rank ? `Train ${name} (${r.rank})` : `Train ${name}`;
      return {
        id: r.id, name: label,
        sub: `${r.rank || "spell"}${r.lvl ? ` · lvl ${r.lvl}` : ""} · #${r.id}`,
        insertName: label,
        insertId: String(r.id),
        insertAdvanced: `${r.id} >> ${trainText}`,
      };
    });
  }
  return [];
}

// Resolve a WoW texture FileDataID (the number in |T236448:0|t) to a Wowhead
// icon image URL, or null if unknown. Used to render icons in names/titles.
function iconUrl(fileId, size = "small") {
  const name = TABLES?.icons?.[fileId] ?? TABLES?.icons?.[String(fileId)];
  if (!name) return null;
  return `https://wow.zamimg.com/images/wow/icons/${size}/${name}.jpg`;
}

const GameData = {
  load,
  findQuest, findNpc, findItem, findZone, findSpell,
  gotoFor,
  search,
  iconUrl,
  resolve: resolveByType,
  get loaded() { return !!TABLES; },
};

export default GameData;

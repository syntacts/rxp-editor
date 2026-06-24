// test/gamedata.test.mjs — validates the bundled game database against
// known-good reference values. Pure, deterministic, no API cost.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(here, "..", "src", "data", `${f}.json`), "utf8"));
const T = {
  quests: load("quests"), npcs: load("npcs"), items: load("items"),
  zones: load("zones"), spells: load("spells"),
};

// Mirror of gamedata.js name normalisation, so tests exercise the same keys.
function norm(s) {
  return (s || "")
    .replace(/\|c[A-Z_]+_([^|]+)\|r/g, "$1")
    .replace(/\|T[^|]+\|t/g, "")
    .replace(/\[([^\]]+)\]/g, "$1")
    .trim().toLowerCase().replace(/\s+/g, " ");
}

test("quest name → id (Counterattack! = 4021)", () => {
  assert.deepEqual(T.quests.byName[norm("Counterattack!")], [4021]);
  assert.equal(T.quests.byId["4021"].name, "Counterattack!");
});

test("quest carries level and start/end NPC", () => {
  const q = T.quests.byId["4021"];
  assert.equal(q.lvl, 20);
  assert.deepEqual(q.endU, [3389]); // Regthar Deathgate
});

test("npc name → id + spawn coords + zone (Regthar = 3389, Barrens)", () => {
  assert.deepEqual(T.npcs.byName[norm("Regthar Deathgate")], [3389]);
  const npc = T.npcs.byId["3389"];
  const [x, y, zoneId, zoneName] = npc.coords[0];
  assert.ok(Math.abs(x - 45.3) < 0.5 && Math.abs(y - 28.4) < 0.5, "coords near 45.3,28.4");
  assert.equal(zoneId, 17);
  assert.equal(zoneName, "The Barrens");
});

test("npc lookup strips RXP colour markup", () => {
  assert.deepEqual(T.npcs.byName[norm("|cRXP_FRIENDLY_Regthar Deathgate|r")], [3389]);
});

test("item name → id (Linen Cloth = 2589), bracket syntax tolerated", () => {
  assert.deepEqual(T.items.byName[norm("Linen Cloth")], [2589]);
  assert.deepEqual(T.items.byName[norm("[Linen Cloth]")], [2589]);
});

test("zone name ↔ id (The Barrens = 17)", () => {
  assert.equal(T.zones.byName[norm("The Barrens")], 17);
  assert.equal(T.zones.byId["17"], "The Barrens");
});

test("spell name → all ranks with levels (Rend, Sinister Strike)", () => {
  const rend = T.spells.byName["rend"];
  const r1 = rend.find(r => r.rank === "Rank 1");
  assert.equal(r1.id, 772, "Rend Rank 1 = spell 772");
  assert.equal(r1.lvl, 4);

  const ss = T.spells.byName["sinister strike"];
  assert.equal(ss.find(r => r.rank === "Rank 1").id, 1752);
  // ranks should be ordered ascending by rank number
  const nums = ss.map(r => parseInt((r.rank.match(/\d+/) || [0])[0], 10)).filter(Boolean);
  assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
});

test("spell professions expose tiers (Blacksmithing)", () => {
  const bs = T.spells.byName["blacksmithing"];
  const tiers = bs.map(r => r.rank);
  assert.ok(tiers.includes("Apprentice") && tiers.includes("Artisan"));
});

test("data volumes are in the expected ballpark (no silent truncation)", () => {
  assert.ok(Object.keys(T.quests.byId).length > 4000, "quests");
  assert.ok(Object.keys(T.npcs.byId).length > 9000, "npcs");
  assert.ok(Object.keys(T.items.byId).length > 15000, "items");
  assert.ok(Object.keys(T.spells.byId).length > 3000, "spells");
});

test("a clear miss returns no key (so the AI falls back to web_search)", () => {
  assert.equal(T.quests.byName["totally fake quest xyz"], undefined);
});

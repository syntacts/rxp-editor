// test/mention-insert.test.mjs — validates the three insertion variants the
// mention picker produces (Enter=name, Shift+Enter=id/.goto, Cmd+Enter=snippet).
// Reproduces makeEntries against the real data files. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(here, "..", "src", "data", `${f}.json`), "utf8"));
const T = { npcs: load("npcs"), quests: load("quests"), items: load("items"), spells: load("spells") };

// Mirror of gamedata.js makeEntries (kept in sync; the app imports the real one).
function makeEntries(type, nameKey) {
  if (type === "npc") {
    return (T.npcs.byName[nameKey] || []).map(id => {
      const r = T.npcs.byId[id];
      const c = r.coords && r.coords[0];
      const friendly = !!r.fac;
      const coloured = `|c${friendly ? "RXP_FRIENDLY" : "RXP_ENEMY"}_${r.name}|r`;
      const goto = c ? `.goto ${c[3]},${c[0]},${c[1]}` : coloured;
      return { id, name: r.name, insertName: r.name, insertId: goto, insertAdvanced: coloured };
    });
  }
  if (type === "quest") {
    return (T.quests.byName[nameKey] || []).map(id => {
      const r = T.quests.byId[id];
      return { id, name: r.name, insertName: r.name, insertId: String(id), insertAdvanced: `${id} >> Turn in ${r.name}` };
    });
  }
  if (type === "item") {
    return (T.items.byName[nameKey] || []).map(id => {
      const name = T.items.byId[id];
      return { id, name, insertName: name, insertId: String(id), insertAdvanced: `|cRXP_LOOT_${name}|r` };
    });
  }
  if (type === "spell") {
    return (T.spells.byName[nameKey] || []).map(r => {
      const name = T.spells.byId[r.id]?.name || nameKey;
      const trainText = r.rank ? `Train ${name} (${r.rank})` : `Train ${name}`;
      return { id: r.id, insertName: r.rank ? `${name} (${r.rank})` : name, insertId: String(r.id), insertAdvanced: `${r.id} >> ${trainText}` };
    });
  }
  return [];
}

test("NPC: Enter=name, Shift+Enter=.goto, Cmd+Enter=coloured (friendly)", () => {
  const e = makeEntries("npc", "regthar deathgate")[0];
  assert.equal(e.insertName, "Regthar Deathgate");
  assert.equal(e.insertId, ".goto The Barrens,45.3,28.4");
  assert.equal(e.insertAdvanced, "|cRXP_FRIENDLY_Regthar Deathgate|r");
});

test("NPC: hostile mob gets RXP_ENEMY colour", () => {
  // Hogger (448) has no faction → hostile.
  const e = makeEntries("npc", "hogger")[0];
  assert.match(e.insertAdvanced, /\|cRXP_ENEMY_Hogger\|r/);
});

test("Quest: Cmd+Enter builds '[id] >> Turn in [name]'", () => {
  const e = makeEntries("quest", "counterattack!")[0];
  assert.equal(e.insertName, "Counterattack!");
  assert.equal(e.insertId, "4021");
  assert.equal(e.insertAdvanced, "4021 >> Turn in Counterattack!");
});

test("Item: Shift+Enter=id, Cmd+Enter='|cRXP_LOOT_[name]|r'", () => {
  const e = makeEntries("item", "linen cloth")[0];
  assert.equal(e.insertId, "2589");
  assert.equal(e.insertAdvanced, "|cRXP_LOOT_Linen Cloth|r");
});

test("Spell: name carries rank; id is the rank's spell id; snippet includes rank", () => {
  const ranks = makeEntries("spell", "sinister strike");
  const r1 = ranks.find(e => e.insertName.includes("Rank 1"));
  assert.equal(r1.insertId, "1752");
  assert.equal(r1.insertAdvanced, "1752 >> Train Sinister Strike (Rank 1)");
});

// test/icons.test.mjs — icon trigger (*) detection + icon search/insert.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detectTrigger, TRIGGERS } from "../src/mention-trigger.js";

const here = dirname(fileURLToPath(import.meta.url));
const icons = JSON.parse(readFileSync(join(here, "..", "src", "data", "icons.json"), "utf8"));
const at = (t) => detectTrigger(t, t.length);

// Mirror of gamedata's icon search.
function norm(s) { return (s || "").trim().toLowerCase().replace(/\s+/g, " "); }
function searchIcons(query, limit = 8) {
  const q = norm(query); const scored = [];
  for (const id in icons) {
    const name = icons[id]; let rank;
    if (name === q) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (name.includes("_" + q)) rank = 2;
    else if (name.includes(q)) rank = 3;
    else continue;
    scored.push({ id: Number(id), name, rank });
    if (scored.length > 600) break;
  }
  scored.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length);
  return scored.slice(0, limit);
}

test("* maps to the icon type", () => {
  assert.equal(TRIGGERS["*"].type, "icon");
});

test("* triggers an icon search at a boundary", () => {
  assert.equal(at("*sword").type, "icon");
  assert.equal(at("*sword").query, "sword");
  assert.equal(at(">>*rune").type, "icon");
});

test("* does not trigger mid-word", () => {
  assert.equal(at("x*sword"), null);
});

test("icon names are searchable (sword, fireball)", () => {
  assert.ok(searchIcons("sword").length > 5);
  const fb = searchIcons("fireball");
  assert.ok(fb.some(r => r.name === "spell_fire_fireball"));
});

test("icon search yields a usable |T..|t insert token", () => {
  const r = searchIcons("spell_fire_fireball")[0];
  assert.equal(r.name, "spell_fire_fireball");
  assert.equal(`|T${r.id}:0|t`, `|T135807:0|t`);
});

test("the icon map covers the known example IDs", () => {
  assert.equal(icons["236448"], "achievement_character_human_male");
  assert.equal(icons["626005"], "classicon_rogue");
  assert.equal(icons["132155"], "ability_gouge");
});

// test/mention-trigger.test.mjs — unit tests for the inline mention picker's
// trigger detection. Pure logic, no DOM. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTrigger, TRIGGERS } from "../src/mention-trigger.js";

// Helper: detect at the end of the given text.
const at = (text) => detectTrigger(text, text.length);

test("each trigger char maps to the right entity type", () => {
  assert.equal(TRIGGERS["@"].type, "npc");
  assert.equal(TRIGGERS["#"].type, "quest");
  assert.equal(TRIGGERS[":"].type, "item");
  assert.equal(TRIGGERS["!"].type, "spell");
});

test("@ at start of line triggers an NPC search", () => {
  const r = at("@Regth");
  assert.equal(r.type, "npc");
  assert.equal(r.query, "Regth");
  assert.equal(r.start, 0);
});

test("trigger fires after RXP boundary chars (>>, space, paren, bracket)", () => {
  assert.equal(at(">>Talk to @Regth").type, "npc");
  assert.equal(at(".accept #Counter").type, "quest");
  assert.equal(at("(:Linen").type, "item");
});

test("trigger does NOT fire mid-word (prose like 'Note:' is safe)", () => {
  assert.equal(at("Note:"), null);          // ':' preceded by a letter
  assert.equal(at("email@home"), null);     // '@' preceded by a letter
});

test("query must start with a letter (so ':-)' etc. don't trigger)", () => {
  assert.equal(at(":-)"), null);
  assert.equal(at("@123"), null);
});

test("multi-word queries are allowed (spaces don't end the token)", () => {
  // "@Regthar Deathgate" stays a single live query so names with spaces work.
  const r = at("see @Regthar Deathgate");
  assert.equal(r.type, "npc");
  assert.equal(r.query, "Regthar Deathgate");
});

test("a newline ends the token even though spaces don't", () => {
  assert.equal(at("@Regthar\nDeathgate"), null);
});

test("directives/formatting stay single-word (a space ends them)", () => {
  // ".goto Elwynn" — the space after the directive ends the static token.
  assert.equal(at(".goto Elwynn"), null);
  assert.equal(at("~warn me now"), null);
});

test("an empty query (just the trigger) is reported with query='' for the hint row", () => {
  const r = at(">>@");
  assert.equal(r.type, "npc");
  assert.equal(r.query, "");
});

test("very long queries stop triggering (length guard)", () => {
  assert.equal(at("@" + "a".repeat(60)), null);
});

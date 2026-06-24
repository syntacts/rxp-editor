// test/mention.test.mjs — trigger detection for the inline mention picker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTrigger } from "../src/mention-trigger.js";

// Helper: detect at end of string.
const at = (s) => detectTrigger(s, s.length);

test("@ at start of line triggers an NPC search", () => {
  const t = at("@regth");
  assert.equal(t.type, "npc");
  assert.equal(t.query, "regth");
  assert.equal(t.start, 0);
});

test("# triggers a quest search after whitespace", () => {
  const t = at(".accept #counter");
  assert.equal(t.type, "quest");
  assert.equal(t.query, "counter");
});

test("! triggers a spell search", () => {
  const t = at(".train !sinist");
  assert.equal(t.type, "spell");
  assert.equal(t.query, "sinist");
});

test(": after '(' (a boundary) triggers an item search", () => {
  const t = at("(:linen");
  assert.equal(t.type, "item");
  assert.equal(t.query, "linen");
});

test("empty query right after the trigger char is allowed (menu hint)", () => {
  const t = at("see @");
  assert.equal(t.type, "npc");
  assert.equal(t.query, "");
});

test("prose colon does NOT trigger (Note: do this)", () => {
  // caret after "Note:" — query would have to start with a letter, and the
  // char after ':' here is a space, so no token forms.
  assert.equal(detectTrigger("Note: do this", 5), null);
});

test("trigger mid-word does NOT fire (email@host)", () => {
  assert.equal(at("email@host"), null);
});

test("multi-word query is allowed (names with spaces are searchable)", () => {
  // Spaces no longer close the menu; "regthar deathgate" stays a live query so
  // multi-word names can be searched. The consumer closes the menu only when a
  // multi-word query matches nothing.
  const t = at("@regthar deathgate");
  assert.equal(t.type, "npc");
  assert.equal(t.query, "regthar deathgate");
});

test("a newline always ends the token (trigger must be on the caret's line)", () => {
  assert.equal(at("@regthar\ndeathgate"), null);
});

test("only the trigger nearest the caret is used", () => {
  const t = at("@first then #second");
  assert.equal(t.type, "quest");
  assert.equal(t.query, "second");
});

test("runaway query (no trigger) returns null without scanning forever", () => {
  assert.equal(at("x".repeat(60)), null);
});

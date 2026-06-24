// test/snippets.test.mjs — tests for the static formatting (~) and directive (.)
// menus: trigger detection edge cases + snippet filtering. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTrigger } from "../src/mention-trigger.js";
import { searchStatic, CHAT_BUBBLE, DIRECTIVES } from "../src/snippets.js";

const at = (t) => detectTrigger(t, t.length);

test("~ opens the formatting menu at a boundary", () => {
  const r = at("~");
  assert.equal(r.static, true);
  assert.equal(r.kind, "format");
  assert.equal(r.query, "");
});

test("~ works after an RXP boundary (>>)", () => {
  assert.equal(at(">>Talk ~").kind, "format");
});

test(". opens the directive menu only at the start of a line", () => {
  assert.equal(at(".").kind, "directive");
  assert.equal(at("line1\n.tr").kind, "directive");
  assert.equal(at("line1\n.tr").query, "tr");
});

test(". does NOT trigger on a decimal mid-line (e.g. coordinates)", () => {
  assert.equal(at(".goto Elwynn,48.17"), null);
});

test(". does NOT trigger mid-line after other text", () => {
  assert.equal(at("some text .goto"), null);
});

test("~ filter matches the chat-bubble Talk-to snippet", () => {
  const rows = searchStatic("format", "bubble");
  const talk = rows.find(r => r.name.includes("Talk"));
  assert.ok(talk, "Talk-to snippet present");
  assert.equal(talk.insertName, ">>" + CHAT_BUBBLE + "Talk to ");
});

test("~ filter finds the warning token by keyword", () => {
  const rows = searchStatic("format", "warn");
  const warn = rows.find(r => r.name.toLowerCase().includes("warning"));
  assert.equal(warn.insertName, "|cRXP_WARN_|r");
  // cursor offset should land between the _ and |r
  assert.equal(warn.caret, "|cRXP_WARN_".length);
});

test("directive list exposes all core directives", () => {
  const names = DIRECTIVES.map(d => d.name);
  for (const d of [".goto", ".accept", ".turnin", ".train", ".hs", ".vendor", ".fly"]) {
    assert.ok(names.includes(d), `${d} present`);
  }
});

test(".turn filters to .turnin", () => {
  const rows = searchStatic("directive", "turn");
  assert.ok(rows.some(r => r.name === ".turnin"));
});

test("static snippets insert the same text in all three modes", () => {
  const r = searchStatic("directive", "goto")[0];
  assert.equal(r.insertName, r.insertId);
  assert.equal(r.insertId, r.insertAdvanced);
});

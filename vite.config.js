// test/guide.test.mjs — unit tests for the pure guide functions.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseGuide, extractStepType, buildGuideOutput, normalizeLines, computeDiff,
} from "../src/guide.js";

const here = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(here, "fixtures", "sample-guide.lua"), "utf8");

test("parseGuide splits the right number of steps", () => {
  const g = parseGuide(sample);
  assert.equal(g.steps.length, 4);
});

test("parseGuide captures the original title (incl. icon token)", () => {
  const g = parseGuide(sample);
  assert.equal(g.title, "Kamisayo |T236448:0|t Speedrun 1-14");
});

test("parseGuide keeps the header (class/faction/section directives)", () => {
  const g = parseGuide(sample);
  assert.match(g.header, /<< Rogue/);
  assert.match(g.header, /#name Northshire 1-6/);
});

test("parseGuide extracts the #name as the display name (not the RegisterGuide title)", () => {
  const block = `RXPGuides.RegisterGuide("Main Title",[[
<< Rogue
#name Kamisayo |T236448:0|t Speedrun 1-14
step
.hs
>>x
]])`;
  const g = parseGuide(block);
  assert.equal(g.title, "Main Title");
  assert.equal(g.name, "Kamisayo |T236448:0|t Speedrun 1-14");
});

test("extractStepType classifies steps correctly", () => {
  const g = parseGuide(sample);
  assert.equal(g.steps[0].type, "quest");   // .accept
  assert.equal(g.steps[1].type, "kill");    // .mob/.complete
  assert.equal(g.steps[2].type, "train");   // .train
  assert.equal(g.steps[3].type, "hearth");  // .hs
});

test("load → save round-trip preserves the title (regression: lossy export)", () => {
  const g = parseGuide(sample);
  const out = buildGuideOutput(g, {}, "some-other-filename.lua");
  // The exported title must be the ORIGINAL, not the filename.
  assert.match(out, /RegisterGuide\("Kamisayo \|T236448:0\|t Speedrun 1-14"/);
  // And a re-parse must yield the same step count + title (stable round-trip).
  const g2 = parseGuide(out);
  assert.equal(g2.title, g.title);
  assert.equal(g2.steps.length, g.steps.length);
});

test("buildGuideOutput applies edited step bodies", () => {
  const g = parseGuide(sample);
  const edited = { 0: ".goto Elwynn Forest,50,50\n>>EDITED STEP\n" };
  const out = buildGuideOutput(g, edited, "guide.lua");
  assert.match(out, />>EDITED STEP/);
  assert.doesNotMatch(out, /Deputy Willem/); // original step 0 text replaced
});

test("normalizeLines collapses CRLF and trailing whitespace", () => {
  assert.equal(normalizeLines("a  \r\nb\t\r\n\r\n"), "a\nb");
});

test("computeDiff marks an inserted line as add and a removed line as remove", () => {
  const d = computeDiff("a\nb\nc", "a\nB\nc");
  const adds = d.filter(x => x.type === "add").map(x => x.text);
  const removes = d.filter(x => x.type === "remove").map(x => x.text);
  assert.deepEqual(adds, ["B"]);
  assert.deepEqual(removes, ["b"]);
});

test("computeDiff treats CRLF-vs-LF-only changes as no diff", () => {
  const d = computeDiff("x\r\ny\r\nz", "x\ny\nz");
  assert.ok(d.every(x => x.type === "same"));
});

// test/multiguide.test.mjs — tests for parsing a .lua file with several
// RegisterGuide() blocks and recompiling them all. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuideFile, buildFullFileOutput } from "../src/guide.js";

const FILE = `-- My Hardcore Guides
RXPGuides.RegisterGuide("Guide A 1-6",[[
#name A
step
.goto Elwynn,10,20
>>First
]])

-- divider comment
RXPGuides.RegisterGuide("Guide B 6-12",[[
#name B
step
.hs
>>Hearth
]])
`;

test("parseGuideFile finds every RegisterGuide block", () => {
  const { guides } = parseGuideFile(FILE);
  assert.equal(guides.length, 2);
  assert.deepEqual(guides.map(g => g.title), ["Guide A 1-6", "Guide B 6-12"]);
});

test("each sub-guide parses its own steps", () => {
  const { guides } = parseGuideFile(FILE);
  assert.equal(guides[0].steps.length, 1);
  assert.equal(guides[1].steps.length, 1);
  assert.match(guides[0].steps[0].raw, /First/);
  assert.match(guides[1].steps[0].raw, /Hearth/);
});

test("segments preserve surrounding text (comments) in order", () => {
  const { segments } = parseGuideFile(FILE);
  const kinds = segments.map(s => s.type);
  assert.deepEqual(kinds, ["text", "guide", "text", "guide", "text"]);
  assert.match(segments[0].text, /My Hardcore Guides/);
  assert.match(segments[2].text, /divider comment/);
});

test("recompile keeps BOTH guides and the comments", () => {
  const { guides, segments } = parseGuideFile(FILE);
  const out = buildFullFileOutput(guides, {}, segments, "file.lua");
  assert.match(out, /Guide A 1-6/);
  assert.match(out, /Guide B 6-12/);
  assert.match(out, /My Hardcore Guides/);
  assert.match(out, /divider comment/);
  // Guide order preserved
  assert.ok(out.indexOf("Guide A 1-6") < out.indexOf("Guide B 6-12"));
});

test("an edit applies to the right guide only", () => {
  const { guides, segments } = parseGuideFile(FILE);
  const out = buildFullFileOutput(guides, { 1: { 0: ".hs\n>>EDITED\n" } }, segments, "file.lua");
  assert.match(out, /EDITED/);
  assert.match(out, /First/);            // guide A untouched
  assert.ok(!out.includes(">>Hearth")); // guide B step replaced
});

test("a single-guide file still works (one guide, no surrounding loss)", () => {
  const single = `RXPGuides.RegisterGuide("Solo",[[
#name Solo
step
.hs
>>Only
]])`;
  const { guides, segments } = parseGuideFile(single);
  assert.equal(guides.length, 1);
  const out = buildFullFileOutput(guides, {}, segments, "x.lua");
  assert.match(out, /Solo/);
  assert.match(out, /Only/);
});

test("a file with no RegisterGuide is treated as one editable guide", () => {
  const { guides } = parseGuideFile("step\n.hs\n>>raw");
  assert.equal(guides.length, 1);
  assert.equal(guides[0].steps.length, 1);
});

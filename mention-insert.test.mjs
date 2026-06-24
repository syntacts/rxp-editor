// test/ai-tools.test.mjs — exercises the SSE streaming parser in ai-tools.js
// against synthetic Anthropic Messages API event transcripts (no network, no
// API key). This is the only automated coverage of runAiEdit: the real call
// is otherwise only exercised manually against the live API (see README).
//
// Event shapes here are taken from Anthropic's published streaming examples
// (message_start/content_block_start/content_block_delta/content_block_stop/
// message_delta/message_stop), not guessed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { runAiEdit } from "../src/ai-tools.js";
import GameData from "../src/gamedata.js";

// GameData.load() dynamically imports the bundled .json files, which Vite
// handles transparently but plain `node --test` doesn't (no "type: json"
// import attribute) — same reason gamedata.test.mjs reads the JSON via fs
// instead. Stub it out here; runLocalLookup degrades to "no match" when the
// tables are empty, which is all these tests need (they check the plumbing
// around a lookup, not real game data).
let originalFetch, originalLoad;
before(() => {
  originalFetch = globalThis.fetch;
  originalLoad = GameData.load;
  GameData.load = async () => {};
});
after(() => {
  globalThis.fetch = originalFetch;
  GameData.load = originalLoad;
});

// Encode a sequence of event objects (each needs a `type`) into a fetch-like
// Response backed by a ReadableStream of SSE bytes.
function sseResponse(events) {
  const body = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return { ok: true, body: stream, json: async () => ({}) };
}

test("runAiEdit streams a local lookup round then a final <step> answer", async () => {
  // Round 1: model calls lookup_game_data; turn ends needing a tool_result.
  const round1 = sseResponse([
    { type: "message_start", message: { usage: { input_tokens: 100, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "lookup_game_data", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"type":"npc","name":"Nobody Real"}' } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 40 } },
    { type: "message_stop" },
  ]);

  // Round 2: model finalises with the <step> delimiter.
  const round2 = sseResponse([
    { type: "message_start", message: { usage: { input_tokens: 150, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "<step>\n.goto Durotar,1,2\n</step>" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } },
    { type: "message_stop" },
  ]);

  const responses = [round1, round2];
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return responses.shift();
  };

  const activity = [];
  const result = await runAiEdit({
    apiKey: "test-key",
    skillFile: "SKILL",
    userMsg: "test edit",
    onActivity: e => activity.push(e),
  });

  assert.equal(result.text, "<step>\n.goto Durotar,1,2\n</step>");
  assert.equal(result.rounds, 2);
  assert.equal(result.usage.input_tokens, 250);
  assert.equal(result.usage.output_tokens, 60);

  // The lookup activity must appear (it's emitted live, during round 1's
  // stream) — this is the behaviour the streaming rewrite exists for: a long
  // turn full of searches/lookups is no longer silent until the whole HTTP
  // response lands.
  assert.ok(activity.some(a => a.phase === "lookup"));
  assert.ok(activity.some(a => a.phase === "composing"));

  // Round 2's request must carry round 1's tool_result (addressed to the
  // right tool_use id) plus the format-drift reminder.
  const round2Request = calls[1];
  const toolResultMsg = round2Request.messages.find(
    m => Array.isArray(m.content) && m.content.some(b => b.type === "tool_result")
  );
  assert.ok(toolResultMsg);
  const toolResult = toolResultMsg.content.find(b => b.type === "tool_result");
  assert.equal(toolResult.tool_use_id, "toolu_1");
  assert.match(toolResult.content, /"found":false/);
  assert.ok(toolResultMsg.content.some(b => b.type === "text" && /Reminder/.test(b.text)));

  // web_search must be capped so a confused model can't spiral into dozens
  // of searches in one turn.
  const ws = round2Request.tools.find(t => t.name === "web_search");
  assert.equal(ws.max_uses, 5);
});

test("runAiEdit throws a clear error on max_tokens truncation instead of returning partial prose", async () => {
  const truncated = sseResponse([
    { type: "message_start", message: { usage: { input_tokens: 50, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "I looked up the quest and started checking the NPC loca" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 4000 } },
    { type: "message_stop" },
  ]);
  globalThis.fetch = async () => truncated;

  await assert.rejects(
    () => runAiEdit({ apiKey: "test-key", skillFile: "SKILL", userMsg: "test edit" }),
    /ran out of output space/
  );
});

test("runAiEdit surfaces a clean error for a non-stream HTTP failure (e.g. bad API key)", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    body: null,
    json: async () => ({ error: { message: "invalid x-api-key" } }),
  });

  await assert.rejects(
    () => runAiEdit({ apiKey: "bad-key", skillFile: "SKILL", userMsg: "test edit" }),
    /invalid x-api-key/
  );
});

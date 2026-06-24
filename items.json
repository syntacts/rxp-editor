// ai-tools.js — bridges the Anthropic Messages API to the local game database.
//
// Strategy: instead of letting the model call `web_search` for every quest/NPC/
// item ID (a $0.01 fee + thousands of compounding input tokens per lookup), we
// expose a local tool `lookup_game_data` backed by the bundled pfQuest data.
// The model calls it; we answer instantly from memory, no network, no fee.
//
// web_search is still attached as a *fallback* for the long tail (content the
// bundled DB doesn't carry, e.g. spell IDs, or a brand-new quest). Most edits
// resolve entirely against local data and never trigger a paid search. It's
// capped with `max_uses` so a confused model can't spiral into dozens of
// searches in a single turn — see ai-tools.js's MAX_WEB_SEARCHES.
//
// Prompt caching: the skill file (the large, stable system prompt) is marked as
// an ephemeral cache breakpoint, so after the first call its ~6k tokens bill at
// 0.1x instead of 1x on every subsequent edit.
//
// Streaming: every turn is requested with `stream: true` and parsed as
// server-sent events. This isn't just lower latency — it's what lets the
// activity feed show each web search / lookup AS IT HAPPENS. Without it, a
// turn where the model does several searches before responding would sit
// completely silent (no events at all) until the entire HTTP response lands,
// which is what made it look "stuck" with no visible progress.

import GameData from "./gamedata.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_WEB_SEARCHES = 5; // per turn — bounds cost and runaway research loops
const MAX_OUTPUT_TOKENS = 8000;

// Re-asserted on every tool-result round trip. Long research chains (several
// lookups/searches before answering) can make the model drift away from the
// strict output contract stated once at the start of the conversation — this
// keeps it anchored without resending the whole instruction each time.
const FORMAT_REMINDER =
  "Reminder: once you have everything you need, reply with ONLY the <step>...</step> " +
  "block — no narration before or after it, even after a long research chain.";

// Tool the model can call to resolve game data locally.
const LOOKUP_TOOL = {
  name: "lookup_game_data",
  description:
    "Look up World of Warcraft Classic (Era/Hardcore) game data by name from the " +
    "local database: quest IDs, NPC IDs and spawn coordinates, item IDs, spell IDs " +
    "(with all ranks), and zone names. ALWAYS use this before writing any quest ID, " +
    "NPC name, item ID, .train spell ID, or .goto coordinate. It is instant and " +
    "authoritative. For spells it returns every rank with its required level — pick " +
    "the rank that fits the guide's level. Only fall back to web_search if this " +
    "returns no match.",
  input_schema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["quest", "npc", "item", "zone", "spell"],
        description: "The kind of entity to look up.",
      },
      name: {
        type: "string",
        description: "The entity name as it appears in-game, e.g. 'Counterattack!', 'Regthar Deathgate', 'Linen Cloth', 'The Barrens', 'Sinister Strike'.",
      },
    },
    required: ["type", "name"],
  },
};

// Execute a local lookup and shape it into a compact tool_result string.
function runLocalLookup(input) {
  const { type, name } = input || {};
  const res = GameData.resolve(type, name);

  if (!res) {
    return {
      found: false,
      note: `No local match for ${type} "${name}". The name may be misspelled or be content outside Classic Era. You may try web_search as a last resort.`,
    };
  }
  if (res.ambiguous) {
    return {
      found: true,
      ambiguous: true,
      matches: res.matches,
      note: "Multiple matches. Pick the one whose level/zone fits the guide context.",
    };
  }

  // Single clean match. For NPCs, also hand back a ready-to-use .goto line.
  const out = { found: true, ...res };
  if (type === "npc") {
    const g = GameData.gotoFor(name);
    if (g) out.suggestedGoto = g;
  }
  return out;
}

// Build the system prompt as cacheable blocks.
function buildSystem(skillFile) {
  return [
    {
      type: "text",
      text: skillFile,
      cache_control: { type: "ephemeral" }, // cache the big stable skill file
    },
  ];
}

// Turn a local lookup + its result into a short, human-readable activity line
// for the UI feed (e.g. "Found NPC Regthar Deathgate → The Barrens (45.3, 28.4)").
function describeLookup(input, result) {
  const type = input?.type || "data";
  const name = input?.name || "";
  if (!result || result.found === false) {
    return { status: "miss", text: `No local match for ${type} "${name}" — checking the web` };
  }
  if (result.ambiguous) {
    return { status: "warn", text: `Several matches for "${name}" — picking by context` };
  }
  switch (type) {
    case "quest":
      return { status: "ok", text: `Found quest "${result.name}" (#${result.id})` };
    case "npc": {
      const g = result.suggestedGoto ? ` → ${result.suggestedGoto.replace(/^\.goto\s+/, "")}` : "";
      return { status: "ok", text: `Found NPC "${result.name}" (#${result.id})${g}` };
    }
    case "item":
      return { status: "ok", text: `Found item "${result.name}" (#${result.id})` };
    case "spell": {
      const n = result.ranks ? result.ranks.length : 0;
      return { status: "ok", text: `Found spell "${result.name}" (${n} rank${n !== 1 ? "s" : ""})` };
    }
    case "zone":
      return { status: "ok", text: `Confirmed zone "${result.name}"` };
    default:
      return { status: "ok", text: `Looked up "${name}"` };
  }
}

// Parse one SSE line ("data: {...}") into its JSON payload. Blank lines and
// "event: ..." lines (redundant with the JSON's own `type` field) are skipped.
function parseSseLine(line) {
  if (!line.startsWith("data:")) return null;
  const json = line.slice(5).trim();
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

// Stream one Messages API turn over SSE, emitting activity as each content
// block completes (rather than waiting for the whole response). Local
// `lookup_game_data` calls are resolved the instant their block finishes
// streaming, since the lookup itself is synchronous — no extra round trip.
//
// Returns { content, stopReason, usage, localResults } where `content` mirrors
// the non-streaming response's `content` array, and `localResults` is
// [{ id, json }] ready to send back as tool_result blocks.
async function streamTurn({ apiKey, skillFile, messages, tools, model, emit }) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
      // Required to call the Anthropic API directly from a browser (CORS).
      // Safe for local/personal use; if you ever host this for others, route
      // calls through a small backend proxy instead so the key isn't exposed.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystem(skillFile),
      tools,
      messages,
      stream: true,
    }),
  });

  if (!resp.ok || !resp.body) {
    let msg = `Request failed (${resp.status})`;
    try {
      const errBody = await resp.json();
      if (errBody?.error?.message) msg = errBody.error.message;
    } catch { /* body wasn't JSON — keep the generic message */ }
    throw new Error(msg);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const blocks = [];        // index -> { type, name?, id?, text?, input?, _json }
  const localResults = [];
  let stopReason = null;
  let usage = {};

  function mergeUsage(u) {
    if (!u) return;
    for (const k in u) {
      if (k === "server_tool_use" && u.server_tool_use) {
        usage.server_tool_use = { ...usage.server_tool_use, ...u.server_tool_use };
      } else {
        usage[k] = u[k];
      }
    }
  }

  function handleEvent(evt) {
    if (!evt || !evt.type) return;
    if (evt.type === "message_start") {
      mergeUsage(evt.message?.usage);
    } else if (evt.type === "content_block_start") {
      blocks[evt.index] = { ...evt.content_block, _json: "" };
    } else if (evt.type === "content_block_delta") {
      const b = blocks[evt.index];
      if (!b) return;
      if (evt.delta?.type === "text_delta") b.text = (b.text || "") + evt.delta.text;
      else if (evt.delta?.type === "input_json_delta") b._json += evt.delta.partial_json || "";
    } else if (evt.type === "content_block_stop") {
      const b = blocks[evt.index];
      if (!b) return;
      if (b._json) {
        try { b.input = JSON.parse(b._json); } catch { b.input = {}; }
      }
      delete b._json;

      // Emit the moment each block finishes — this is what makes searches and
      // lookups show up live instead of arriving in one batch after the whole
      // (possibly long) turn completes.
      if (b.type === "server_tool_use" && b.name === "web_search") {
        const q = b.input?.query;
        emit({ phase: "websearch", status: "ok", text: q ? `Searched the web for "${q}"` : "Searched the web" });
      } else if (b.type === "tool_use" && b.name === "lookup_game_data") {
        const result = runLocalLookup(b.input);
        const d = describeLookup(b.input, result);
        emit({ phase: "lookup", status: d.status, text: d.text });
        localResults.push({ id: b.id, json: JSON.stringify(result) });
      }
    } else if (evt.type === "message_delta") {
      if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
      mergeUsage(evt.usage);
    } else if (evt.type === "error") {
      throw new Error(evt.error?.message || "Stream error");
    }
    // "ping" / "message_stop" / unknown event types: nothing to do.
  }

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of raw.split("\n")) {
        const data = parseSseLine(line);
        if (data) handleEvent(data);
      }
    }
    if (done) break;
  }
  // Flush any trailing partial chunk that wasn't terminated by a blank line.
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      const data = parseSseLine(line);
      if (data) handleEvent(data);
    }
  }

  const content = blocks.filter(Boolean).map(({ _json, ...rest }) => rest);
  return { content, stopReason, usage, localResults };
}

// Run one AI edit with a local-first tool loop.
//   opts = { apiKey, skillFile, userMsg, model, maxToolRounds, allowWebSearch }
// Returns { text, usage, rounds, usedWebSearch }.
export async function runAiEdit(opts) {
  const {
    apiKey,
    skillFile,
    userMsg,
    model = "claude-sonnet-4-6",
    maxToolRounds = 6,
    allowWebSearch = true,
    onActivity = () => {},   // (event) => void — live progress feed
  } = opts;

  // Small helper so a missing/throwing callback never breaks an edit.
  const emit = (e) => { try { onActivity(e); } catch {} };

  await GameData.load();

  const tools = [LOOKUP_TOOL];
  if (allowWebSearch) tools.push({ type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES });

  const messages = [{ role: "user", content: userMsg }];
  let rounds = 0;
  let usedWebSearch = false;
  const usageTotals = { input_tokens: 0, output_tokens: 0,
                        cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
                        web_searches: 0 };

  while (rounds < maxToolRounds) {
    rounds++;
    emit({ phase: "thinking", round: rounds });

    const { content, stopReason, usage, localResults } = await streamTurn({
      apiKey, skillFile, messages, tools, model, emit,
    });

    // Accumulate usage for the cost meter.
    usageTotals.input_tokens += usage.input_tokens || 0;
    usageTotals.output_tokens += usage.output_tokens || 0;
    usageTotals.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
    usageTotals.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
    if (usage.server_tool_use?.web_search_requests) {
      usageTotals.web_searches += usage.server_tool_use.web_search_requests;
      usedWebSearch = true;
    }

    const localCalls = content.filter(b => b.type === "tool_use" && b.name === "lookup_game_data");

    if (localCalls.length === 0 || stopReason !== "tool_use") {
      // The model ran out of output budget before finishing — returning
      // whatever partial text it had wouldn't be a real step, just truncated
      // narration, so fail clearly instead of handing back garbage.
      if (stopReason === "max_tokens") {
        throw new Error(
          "The AI ran out of output space before finishing this edit (it likely did a lot of " +
          "research along the way). Try a more specific instruction, or split it into smaller edits."
        );
      }
      emit({ phase: "composing" });
      const text = content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
      return { text, usage: usageTotals, rounds, usedWebSearch };
    }

    // Echo the assistant turn, then answer each local tool call (already
    // resolved during streaming) plus a reminder to stay on the output format.
    messages.push({ role: "assistant", content });
    const toolResults = localResults.map(r => ({
      type: "tool_result",
      tool_use_id: r.id,
      content: r.json,
    }));
    toolResults.push({ type: "text", text: FORMAT_REMINDER });
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("AI made too many lookup rounds without finalising. Try a more specific instruction.");
}

export { LOOKUP_TOOL, runLocalLookup };

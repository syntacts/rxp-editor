// mention-trigger.js — pure logic for detecting an active mention trigger in a
// textarea's text. Kept React-free so it can be unit-tested in Node.

export const TRIGGERS = {
  "@": { type: "npc",   label: "NPC" },
  "#": { type: "quest", label: "Quest" },
  ":": { type: "item",  label: "Item" },
  "!": { type: "spell", label: "Spell" },
  "*": { type: "icon",  label: "Icon" },
};

// Static triggers open a fixed snippet menu (formatting / directives) rather
// than a database search. They carry a `kind` consumed by snippets.js.
export const STATIC = {
  "~": { kind: "format",    label: "Formatting" },
  ".": { kind: "directive", label: "Directive" },
};

// Find a trigger token immediately before the caret: a trigger char at a word
// boundary, followed by a query. The query MAY contain spaces (so multi-word
// names like "Regthar Deathgate" are searchable) but never a newline, and is
// capped at a few words so a whole prose sentence can't keep the menu alive.
// The caller closes the menu when a non-empty query matches nothing — that's
// what makes the menu dismiss naturally as you type past a real name.
// The query (if any) must start with a letter, so "Note: do this" etc. don't
// trigger. Returns { triggerChar, type|kind, label, query, start, static } or null.
const MAX_QUERY_WORDS = 5;
const MAX_QUERY_LEN = 50;

export function detectTrigger(text, caret) {
  let i = caret - 1;
  let query = "";
  let spaces = 0;
  while (i >= 0) {
    const ch = text[i];
    if (ch in TRIGGERS) {
      const prev = i > 0 ? text[i - 1] : "";
      const atBoundary = i === 0 || /[\s(>\[]/.test(prev);
      if (!atBoundary) return null;
      if (query.length > 0 && !/^[A-Za-z]/.test(query)) return null;
      return { triggerChar: ch, type: TRIGGERS[ch].type, label: TRIGGERS[ch].label, query, start: i };
    }
    if (ch in STATIC) {
      const prev = i > 0 ? text[i - 1] : "";
      // "." is special: it must be at the very start of a line (directives are
      // line-leading), so a decimal like "48.17" never opens the menu.
      // "~" just needs a normal boundary.
      const atLineStart = i === 0 || /[\r\n]/.test(prev);
      const atBoundary = i === 0 || /[\s(>\[]/.test(prev);
      const ok = ch === "." ? atLineStart : atBoundary;
      if (!ok) return null;
      // Directives/formatting tokens are single words — a space ends them.
      if (/ /.test(query)) return null;
      if (query.length > 0 && !/^[A-Za-z]/.test(query)) return null;
      return { triggerChar: ch, kind: STATIC[ch].kind, label: STATIC[ch].label, query, start: i, static: true };
    }
    // Newline (or tab) is always a hard boundary — the trigger must be on the
    // same line as the caret.
    if (/[\r\n\t]/.test(ch)) return null;
    if (ch === " ") {
      // A space right after the trigger char (e.g. "@ ") is not a query yet;
      // keep it so the empty-query hint shows. Otherwise count words.
      spaces++;
      if (spaces > MAX_QUERY_WORDS) return null;
    }
    if (query.length > MAX_QUERY_LEN) return null;
    query = ch + query;
    i--;
  }
  return null;
}

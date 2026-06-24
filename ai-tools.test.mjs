// guide.js — pure (React-free) functions for parsing, serialising, and diffing
// RXP guide files. Extracted from App.jsx so they can be unit-tested in Node.
//
// No DOM, no React, no side effects — every function here is a pure transform,
// which is exactly what makes them cheap to test exhaustively.

// ─── Parse .lua guide into { title, header, steps } ──────────────────────────
export function parseGuide(text) {
  // Normalize line endings first so all subsequent processing is consistent
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Strip the Lua wrapper AND capture the original title string. The title may
  // itself contain commas inside |T...|t icon tokens, so match a quoted string.
  const titleMatch = text.match(/RegisterGuide\(\s*"((?:[^"\\]|\\.)*)"\s*,/);
  const title = titleMatch ? titleMatch[1] : null;

  const innerMatch = text.match(/RegisterGuide\([^,]+,\s*\[\[([\s\S]*?)\]\]\s*\)/);
  const body = innerMatch ? innerMatch[1] : text;

  // Extract header (everything before first "step")
  const firstStep = body.search(/^\s*step\s*$/m);
  const header = firstStep >= 0 ? body.slice(0, firstStep) : "";
  const stepsBody = firstStep >= 0 ? body.slice(firstStep) : body;

  // The sub-guide's display name lives in a "#name …" line in the header.
  // This is the per-section name (e.g. "Kamisayo |T236448:0|t Speedrun 1-14"),
  // which is more specific than the RegisterGuide() title. Fall back to title.
  const nameMatch = header.match(/^\s*#name\s+(.+?)\s*$/m);
  const name = nameMatch ? nameMatch[1].trim() : title;

  // Split on "step" lines
  const rawSteps = stepsBody.split(/^step\s*$/m);
  const steps = rawSteps
    .filter(s => s.trim().length > 0)
    .map((content, i) => ({
      id: i,
      raw: content,
      label: extractStepLabel(content, i),
      type: extractStepType(content),
    }));

  return { title, name, header, steps, rawHeader: header };
}

// ─── Parse a whole .lua file that may hold MANY guides ───────────────────────
// A guide file often contains several RXPGuides.RegisterGuide("…",[[ … ]])
// calls back to back. We split them into separate guide objects while keeping
// any surrounding text (comments, blank lines, other code) so a load→save
// round-trip reproduces the whole file, not just the guides.
//
// Returns { guides: [parsedGuide…], segments: [...] } where `segments` is an
// ordered list used to rebuild the file: each is either
//   { type: "text", text }          — verbatim text between/around guides, or
//   { type: "guide", guideIndex }   — a placeholder for guides[guideIndex].
export function parseGuideFile(text) {
  const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const guides = [];
  const segments = [];
  let cursor = 0;

  // Walk the file finding each RegisterGuide( … [[ … ]] … ) call. We locate the
  // "[[" body delimiter and its matching "]]", then the closing ")".
  const callRe = /RXPGuides\.RegisterGuide\s*\(/g;
  let m;
  while ((m = callRe.exec(norm)) !== null) {
    const callStart = m.index;
    const open = norm.indexOf('[[', m.index);
    if (open === -1) break;
    const close = norm.indexOf(']]', open + 2);
    if (close === -1) break;
    // Find the ')' that closes the RegisterGuide call after ']]'.
    let paren = norm.indexOf(')', close + 2);
    if (paren === -1) paren = close + 2;
    const callEnd = paren + 1;

    // Verbatim text before this guide becomes a text segment.
    if (callStart > cursor) {
      segments.push({ type: 'text', text: norm.slice(cursor, callStart) });
    }

    const block = norm.slice(callStart, callEnd);
    const parsed = parseGuide(block);
    segments.push({ type: 'guide', guideIndex: guides.length });
    guides.push(parsed);

    cursor = callEnd;
    callRe.lastIndex = callEnd;
  }

  // Trailing text after the last guide.
  if (cursor < norm.length) {
    segments.push({ type: 'text', text: norm.slice(cursor) });
  }

  // If no RegisterGuide call was found, treat the whole thing as one guide so
  // the editor still works on raw/edge-case input.
  if (guides.length === 0) {
    const parsed = parseGuide(norm);
    guides.push(parsed);
    return { guides, segments: [{ type: 'guide', guideIndex: 0 }] };
  }

  return { guides, segments };
}

// Recompile the whole file: each guide rebuilt (with its own edits applied)
// and stitched back together with the preserved surrounding text.
//   guides       — array of parsed guides (possibly edited)
//   appliedByGuide — { [guideIndex]: { [stepId]: editedBody } }
//   segments     — from parseGuideFile
export function buildFullFileOutput(guides, appliedByGuide, segments, fallbackName = 'guide') {
  return segments.map(seg => {
    if (seg.type === 'text') return seg.text;
    const g = guides[seg.guideIndex];
    const applied = (appliedByGuide && appliedByGuide[seg.guideIndex]) || {};
    return buildGuideOutput(g, applied, fallbackName);
  }).join('');
}
// Pure: takes the parsed guide, the map of applied (edited) step bodies, and a
// fallback name. Preserves the original RegisterGuide title when present, so a
// load→save round-trip is lossless (icons in the title survive).
export function buildGuideOutput(guide, appliedSteps = {}, fallbackName = 'guide') {
  const steps = guide.steps
    .map(s => 'step\n' + (appliedSteps[s.id] ?? s.raw))
    .join('\n');
  const body = guide.header + steps;
  const title = guide.title || fallbackName.replace(/\.lua$/, '');
  return 'RXPGuides.RegisterGuide("' + title + '",[[\n' + body + '\n]])';
}

export function extractStepLabel(content, idx) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('.goto')) {
      const m = line.match(/\.goto\s+([^,]+),([0-9.]+),([0-9.]+)/);
      if (m) return `→ ${m[1].trim()} (${m[2]}, ${m[3]})`;
    }
    if (line.startsWith('.accept')) {
      const m = line.match(/\.accept\s+\d+\s*>>\s*(.+)/);
      if (m) return `✚ ${m[1].trim()}`;
    }
    if (line.startsWith('.turnin')) {
      const m = line.match(/\.turnin\s+[\d,]+\s*>>\s*(.+)/);
      if (m) return `✓ ${m[1].trim()}`;
    }
    if (line.startsWith('.train')) {
      const m = line.match(/\.train\s+\d+\s*>>\s*Train\s+[|T\d:0|t]*\[?([^\]|>]+)/);
      if (m) return `⚡ Train ${m[1].trim()}`;
      const m2 = line.match(/\.train\s+\d+\s*>>\s*(.+)/);
      if (m2) return `⚡ ${m2[1].trim()}`;
    }
    if (line.startsWith('.fly')) {
      const m = line.match(/\.fly\s+(\S+)/);
      if (m) return `✈ Fly ${m[1]}`;
    }
    if (line.startsWith('.hs')) return `🏠 Hearth`;
    if (line.startsWith('.xp')) {
      const m = line.match(/\.xp\s+(\d+)/);
      if (m) return `⬆ Grind to level ${m[1]}`;
    }
    if (line.startsWith('>>') || line.startsWith('+')) {
      const clean = line.replace(/^>>|\+/, '').replace(/\|c[A-Z_]+_([^|]+)\|r/g, '$1').replace(/\|T[^|]+\|t(\[[^\]]*\])?/g, '').trim();
      if (clean.length > 2) return clean.slice(0, 52) + (clean.length > 52 ? '…' : '');
    }
    if (line.startsWith('.complete')) {
      const m = line.match(/--(.+)/);
      if (m) return `◎ ${m[1].trim()}`;
    }
    if (line.startsWith('.mob')) {
      const m = line.match(/\.mob\s+\+?(.+)/);
      if (m) return `⚔ Kill ${m[1].trim()}`;
    }
  }
  return `Step ${idx + 1}`;
}

export function extractStepType(content) {
  if (content.includes('.hs') || content.includes('.home')) return 'hearth';
  if (content.includes('.fly ')) return 'flight';
  if (content.includes('.train ')) return 'train';
  if (content.includes('.accept ')) return 'quest';
  if (content.includes('.turnin ')) return 'turnin';
  if (content.includes('.vendor')) return 'vendor';
  if (content.includes('.mob ') || content.includes('.xp ')) return 'kill';
  if (content.includes('.goto')) return 'travel';
  if (content.includes('.bankdeposit') || content.includes('.bankwithdraw')) return 'bank';
  return 'other';
}

export function normalizeLines(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .trimEnd();
}

export function computeDiff(oldText, newText) {
  const oldLines = normalizeLines(oldText).split('\n');
  const newLines = normalizeLines(newText).split('\n');
  const result = [];

  const m = oldLines.length, n = newLines.length;
  const dp = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  for (let i = m-1; i >= 0; i--)
    for (let j = n-1; j >= 0; j--)
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);

  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: 'same', text: oldLines[i] });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) {
      result.push({ type: 'add', text: newLines[j] });
      j++;
    } else {
      result.push({ type: 'remove', text: oldLines[i] });
      i++;
    }
  }
  return result;
}

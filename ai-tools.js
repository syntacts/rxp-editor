import { useState, useRef } from "react";
import SKILL_FILE from "./skill.js";
import { runAiEdit } from "./ai-tools.js";
import { GuideSelect } from "./GuideSelect.jsx";
import { HelpModal } from "./HelpModal.jsx";
import GameData from "./gamedata.js";
import MentionPicker from "./MentionPicker.jsx";
import {
  parseGuide, parseGuideFile, extractStepLabel, extractStepType,
  buildGuideOutput, buildFullFileOutput, normalizeLines, computeDiff,
} from "./guide.js";



// Pure guide parse/serialise/diff helpers live in guide.js so they can be
// unit-tested without React. (parseGuide, extractStepLabel, extractStepType,
// buildGuideOutput, normalizeLines, computeDiff)

// ─── Strip RXP markup to readable HTML spans ─────────────────────────────────
function stripRxp(line) {
  return line
    .replace(/\|cRXP_WARN_([^|]+)\|r/g, '<span class="rxp-warn">$1</span>')
    .replace(/\|cRXP_FRIENDLY_([^|]+)\|r/g, '<span class="rxp-friendly">$1</span>')
    .replace(/\|cRXP_ENEMY_([^|]+)\|r/g, '<span class="rxp-enemy">$1</span>')
    .replace(/\|cRXP_LOOT_([^|]+)\|r/g, '<span class="rxp-loot">$1</span>')
    .replace(/\|cRXP_BUY_([^|]+)\|r/g, '<span class="rxp-buy">$1</span>')
    .replace(/\|cRXP_PICK_([^|]+)\|r/g, '<span class="rxp-pick">$1</span>')
    .replace(/\|Tinterface\/worldmap\/chatbubble_64grey\.blp:20\|t/g, '<span class="rxp-bubble" title="chat bubble">💬</span>')
    // Render numeric file-id icons as real images (falls back to the bracket
    // text if the icon id isn't in the map or the image fails to load).
    .replace(/\|T(\d+):0\|t(\[[^\]]*\])?/g, (_, id, bracket) => {
      const url = GameData.loaded ? GameData.iconUrl(Number(id)) : null;
      const img = url
        ? `<img src="${url}" class="rxp-inline-icon" style="width:16px;height:16px" onerror="this.style.display='none'" alt="" />`
        : '';
      return img + (bracket ? `<span class="rxp-icon">${bracket}</span>` : '');
    })
    .replace(/\|T[^|]+\|t/g, '');
}

// SVG icon helpers — approximating WoW UI icons
const ICON_ACCEPT = `<svg width="14" height="14" viewBox="0 0 14 14" style="display:inline;vertical-align:-2px;margin-right:4px"><text y="13" font-size="13" font-weight="900" fill="#f0c040">!</text></svg>`;
const ICON_TURNIN = `<svg width="14" height="14" viewBox="0 0 14 14" style="display:inline;vertical-align:-2px;margin-right:4px"><text y="13" font-size="13" font-weight="900" fill="#f0c040">?</text></svg>`;
const ICON_SWORDS = `<svg width="14" height="14" viewBox="0 0 16 16" style="display:inline;vertical-align:-2px;margin-right:4px" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="2" y1="14" x2="11" y2="5" stroke="#c0a060" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="14" x2="14" y2="5" stroke="#c0a060" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="5" x2="5" y2="8" stroke="#c0a060" stroke-width="1.5" stroke-linecap="round"/><line x1="14" y1="14" x2="11" y2="11" stroke="#c0a060" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_BAG = `<svg width="14" height="14" viewBox="0 0 16 16" style="display:inline;vertical-align:-2px;margin-right:4px" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="5" width="12" height="9" rx="2" fill="#7a5530" stroke="#a07040" stroke-width="1"/><path d="M5 5V4a3 3 0 0 1 6 0v1" stroke="#a07040" stroke-width="1.2" fill="none"/></svg>`;
const ICON_VENDOR = `<svg width="14" height="14" viewBox="0 0 16 16" style="display:inline;vertical-align:-2px;margin-right:4px" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="5" width="12" height="9" rx="2" fill="#7a5530" stroke="#a07040" stroke-width="1"/><path d="M5 5V4a3 3 0 0 1 6 0v1" stroke="#a07040" stroke-width="1.2" fill="none"/><circle cx="11" cy="10" r="2.5" fill="#d4a832" stroke="#f0c040" stroke-width="0.8"/></svg>`;
const ICON_CHAT = `<svg width="15" height="15" viewBox="0 0 16 16" style="display:inline;vertical-align:-3px;margin-right:4px" fill="none"><rect x="1" y="1" width="14" height="11" rx="3" fill="#3a4a6a" stroke="#6080b0" stroke-width="1"/><path d="M4 14l2-3h4l2 3" fill="#3a4a6a" stroke="#6080b0" stroke-width="1" stroke-linejoin="round"/><circle cx="5" cy="6.5" r="1" fill="#a0b8e0"/><circle cx="8" cy="6.5" r="1" fill="#a0b8e0"/><circle cx="11" cy="6.5" r="1" fill="#a0b8e0"/></svg>`;

// ─── (normalizeLines and computeDiff now imported from guide.js) ─────────────

// ─── Estimate API cost from usage (Sonnet 4.6 pricing, June 2026) ────────────
// Input $3 / output $15 per MTok; cache reads 0.1x input; cache writes 1.25x;
// web search $10 / 1,000 searches. Figures are estimates for a live meter.
function estimateCost(u) {
  if (!u) return 0;
  const IN = 3 / 1e6, OUT = 15 / 1e6;
  const freshIn = (u.input_tokens || 0) * IN;
  const cacheRead = (u.cache_read_input_tokens || 0) * IN * 0.1;
  const cacheWrite = (u.cache_creation_input_tokens || 0) * IN * 1.25;
  const out = (u.output_tokens || 0) * OUT;
  const search = (u.web_searches || 0) * 0.01;
  return freshIn + cacheRead + cacheWrite + out + search;
}

// ─── TYPE BADGE ──────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  quest:   { bg: '#2a3a1a', color: '#7ecb45', border: '#4a6a2a' },
  turnin:  { bg: '#1a2a3a', color: '#45a8cb', border: '#2a4a6a' },
  kill:    { bg: '#3a1a1a', color: '#cb4545', border: '#6a2a2a' },
  train:   { bg: '#2a1a3a', color: '#a845cb', border: '#4a2a6a' },
  travel:  { bg: '#1a2a2a', color: '#45cbaa', border: '#2a5a4a' },
  flight:  { bg: '#1a2830', color: '#60b0d0', border: '#2a4858' },
  hearth:  { bg: '#2a2210', color: '#d4a832', border: '#5a4820' },
  vendor:  { bg: '#2a2020', color: '#c07840', border: '#5a3820' },
  bank:    { bg: '#202030', color: '#8090c8', border: '#3040608' },
  other:   { bg: '#1e1e1e', color: '#888', border: '#333' },
};

const TYPE_LABELS = {
  quest: 'ACCEPT', turnin: 'TURN IN', kill: 'KILL', train: 'TRAIN',
  travel: 'TRAVEL', flight: 'FLIGHT', hearth: 'HEARTH', vendor: 'VENDOR',
  bank: 'BANK', other: 'STEP',
};

const APP_VERSION = '1.0.1';

// ─── Main component ───────────────────────────────────────────────────────────
function Editor() {
  const [guide, setGuide] = useState(null);
  // Multi-guide support: a .lua file can hold several RegisterGuide() blocks.
  // `guides` holds them all, `guide` (above) is the active one being edited,
  // `segments` preserves surrounding text for a faithful recompile, and
  // `appliedByGuide` keeps per-guide edits so switching guides doesn't lose work.
  const [guides, setGuides] = useState([]);
  const [segments, setSegments] = useState([]);
  const [activeGuideIndex, setActiveGuideIndex] = useState(0);
  const [appliedByGuide, setAppliedByGuide] = useState({});
  const [fileName, setFileName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | diff | error
  const [proposedStep, setProposedStep] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [appliedSteps, setAppliedSteps] = useState({});
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('rendered'); // rendered | raw
  const [copyMsg, setCopyMsg] = useState('');
  const [manualEdit, setManualEdit] = useState(false);
  const [headerText, setHeaderText] = useState('');
  const [headerDirty, setHeaderDirty] = useState(false);
  const [manualText, setManualText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sessionCost, setSessionCost] = useState(0);
  const [lastEditInfo, setLastEditInfo] = useState(null);
  const [aiActivity, setAiActivity] = useState([]);
  const [dataReady, setDataReady] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState('');
  const fileInputRef = useRef(null);
  const listRef = useRef(null);
  const textareaRef = useRef(null);

  const selectedStep = guide?.steps.find(s => s.id === selectedStepId);
  const currentRaw = selectedStep
    ? (appliedSteps[selectedStepId] !== undefined ? appliedSteps[selectedStepId] : selectedStep.raw)
    : null;

  // Filter steps
  const filteredSteps = guide?.steps.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.label.toLowerCase().includes(q) || s.raw.toLowerCase().includes(q);
  }) ?? [];

  // Shared by file upload and the sample-guide button: parse guide text and
  // load the first sub-guide as the active one.
  function loadGuideText(text, name) {
    setFileName(name);
    // Preload the game database so dropdown icons (and lookups) are ready.
    GameData.load().then(() => setDataReady(r => r + 1)).catch(() => {});
    const { guides: parsedGuides, segments: segs } = parseGuideFile(text);
    setGuides(parsedGuides);
    setSegments(segs);
    setActiveGuideIndex(0);
    setAppliedByGuide({});
    const first = parsedGuides[0];
    setGuide(first);
    setSelectedStepId(first?.steps[0]?.id ?? null);
    setAppliedSteps({});
    setStatus('idle');
    setProposedStep(null);
    setManualEdit(false);
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => loadGuideText(e.target.result, file.name);
    reader.readAsText(file);
  }

  function loadSampleGuide() {
    setSampleError('');
    setSampleLoading(true);
    fetch(`${import.meta.env.BASE_URL}demo-guide.lua`)
      .then(res => {
        if (!res.ok) throw new Error('not found');
        return res.text();
      })
      .then(text => loadGuideText(text, 'demo-guide.lua'))
      .catch(() => setSampleError("Couldn't load the sample guide — try again or load your own file."))
      .finally(() => setSampleLoading(false));
  }

  // Switch the active sub-guide, preserving edits made to the current one.
  function selectGuide(index) {
    if (index === activeGuideIndex) return;
    // Persist the current guide's edits (steps may have been reordered/deleted,
    // so save the up-to-date guide object too).
    setGuides(prev => prev.map((g, i) => (i === activeGuideIndex ? guide : g)));
    setAppliedByGuide(prev => ({ ...prev, [activeGuideIndex]: appliedSteps }));

    const target = guides[index];
    setActiveGuideIndex(index);
    setGuide(target);
    setAppliedSteps(appliedByGuide[index] || {});
    setSelectedStepId(target?.steps[0]?.id ?? null);
    setStatus('idle');
    setProposedStep(null);
    setManualEdit(false);
    setSearch('');
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function runEdit() {
    if (!selectedStep || !instruction.trim()) return;
    if (!apiKey.trim()) { setErrorMsg('Add your Anthropic API key (top right) to use AI editing.'); setStatus('error'); return; }
    setStatus('loading');
    setErrorMsg('');
    setProposedStep(null);
    setAiActivity([]);

    const stepsBefore = guide.steps.slice(Math.max(0, selectedStep.id - 2), selectedStep.id)
      .map(s => 'step\n' + (appliedSteps[s.id] ?? s.raw)).join('\n\n');
    const stepsAfter = guide.steps.slice(selectedStep.id + 1, selectedStep.id + 3)
      .map(s => 'step\n' + (appliedSteps[s.id] ?? s.raw)).join('\n\n');

    const userMsg = `You are editing an RXP speedrunning guide. Here is the context:

STEPS BEFORE (for context, do not edit these):
${stepsBefore || '(start of guide)'}

TARGET STEP TO EDIT (step index ${selectedStep.id + 1}):
step
${currentRaw}

STEPS AFTER (for context, do not edit these):
${stepsAfter || '(end of guide)'}

EDIT INSTRUCTION:
${instruction.trim()}

IMPORTANT LOOKUP RULES:
- Before writing any quest ID, NPC name, item ID, or .goto coordinate: call the lookup_game_data tool to get the real value from the local database. Do not guess.
- For quests: lookup_game_data type="quest" returns the quest ID (and its start/end NPCs).
- For NPC locations: lookup_game_data type="npc" returns the NPC ID, spawn coordinates, and a ready-to-use .goto line (suggestedGoto).
- For items: lookup_game_data type="item" returns the item ID.
- For spells (.train / .cast): lookup_game_data type="spell" returns every rank of the spell with its required level — choose the rank that matches the guide's level bracket.
- For zones: lookup_game_data type="zone" confirms the exact zone name.
- If a lookup returns no match, you may use web_search as a last resort.
- VENDOR/BUY/SELL PRICES: the local database does NOT contain gold/silver/copper prices. When the instruction needs a buy or sell price, use web_search with a precise query in this exact form: 'wowhead classic <item name> buy price' or 'wowhead classic <item name> sell price'. Do not make broad or vague searches — name the specific item and the word "buy price" or "sell price". Read the price from the Wowhead Classic item page. If you cannot find a precise price, write the step without inventing one.
- Only after confirming real IDs should you write the step.

OUTPUT FORMAT — follow exactly:
- Do NOT explain what you did. Do NOT describe your searches or reasoning. Do NOT add any prose before or after.
- Output ONLY the replacement step content, and wrap it in <step> and </step> tags.
- Inside the tags: raw RXP guide syntax only, starting from the line after "step" (do not include the word "step" itself). No markdown fences.
- Every ID you use must come from a tool result, not memory.

Example of a correct response:
<step>
.goto Durotar,42.1,68.3
>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Gornek|r
.turnin 783 >> Turn in Your Place In The World
</step>`;

    try {
      const result = await runAiEdit({
        apiKey,
        skillFile: SKILL_FILE,
        userMsg,
        model: "claude-sonnet-4-6",
        onActivity: (e) => {
          // Translate loop phases into feed lines. "thinking" updates a single
          // live status; lookups/searches append a checklist entry.
          if (e.phase === "thinking") {
            setAiActivity(a => [...a, {
              kind: "status",
              text: e.round === 1 ? "Reading the step and planning the edit…" : "Working…",
            }]);
          } else if (e.phase === "lookup" || e.phase === "websearch") {
            setAiActivity(a => [...a, {
              kind: e.phase === "websearch" ? "web" : "done",
              status: e.status,
              text: e.text,
            }]);
          } else if (e.phase === "composing") {
            setAiActivity(a => [...a, { kind: "status", text: "Writing the new step…" }]);
          }
        },
      });

      const rawText = (result.text || "").trim();
      if (!rawText) throw new Error('No output returned from AI. It may have only performed lookups — please try again.');

      // Update the session cost meter from real usage figures.
      const cost = estimateCost(result.usage);
      setSessionCost(c => c + cost);
      setLastEditInfo({
        cost,
        webSearches: result.usage.web_searches || 0,
        cachedTokens: result.usage.cache_read_input_tokens || 0,
        rounds: result.rounds,
      });

      // Prefer the explicit <step>…</step> delimiters the model is asked to use.
      // This reliably separates the step content from any stray narration.
      let clean;
      const delim = rawText.match(/<step>\s*([\s\S]*?)\s*<\/step>/i);
      if (delim) {
        clean = delim[1].trim();
      } else {
        // No <step> delimiter — the model didn't follow the output contract,
        // often because a long research chain pushed it off-format. Only
        // accept the response if it still looks like step content (strip
        // markdown fences / leading prose down to the first real line);
        // otherwise this is narration, and showing it as a "diff" risks the
        // user accepting prose as if it were a step.
        const lines = rawText.split('\n');
        const firstContentLine = lines.findIndex(l => {
          const t = l.trim();
          return t.startsWith('.') || t.startsWith('>>') || t.startsWith('+') || t.startsWith('--') || t.startsWith('#');
        });
        if (firstContentLine < 0) {
          throw new Error('The AI returned a description instead of step syntax. Try again — a more specific instruction usually avoids this.');
        }
        clean = lines.slice(firstContentLine).join('\n').replace(/```\s*$/m, '').trim();
      }
      // Safety: remove any stray <step> tags that slipped through.
      clean = clean.replace(/<\/?step>/gi, '').trim();

      setProposedStep(clean);
      setStatus('diff');
    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  }

  function acceptEdit() {
    if (proposedStep === null || selectedStepId === null) return;
    setAppliedSteps(prev => ({ ...prev, [selectedStepId]: proposedStep }));
    // Update label in guide
    setGuide(prev => ({
      ...prev,
      steps: prev.steps.map(s =>
        s.id === selectedStepId
          ? { ...s, raw: proposedStep, label: extractStepLabel(proposedStep, s.id), type: extractStepType(proposedStep) }
          : s
      ),
    }));
    setStatus('idle');
    setProposedStep(null);
    setInstruction('');
  }

  function rejectEdit() {
    setStatus('idle');
    setProposedStep(null);
  }

  // ─── Step management ────────────────────────────────────────────────────
  function applyRaw(id, raw) {
    // Shared helper: commit a raw step body to state and refresh the step label/type
    const cleaned = normalizeLines(raw);
    setAppliedSteps(prev => ({ ...prev, [id]: cleaned }));
    setGuide(prev => ({
      ...prev,
      steps: prev.steps.map(s =>
        s.id === id
          ? { ...s, raw: cleaned, label: extractStepLabel(cleaned, s.id), type: extractStepType(cleaned) }
          : s
      ),
    }));
  }

  function enterManualEdit() {
    if (!selectedStep) return;
    setManualText(currentRaw);
    setManualEdit(true);
    setStatus('idle');
    setProposedStep(null);
  }

  function saveManualEdit() {
    applyRaw(selectedStepId, manualText);
    setManualEdit(false);
  }

  function cancelManualEdit() {
    setManualEdit(false);
    setManualText('');
  }

  // Load the active guide's header into the editor when Setup is opened.
  function openHeaderEditor() {
    setHeaderText(guide?.header ?? '');
    setHeaderDirty(false);
  }

  // Re-parse the edited header so the derived name (and the dropdown) update,
  // then persist it onto the active guide.
  function saveHeader() {
    if (!guide) return;
    // Re-extract the #name from the edited header.
    const nameMatch = headerText.match(/^\s*#name\s+(.+?)\s*$/m);
    const newName = nameMatch ? nameMatch[1].trim() : guide.title;
    const updated = { ...guide, header: headerText, name: newName };
    setGuide(updated);
    setGuides(prev => prev.map((g, i) => (i === activeGuideIndex ? updated : g)));
    setHeaderDirty(false);
  }

  function deleteStep() {
    if (!guide || selectedStepId === null) return;
    const idx = guide.steps.findIndex(s => s.id === selectedStepId);
    const newSteps = guide.steps.filter(s => s.id !== selectedStepId);
    // Re-number ids sequentially so they stay dense
    const renumbered = newSteps.map((s, i) => ({ ...s, id: i }));
    // Fix up appliedSteps keys after renumber
    const newApplied = {};
    newSteps.forEach((s, i) => {
      if (appliedSteps[s.id] !== undefined) newApplied[i] = appliedSteps[s.id];
    });
    setGuide(prev => ({ ...prev, steps: renumbered }));
    setAppliedSteps(newApplied);
    const nextId = renumbered[Math.min(idx, renumbered.length - 1)]?.id ?? null;
    setSelectedStepId(nextId);
    setConfirmDelete(false);
    setStatus('idle');
    setProposedStep(null);
    setManualEdit(false);
  }

  function insertStepAfter(afterId) {
    if (!guide) return;
    const idx = guide.steps.findIndex(s => s.id === afterId);
    const insertAt = idx + 1;
    const blankRaw = '>>New step -- edit me\n';
    // Build new steps array with a placeholder inserted
    const before = guide.steps.slice(0, insertAt);
    const after = guide.steps.slice(insertAt);
    const combined = [
      ...before,
      { id: -1, raw: blankRaw, label: 'New step', type: 'other' },
      ...after,
    ].map((s, i) => ({ ...s, id: i }));
    // Re-key appliedSteps
    const newApplied = {};
    [...before, ...after].forEach((s, origIdx) => {
      const newIdx = origIdx < insertAt ? origIdx : origIdx + 1;
      if (appliedSteps[s.id] !== undefined) newApplied[newIdx] = appliedSteps[s.id];
    });
    setGuide(prev => ({ ...prev, steps: combined }));
    setAppliedSteps(newApplied);
    // Select and immediately open the new step in manual edit mode
    const newId = insertAt;
    setSelectedStepId(newId);
    setManualText(blankRaw);
    setManualEdit(true);
    setStatus('idle');
    setProposedStep(null);
  }

  function moveStep(fromId, direction) {
    if (!guide) return;
    const steps = guide.steps;
    const fromIdx = steps.findIndex(s => s.id === fromId);
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= steps.length) return;
    const newSteps = [...steps];
    [newSteps[fromIdx], newSteps[toIdx]] = [newSteps[toIdx], newSteps[fromIdx]];
    const renumbered = newSteps.map((s, i) => ({ ...s, id: i }));
    // Re-key appliedSteps
    const newApplied = {};
    newSteps.forEach((s, i) => {
      if (appliedSteps[s.id] !== undefined) newApplied[i] = appliedSteps[s.id];
    });
    setGuide(prev => ({ ...prev, steps: renumbered }));
    setAppliedSteps(newApplied);
    setSelectedStepId(toIdx); // follow the moved step
  }

  function exportGuide() {
    if (!guide) return;
    // Merge the active guide's live state + edits into the arrays before compiling.
    const allGuides = guides.map((g, i) => (i === activeGuideIndex ? guide : g));
    const allApplied = { ...appliedByGuide, [activeGuideIndex]: appliedSteps };
    const output = buildFullFileOutput(allGuides, allApplied, segments, fileName);
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'guide.lua';
    a.click();
    URL.revokeObjectURL(url);
    setCopyMsg('Downloaded!');
    setTimeout(() => setCopyMsg(''), 2000);
  }

  const editedCount = Object.keys(appliedSteps).length;

  // ─── Semantic step preview ───────────────────────────────────────────────
  function StepPreview({ raw }) {
    const lines = raw.split('\n');

    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 13, lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {lines.map((line, i) => {
          const t = line.trim();
          if (!t) return null;

          // ── Step modifiers (#label, #completewith, #loop) ──────────────
          if (t.startsWith('#')) {
            return (
              <div key={i} style={{ fontSize: 11, color: '#a080e0', fontStyle: 'italic', paddingLeft: 4 }}>
                {t}
              </div>
            );
          }

          // ── "step" keyword ─────────────────────────────────────────────
          if (t === 'step') {
            return (
              <div key={i} style={{ color: '#c9963a', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', paddingBottom: 2 }}>
                STEP
              </div>
            );
          }

          // ── Disabled directives (---) ──────────────────────────────────
          if (t.startsWith('---')) {
            return (
              <div key={i} style={{ color: '#3a3020', fontSize: 11, fontFamily: 'monospace' }}>
                {t}
              </div>
            );
          }

          // ── Comments (--) ──────────────────────────────────────────────
          if (t.startsWith('--')) {
            return (
              <div key={i} style={{ color: '#4a5a38', fontSize: 11, fontStyle: 'italic', fontFamily: 'monospace' }}>
                {t}
              </div>
            );
          }

          // ── + Warning / note lines ─────────────────────────────────────
          if (t.startsWith('+')) {
            const body = t.slice(1).trim();
            const html = stripRxp(body);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '3px 0' }}>
                {/* Round checkbox-style bullet matching WoW RXP UI */}
                <span style={{
                  flexShrink: 0, width: 14, height: 14, marginTop: 3,
                  borderRadius: '50%', border: '2px solid #c9963a',
                  background: 'rgba(201,150,58,0.12)', display: 'inline-block'
                }} />
                <span style={{ color: '#e8a020', fontWeight: 500 }}
                  dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            );
          }

          // ── >> Instruction lines ───────────────────────────────────────
          if (t.startsWith('>>')) {
            const body = t.slice(2).trim();
            // Detect NPC chat line (has chatbubble texture)
            const isChat = body.includes('chatbubble_64grey');
            const cleaned = body.replace(/\|Tinterface\/worldmap\/chatbubble_64grey\.blp:20\|t/g, '');
            const html = stripRxp(cleaned);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, paddingLeft: 4, marginBottom: 1 }}>
                {isChat
                  ? <span dangerouslySetInnerHTML={{ __html: ICON_CHAT }} />
                  : <span style={{ color: '#666', flexShrink: 0, marginTop: 2 }}>›</span>
                }
                <span style={{ color: '#c8d8b0' }} dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            );
          }

          // ── Directives (.xxx) ──────────────────────────────────────────
          if (t.startsWith('.')) {
            // .accept — yellow ! icon
            if (t.startsWith('.accept')) {
              const m = t.match(/\.accept\s+[\d,]+\s*>>\s*(.+)/);
              const label = m ? stripRxp(m[1].trim()) : t;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, marginBottom: 1 }}>
                  <span dangerouslySetInnerHTML={{ __html: ICON_ACCEPT }} />
                  <span style={{ color: '#f0d060', fontWeight: 600, fontSize: 12 }}
                    dangerouslySetInnerHTML={{ __html: label }} />
                </div>
              );
            }

            // .turnin — yellow ? icon
            if (t.startsWith('.turnin')) {
              const m = t.match(/\.turnin\s+[\d,]+\s*>>\s*(.+)/);
              const label = m ? stripRxp(m[1].trim()) : t;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, marginBottom: 1 }}>
                  <span dangerouslySetInnerHTML={{ __html: ICON_TURNIN }} />
                  <span style={{ color: '#f0d060', fontWeight: 600, fontSize: 12 }}
                    dangerouslySetInnerHTML={{ __html: label }} />
                </div>
              );
            }

            // .train — purple ⚡ with spell name
            if (t.startsWith('.train')) {
              const m = t.match(/\.train\s+[\d,]+\s*>>\s*Train\s+(.+)/i)
                      || t.match(/\.train\s+[\d,]+\s*>>\s*(.+)/);
              const label = m ? stripRxp(m[1].trim()) : t;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, marginBottom: 1 }}>
                  <span style={{ color: '#b070f0', fontSize: 13 }}>⚡</span>
                  <span style={{ color: '#c090f8', fontSize: 12 }}
                    dangerouslySetInnerHTML={{ __html: label }} />
                </div>
              );
            }

            // .complete — kill (swords) or collect (bag) depending on comment
            if (t.startsWith('.complete')) {
              const commentMatch = t.match(/--(.+)/);
              const comment = commentMatch ? commentMatch[1].trim() : '';
              const isKill = /kill/i.test(comment);
              const icon = isKill ? ICON_SWORDS : ICON_BAG;
              const label = comment || t.replace(/\.complete\s+[\d,]+/, '').trim();
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, marginBottom: 1 }}>
                  <span dangerouslySetInnerHTML={{ __html: icon }} />
                  <span style={{ color: '#b0a080', fontSize: 12 }}>{label}</span>
                </div>
              );
            }

            // .collect — bag icon
            if (t.startsWith('.collect')) {
              const commentMatch = t.match(/--(.+)/);
              const label = commentMatch ? commentMatch[1].trim() : t;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, marginBottom: 1 }}>
                  <span dangerouslySetInnerHTML={{ __html: ICON_BAG }} />
                  <span style={{ color: '#b0a080', fontSize: 12 }}>{label}</span>
                </div>
              );
            }

            // .vendor — bag+coin icon
            if (t.startsWith('.vendor')) {
              const m = t.match(/\.vendor\s*>>\s*(.+)/);
              const label = m ? stripRxp(m[1].trim()) : 'Vendor trash';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, marginBottom: 1 }}>
                  <span dangerouslySetInnerHTML={{ __html: ICON_VENDOR }} />
                  <span style={{ color: '#c09060', fontSize: 12 }}>{label}</span>
                </div>
              );
            }

            // .fly — flight path
            if (t.startsWith('.fly')) {
              const m = t.match(/\.fly\s+(\S+)(?:\s*>>\s*(.+))?/);
              const label = m ? (m[2] ? stripRxp(m[2].trim()) : 'Fly to ' + m[1]) : t;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, marginBottom: 1 }}>
                  <span style={{ fontSize: 13 }}>✈</span>
                  <span style={{ color: '#60b0d0', fontSize: 12 }}
                    dangerouslySetInnerHTML={{ __html: label }} />
                </div>
              );
            }

            // .hs — hearth
            if (t.startsWith('.hs')) {
              const m = t.match(/\.hs\s*>>\s*(.+)/);
              const label = m ? m[1].trim() : 'Hearth';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, marginBottom: 1 }}>
                  <span style={{ fontSize: 13 }}>🏠</span>
                  <span style={{ color: '#d4a832', fontSize: 12 }}>{label}</span>
                </div>
              );
            }

            // .goto — navigation (shown subtly, not as prominent as player actions)
            if (t.startsWith('.goto')) {
              const m = t.match(/\.goto\s+([^,]+),([0-9.]+),([0-9.]+)/);
              if (m) {
                const inline = t.match(/>>(.*)/);
                const note = inline ? ' — ' + stripRxp(inline[1].trim()) : '';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 8, marginBottom: 0 }}>
                    <span style={{ color: '#445544', fontSize: 11 }}>→</span>
                    <span style={{ color: '#607060', fontSize: 11, fontFamily: 'monospace' }}>
                      {m[1].trim()} ({m[2]}, {m[3]}){note}
                    </span>
                  </div>
                );
              }
            }

            // .xp — level grind
            if (t.startsWith('.xp')) {
              const m = t.match(/\.xp\s+(\d+)/);
              const inline = t.match(/>>(.*)/);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, marginBottom: 1 }}>
                  <span style={{ color: '#a0d060', fontSize: 12 }}>⬆</span>
                  {inline
                    ? <span style={{ color: '#a0d060', fontSize: 12 }}
                        dangerouslySetInnerHTML={{ __html: stripRxp(inline[1].trim()) }} />
                    : <span style={{ color: '#a0d060', fontSize: 12 }}>Grind to level {m ? m[1] : ''}</span>}
                </div>
              );
            }

            // .mob — tracked mobs (shown as small grey tags)
            if (t.startsWith('.mob')) {
              const m = t.match(/\.mob\s+\+?(.+)/);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 8, marginBottom: 0 }}>
                  <span style={{ color: '#602020', fontSize: 11 }}>⚔</span>
                  <span style={{ color: '#804040', fontSize: 11 }}>{m ? m[1] : ''}</span>
                </div>
              );
            }

            // .target — shown subtly
            if (t.startsWith('.target')) {
              return null; // target lines add visual noise in preview
            }

            // .use / .home / .skill / .cast / .zone / .subzone etc — compact
            const directiveMatch = t.match(/^\.([a-z]+)(.*)/i);
            const dName = directiveMatch ? directiveMatch[1] : '';
            const dRest = directiveMatch ? directiveMatch[2].trim() : t;
            const inlineLabel = dRest.match(/>>(.*)/);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 8, marginBottom: 0 }}>
                <span style={{ color: '#4a6040', fontSize: 11, fontFamily: 'monospace', minWidth: 40 }}>.{dName}</span>
                {inlineLabel
                  ? <span style={{ color: '#708060', fontSize: 11 }}
                      dangerouslySetInnerHTML={{ __html: stripRxp(inlineLabel[1].trim()) }} />
                  : <span style={{ color: '#3a4830', fontSize: 11, fontFamily: 'monospace' }}>{dRest.replace(/>>.*/,'').trim()}</span>
                }
              </div>
            );
          }

          // ── Fallback ───────────────────────────────────────────────────
          return (
            <div key={i} style={{ color: '#666', fontSize: 12 }}
              dangerouslySetInnerHTML={{ __html: stripRxp(t) }} />
          );
        })}
      </div>
    );
  }

  function DiffView({ oldRaw, newRaw }) {
    const diff = computeDiff(
      'step\n' + oldRaw,
      'step\n' + newRaw
    );
    return (
      <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}>
        {diff.map((d, i) => (
          <div key={i} style={{
            background: d.type === 'add' ? 'rgba(80,180,80,0.13)' : d.type === 'remove' ? 'rgba(220,60,60,0.13)' : 'transparent',
            color: d.type === 'add' ? '#7ecb6a' : d.type === 'remove' ? '#cb6a6a' : '#aaa',
            paddingLeft: 24,
            position: 'relative',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            <span style={{
              position: 'absolute', left: 6, fontWeight: 700,
              color: d.type === 'add' ? '#7ecb6a' : d.type === 'remove' ? '#cb6a6a' : '#444',
            }}>
              {d.type === 'add' ? '+' : d.type === 'remove' ? '−' : ' '}
            </span>
            {d.text || '\u00a0'}
          </div>
        ))}
      </div>
    );
  }

  // ─── Upload screen ────────────────────────────────────────────────────────
  if (!guide) {
    return (
      <div style={{ minHeight: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '40px 24px' }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600&display=swap');
          body { background: transparent; }
          .drop-zone {
            width: 100%; max-width: 460px;
            border: 1.5px dashed #4a3a20;
            border-radius: 12px;
            padding: 48px 32px;
            text-align: center;
            cursor: pointer;
            background: rgba(30,22,10,0.6);
            transition: border-color 0.2s, background 0.2s;
          }
          .drop-zone:hover { border-color: #c9963a; background: rgba(40,30,12,0.8); }
          .upload-btn {
            display: inline-block;
            margin-top: 16px;
            padding: 10px 28px;
            background: #c9963a;
            color: #0e0b06;
            border-radius: 6px;
            font-weight: 700;
            font-size: 13px;
            letter-spacing: 0.08em;
            cursor: pointer;
            border: none;
            transition: background 0.15s;
          }
          .upload-btn:hover { background: #e0b050; }
        `}</style>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 22, color: '#c9963a', letterSpacing: '0.06em', textAlign: 'center' }}>
          RXP Guide Editor
        </div>
        <div style={{ color: '#555', fontSize: 11, fontFamily: 'monospace', marginTop: -16 }}>
          v{APP_VERSION}
        </div>
        <div style={{ color: '#888', fontSize: 13, textAlign: 'center', maxWidth: 340 }}>
          Load a RestedXP <code style={{color:'#c9963a'}}>.lua</code> guide file to start editing steps with AI assistance.
        </div>
        <div
          className="drop-zone"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📜</div>
          <div style={{ color: '#aaa', fontSize: 14 }}>Drop your <strong style={{color:'#c9963a'}}>.lua</strong> guide file here</div>
          <div style={{ color: '#555', fontSize: 12, marginTop: 6 }}>or click to browse</div>
          <button className="upload-btn" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
            Choose File
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".lua" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: 12, marginBottom: 4 }}>Don't have a guide handy?</div>
          <button className="upload-btn" style={{ background: 'transparent', border: '1px solid #3a2e15', color: '#c9963a' }}
            disabled={sampleLoading} onClick={loadSampleGuide}>
            {sampleLoading ? 'Loading…' : 'Try it with a sample guide'}
          </button>
          {sampleError && (
            <div style={{ color: '#cb6a6a', fontSize: 11, marginTop: 8 }}>{sampleError}</div>
          )}
        </div>
        <div style={{ marginTop: 28, textAlign: 'center', color: '#6a6253', fontSize: 12, lineHeight: 1.6, maxWidth: 380 }}>
          Made by <span style={{ color: '#c9963a' }}>Rook</span>. Feedback, questions or ideas?
          Reach out to <span style={{ color: '#9ccf7a' }}>rookgalaxy_</span> on Discord, or find me on the
          <span style={{ color: '#9ccf7a' }}> Kamisayo Speedruns</span> server.
        </div>
      </div>
    );
  }

  // ─── Editor screen ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'transparent', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600&display=swap');

        .rxp-root { font-family: system-ui, sans-serif; font-size: 13px; color: #ccc; }

        /* Footer attribution */
        .editor-footer { flex-shrink: 0; padding: 5px 12px; background: #0c0a06; border-top: 1px solid #1e1808; font-size: 11px; color: #6a6253; text-align: center; }
        .footer-help-link { background: none; border: none; color: #b48fd0; cursor: pointer; font-size: 11px; padding: 0 0 0 4px; text-decoration: underline; }
        .footer-help-link:hover { color: #d0a8e8; }

        /* Help modal */
        .help-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.66); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .help-modal { background: #14110b; border: 1px solid #3a2e15; border-radius: 12px; max-width: 640px; width: 100%; max-height: 82vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.7); }
        .help-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #2a2010; flex-shrink: 0; }
        .help-title { font-family: 'Cinzel', serif; color: #c9963a; font-size: 16px; letter-spacing: 0.04em; }
        .help-close { background: none; border: none; color: #888; font-size: 16px; cursor: pointer; }
        .help-close:hover { color: #ccc; }
        .help-body { padding: 8px 18px 18px; overflow-y: auto; }
        .help-body section { margin-top: 16px; }
        .help-body h3 { color: #c9963a; font-size: 13px; margin: 0 0 5px; font-weight: 600; }
        .help-body p { color: #b8ac90; font-size: 12.5px; line-height: 1.55; margin: 0 0 4px; }
        .help-body code { color: #9ccf7a; font-size: 11.5px; background: #1a1610; padding: 0 3px; border-radius: 3px; }
        .help-triggers { list-style: none; padding: 0; margin: 6px 0; }
        .help-triggers li { color: #b8ac90; font-size: 12px; line-height: 1.7; }
        .help-triggers span { display: inline-block; width: 18px; font-weight: 700; font-family: monospace; }
        .t-at { color: #7a96c8; } .t-hash { color: #c98a3a; } .t-colon { color: #9ccf7a; }
        .t-bang { color: #c060c0; } .t-star { color: #d0c060; } .t-tilde { color: #c0a060; } .t-dot { color: #60c0a0; }
        .help-note { color: #8a7e60 !important; font-size: 11.5px !important; margin-top: 6px !important; }

        /* Topbar */
        .topbar { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #0e0c08; border-bottom: 1px solid #2a2010; flex-shrink: 0; }
        .topbar-title { font-family: 'Cinzel', serif; color: #c9963a; font-size: 14px; letter-spacing: 0.05em; white-space: nowrap; }
        .topbar-file { color: #666; font-size: 12px; font-family: monospace; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .guide-dd { position: relative; flex: 1; max-width: 460px; }
        .guide-dd-btn { display: flex; align-items: center; gap: 6px; width: 100%; background: #15110a; color: #d8c89a; border: 1px solid #3a2e15; border-radius: 6px; padding: 4px 10px; font-size: 12px; font-family: system-ui, sans-serif; cursor: pointer; text-align: left; }
        .guide-dd-btn:hover { border-color: #c9963a; }
        .guide-dd-caret { margin-left: auto; color: #8a7e60; font-size: 9px; }
        .guide-dd-meta { color: #8a7e60; font-size: 11px; white-space: nowrap; }
        .guide-dd-edits { color: #7ecb45; margin-right: 2px; }
        .guide-dd-menu { position: absolute; top: 100%; left: 0; right: 0; margin-top: 3px; background: #15120a; border: 1px solid #3a2e15; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,0.6); z-index: 1200; max-height: 60vh; overflow-y: auto; }
        .guide-dd-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer; border-left: 2px solid transparent; }
        .guide-dd-row:hover { background: #241b0c; }
        .guide-dd-row.active { background: #241b0c; border-left-color: #c9963a; }
        .guide-dd-row .guide-dd-meta { margin-left: auto; }
        .rxp-name { display: inline-flex; align-items: center; gap: 2px; flex-wrap: nowrap; }
        .rxp-inline-icon { vertical-align: middle; border-radius: 2px; object-fit: cover; }
        .rxp-icon-missing { display: inline-block; width: 12px; }
        .topbar-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #2a4a1a; color: #7ecb45; border: 1px solid #3a6a2a; white-space: nowrap; }
        .export-btn { padding: 5px 14px; background: #c9963a; color: #0e0b06; border-radius: 5px; font-weight: 700; font-size: 12px; letter-spacing: 0.05em; cursor: pointer; border: none; white-space: nowrap; transition: background 0.15s; }
        .export-btn:hover { background: #e0b050; }

        /* Layout */
        .editor-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }

        /* Sidebar */
        .sidebar { width: 220px; flex-shrink: 0; background: #0c0a06; border-right: 1px solid #1e1808; display: flex; flex-direction: column; overflow: hidden; }
        .search-box { padding: 8px; border-bottom: 1px solid #1e1808; flex-shrink: 0; }
        .search-input { width: 100%; box-sizing: border-box; background: #1a1508; border: 1px solid #2a2010; color: #ccc; border-radius: 5px; padding: 5px 8px; font-size: 12px; outline: none; }
        .search-input:focus { border-color: #c9963a; }
        .step-list { flex: 1; overflow-y: auto; padding: 4px 0; min-height: 0; }
        .setup-item { border-bottom: 1px solid #1e1808; }
        .setup-item .step-num { color: #b48fd0; }
        .step-list::-webkit-scrollbar { width: 5px; }
        .step-list::-webkit-scrollbar-thumb { background: #2a2010; border-radius: 3px; }
        .step-item { padding: 7px 10px 7px 8px; cursor: pointer; border-left: 2px solid transparent; transition: background 0.1s; display: flex; flex-direction: column; gap: 2px; }
        .step-item:hover { background: #1a1508; }
        .step-item.active { background: #1e1608; border-left-color: #c9963a; }
        .step-item.edited { border-left-color: #7ecb45; }
        .step-num { font-size: 10px; color: #444; font-family: monospace; }
        .step-label { font-size: 11.5px; color: #bbb; line-height: 1.4; }
        .step-item.active .step-label { color: #e8d8a0; }
        .type-badge { display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 3px; letter-spacing: 0.05em; font-weight: 700; margin-top: 1px; align-self: flex-start; }

        /* Main panel */
        .main-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #0f0d09; }

        /* Step header */
        .step-header { padding: 10px 14px; border-bottom: 1px solid #1e1808; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .step-title { color: #e8d8a0; font-size: 13px; font-weight: 600; flex: 1; }
        .view-toggle { display: flex; gap: 0; }
        .view-btn { padding: 3px 10px; font-size: 11px; background: #1a1508; border: 1px solid #2a2010; color: #666; cursor: pointer; transition: all 0.1s; }
        .view-btn:first-child { border-radius: 4px 0 0 4px; }
        .view-btn:last-child { border-radius: 0 4px 4px 0; }
        .view-btn.active { background: #2a2010; color: #c9963a; border-color: #4a3a18; }

        /* Content area */
        .content-area { flex: 1; overflow-y: auto; padding: 14px; min-height: 0; }
        .content-area::-webkit-scrollbar { width: 5px; }
        .content-area::-webkit-scrollbar-thumb { background: #2a2010; border-radius: 3px; }

        /* Preview lines — most styling is now inline in StepPreview */
        .preview-line { padding: 0 4px; }
        .raw-view { font-family: monospace; font-size: 12px; color: #bbb; white-space: pre-wrap; word-break: break-all; line-height: 1.7; }

        /* RXP inline colors */
        .rxp-warn { color: #ffb733 !important; font-weight: 600; }
        .rxp-friendly { color: #7ecb45 !important; }
        .rxp-enemy { color: #cb4545 !important; }
        .rxp-loot { color: #f0c645 !important; }
        .rxp-buy { color: #45a8cb !important; }
        .rxp-pick { color: #c060d0 !important; }
        .rxp-icon { color: #c9963a; font-weight: 600; }

        /* Edit panel */
        .edit-panel { border-top: 1px solid #1e1808; background: #0c0a06; flex-shrink: 0; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
        .edit-label { font-size: 11px; color: #666; letter-spacing: 0.06em; text-transform: uppercase; }
        .edit-row { display: flex; gap: 8px; align-items: flex-end; }
        .instruction-input { flex: 1; background: #1a1508; border: 1px solid #2a2010; color: #e8d8a0; border-radius: 6px; padding: 8px 10px; font-size: 13px; outline: none; resize: none; line-height: 1.5; font-family: system-ui, sans-serif; min-height: 40px; max-height: 90px; transition: border-color 0.15s; }
        .instruction-input:focus { border-color: #c9963a; }
        .instruction-input::placeholder { color: #443; }
        .run-btn { padding: 8px 18px; background: #c9963a; color: #0e0b06; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer; border: none; white-space: nowrap; transition: background 0.15s; align-self: flex-end; }
        .run-btn:hover:not(:disabled) { background: #e0b050; }
        .run-btn:disabled { background: #4a3810; color: #6a5828; cursor: default; }

        /* Diff panel */
        .diff-panel { border-top: 1px solid #1e1808; background: #0a0c08; flex-shrink: 0; }
        .diff-header { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid #1e1808; }
        .diff-title { color: #c9963a; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; flex: 1; }
        .accept-btn { padding: 5px 14px; background: #1e4a10; border: 1px solid #3a8a22; color: #7ecb45; border-radius: 5px; font-weight: 700; font-size: 12px; cursor: pointer; transition: background 0.15s; }
        .accept-btn:hover { background: #2a6418; }
        .reject-btn { padding: 5px 14px; background: #2a1010; border: 1px solid #6a2a2a; color: #cb6a6a; border-radius: 5px; font-weight: 700; font-size: 12px; cursor: pointer; transition: background 0.15s; }
        .reject-btn:hover { background: #3a1818; }
        .diff-content { max-height: 220px; overflow-y: auto; padding: 8px 14px; }
        .diff-content::-webkit-scrollbar { width: 4px; }
        .diff-content::-webkit-scrollbar-thumb { background: #2a2010; }

        /* Loading */
        .loading-bar { height: 2px; background: linear-gradient(90deg, #c9963a 0%, #e0b050 50%, #c9963a 100%); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .loading-msg { padding: 24px; text-align: center; color: #666; font-size: 13px; }
        .ai-feed { text-align: left; max-width: 460px; margin: 0 auto; display: flex; flex-direction: column; gap: 6px; font-family: system-ui, sans-serif; }
        .ai-feed-row { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; line-height: 1.45; animation: feedIn 0.18s ease-out; }
        .ai-feed-icon { flex-shrink: 0; width: 16px; text-align: center; }
        .ai-ok { color: #9ccf7a; }
        .ai-web { color: #6fb0e0; }
        .ai-miss { color: #d0a850; }
        .ai-warn { color: #d0a850; }
        .ai-status.live { color: #c9963a; }
        .ai-status.past { color: #6a6253; }
        .ai-status.live .ai-feed-icon { animation: pulse 1s ease-in-out infinite; }
        @keyframes feedIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

        /* Error */
        .error-msg { padding: 10px 14px; color: #cb6a6a; background: #2a1010; border-top: 1px solid #5a2020; font-size: 12px; }

        /* Empty state */
        .empty-state { padding: 48px 24px; text-align: center; color: #444; }

        /* Step management toolbar */
        .step-toolbar { display: flex; gap: 4px; align-items: center; padding: 6px 10px; background: #0a0900; border-bottom: 1px solid #1e1808; flex-shrink: 0; }
        .tool-btn { padding: 3px 9px; font-size: 11px; background: #1a1508; border: 1px solid #2a2010; color: #888; border-radius: 4px; cursor: pointer; transition: all 0.12s; white-space: nowrap; }
        .tool-btn:hover { background: #2a2010; color: #c9963a; border-color: #4a3818; }
        .tool-btn.danger { color: #8a4040; border-color: #3a1a1a; }
        .tool-btn.danger:hover { background: #2a0f0f; color: #e06060; border-color: #6a2020; }
        .tool-btn.primary { color: #c9963a; border-color: #4a3818; }
        .tool-btn.primary:hover { background: #3a2a10; }
        .tool-btn:disabled { opacity: 0.3; cursor: default; }
        .confirm-delete { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #2a0f0f; border-top: 1px solid #5a2020; font-size: 12px; color: #e06060; flex-shrink: 0; }
        /* Manual edit mode */
        .manual-edit-area { flex: 1; display: flex; flex-direction: column; min-height: 0; }
        .manual-textarea { flex: 1; background: #0a0e08; color: #c8d8a8; font-family: monospace; font-size: 12px; line-height: 1.7; border: none; outline: none; resize: none; padding: 14px; min-height: 0; }
        .manual-toolbar { display: flex; gap: 8px; padding: 8px 14px; border-top: 1px solid #1e1808; background: #0c0a06; flex-shrink: 0; align-items: center; }

        /* Inline mention picker */
        .mention-menu { z-index: 1000; width: 320px; max-height: 280px; overflow-y: auto; background: #15120a; border: 1px solid #3a2e15; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,0.6); font-family: system-ui, sans-serif; }
        .mention-head { padding: 6px 10px; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: #8a7a4a; border-bottom: 1px solid #251d0e; position: sticky; top: 0; background: #15120a; }
        .mention-q { color: #c9963a; text-transform: none; letter-spacing: 0; }
        .mention-row { padding: 7px 10px; cursor: pointer; border-left: 2px solid transparent; display: flex; align-items: center; gap: 8px; }
        .mention-icon { width: 28px; height: 28px; border-radius: 4px; flex-shrink: 0; border: 1px solid #2a2110; }
        .mention-row-text { min-width: 0; flex: 1; }
        .mention-row.active { background: #241b0c; border-left-color: #c9963a; }
        .mention-name { font-size: 12.5px; color: #e8d8a0; line-height: 1.3; }
        .mention-sub { font-size: 11px; color: #8a7e60; font-family: monospace; margin-top: 1px; }
        .mention-empty { padding: 10px; font-size: 12px; color: #6a6253; text-align: center; }
        .mention-foot { padding: 6px 10px; font-size: 10px; color: #5a523f; border-top: 1px solid #251d0e; position: sticky; bottom: 0; background: #15120a; }
        .mention-modes { display: flex; gap: 10px; margin-bottom: 4px; }
        .mention-modes span { color: #8a7e60; }
        .mention-modes kbd { background: #2a2110; border: 1px solid #3a2e15; border-radius: 3px; padding: 0 4px; font-family: monospace; color: #c9963a; margin-right: 3px; }
        .mention-preview { color: #6a6048; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mention-preview code { color: #9ccf7a; }
        .mention-menu::-webkit-scrollbar { width: 6px; }
        .mention-menu::-webkit-scrollbar-thumb { background: #3a2e15; border-radius: 3px; }
        /* Hint examples */
        .hint-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .hint-chip { font-size: 11px; padding: 3px 9px; background: #1a1508; border: 1px solid #2a2010; color: #666; border-radius: 12px; cursor: pointer; transition: all 0.1s; }
        .hint-chip:hover { background: #2a2010; color: #c9963a; border-color: #4a3818; }
      `}</style>

      <div className="rxp-root" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Topbar */}
        <div className="topbar">
          <span className="topbar-title">RXP Guide Editor</span>
          {guides.length > 1 ? (
            <GuideSelect
              guides={guides.map((g, i) => (i === activeGuideIndex ? guide : g))}
              activeIndex={activeGuideIndex}
              editsFor={i => i === activeGuideIndex
                ? Object.keys(appliedSteps).length
                : Object.keys(appliedByGuide[i] || {}).length}
              onSelect={selectGuide}
            />
          ) : (
            <span className="topbar-file">{fileName}</span>
          )}
          {guides.length > 1 && (
            <span className="topbar-badge" style={{ background: '#231a33', color: '#b48fd0', border: '1px solid #3a2a55' }}>
              {guides.length} guides
            </span>
          )}
          {editedCount > 0 && (
            <span className="topbar-badge">✎ {editedCount} edit{editedCount !== 1 ? 's' : ''}</span>
          )}
          {sessionCost > 0 && (
            <span className="topbar-badge"
              style={{ background: '#1a2230', color: '#6fb0e0', border: '1px solid #2a3a55' }}
              title={lastEditInfo
                ? `Last edit: $${lastEditInfo.cost.toFixed(4)} · ${lastEditInfo.webSearches} web search${lastEditInfo.webSearches !== 1 ? 'es' : ''} · ${lastEditInfo.cachedTokens.toLocaleString()} cached tokens · ${lastEditInfo.rounds} round${lastEditInfo.rounds !== 1 ? 's' : ''}`
                : ''}>
              ${sessionCost.toFixed(3)} this session
            </span>
          )}
          <button className="export-btn" onClick={exportGuide}>
            {copyMsg || '⬇ Download .lua'}
          </button>
          <button className="export-btn" style={{ background: '#1a1530', color: '#b48fd0', border: '1px solid #3a2a55' }}
            onClick={() => setHelpOpen(true)} title="Help & FAQ">
            ? Help
          </button>
          <button className="export-btn" style={{ background: '#1e1808', color: '#888', border: '1px solid #2a2010' }}
            onClick={() => {
              setGuide(null); setGuides([]); setSegments([]); setActiveGuideIndex(0);
              setAppliedByGuide({}); setFileName(''); setAppliedSteps({});
            }}>
            New File
          </button>
          {/* API key indicator / input toggle */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowKeyInput(v => !v)}
              style={{
                padding: '4px 11px', fontSize: 11, borderRadius: 5, cursor: 'pointer', border: '1px solid',
                background: apiKey ? '#1a2a10' : '#2a1a08',
                color: apiKey ? '#7ecb45' : '#c9963a',
                borderColor: apiKey ? '#3a5a20' : '#4a3010',
                fontWeight: 700, letterSpacing: '0.04em', whiteSpace: 'nowrap',
              }}>
              {apiKey ? '🔑 Key set' : '🔑 Add API key'}
            </button>
            {showKeyInput && (
              <div style={{
                position: 'absolute', right: 0, top: '110%', zIndex: 100,
                background: '#121008', border: '1px solid #3a2a10', borderRadius: 8,
                padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
                boxShadow: '0 8px 32px rgba(0,0,0,0.7)', width: 340,
              }}>
                <div style={{ fontSize: 12, color: '#c9963a', fontWeight: 700 }}>Anthropic API key</div>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>
                  Your key is stored only in this browser session — never sent anywhere except directly to api.anthropic.com.
                  Get one at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                    style={{ color: '#c9963a' }}>console.anthropic.com</a>.
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  autoFocus
                  style={{
                    background: '#1a1508', border: '1px solid #3a2a10', color: '#e8d8a0',
                    borderRadius: 5, padding: '6px 9px', fontSize: 12, fontFamily: 'monospace', outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowKeyInput(false)} style={{
                    flex: 1, padding: '5px 0', background: '#c9963a', color: '#0e0b06',
                    border: 'none', borderRadius: 5, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}>
                    {apiKey ? 'Save' : 'Close'}
                  </button>
                  {apiKey && (
                    <button onClick={() => { setApiKey(''); setShowKeyInput(false); }} style={{
                      padding: '5px 12px', background: '#2a1010', color: '#cb6a6a',
                      border: '1px solid #5a2020', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                    }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="editor-body">
          {/* Sidebar */}
          <div className="sidebar">
            <div className="search-box">
              <input className="search-input" placeholder="Search steps…" value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="step-list" ref={listRef}>
              {/* Pinned "Guide Setup" pseudo-step — the header/config block
                  (#name, #next, faction/class tags) that sits before step 1. */}
              <div
                className={`step-item setup-item ${selectedStepId === 'header' ? 'active' : ''}`}
                onClick={() => { setSelectedStepId('header'); setHeaderText(guide?.header ?? ''); setHeaderDirty(false); setStatus('idle'); setProposedStep(null); setManualEdit(false); setConfirmDelete(false); }}
              >
                <div className="step-num">⚙ Setup</div>
                <div className="step-label">Guide name, faction & section links</div>
                <span className="type-badge" style={{ background: '#1a1530', color: '#b48fd0', border: '1px solid #3a2a55' }}>
                  config
                </span>
              </div>
              {filteredSteps.map(s => {
                const tc = TYPE_COLORS[s.type] || TYPE_COLORS.other;
                const isEdited = appliedSteps[s.id] !== undefined;
                return (
                  <div key={s.id}
                    className={`step-item ${s.id === selectedStepId ? 'active' : ''} ${isEdited ? 'edited' : ''}`}
                    onClick={() => { setSelectedStepId(s.id); setStatus('idle'); setProposedStep(null); setManualEdit(false); setConfirmDelete(false); }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="step-num">#{s.id + 1}{isEdited ? ' ✎' : ''}</div>
                      {s.id === selectedStepId && (
                        <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                          <button className="tool-btn" style={{ padding: '1px 5px', fontSize: 10 }}
                            disabled={s.id === 0}
                            onClick={() => moveStep(s.id, -1)} title="Move step up">↑</button>
                          <button className="tool-btn" style={{ padding: '1px 5px', fontSize: 10 }}
                            disabled={s.id === guide.steps.length - 1}
                            onClick={() => moveStep(s.id, 1)} title="Move step down">↓</button>
                        </div>
                      )}
                    </div>
                    <div className="step-label">{s.label}</div>
                    <span className="type-badge" style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
                      {TYPE_LABELS[s.type]}
                    </span>
                  </div>
                );
              })}
              {filteredSteps.length === 0 && (
                <div style={{ padding: 16, color: '#444', fontSize: 12, textAlign: 'center' }}>No steps match</div>
              )}
            </div>
          </div>

          {/* Main panel */}
          <div className="main-panel">
            {selectedStepId === 'header' ? (
              <>
                <div className="step-header">
                  <span className="step-title">⚙ Guide Setup</span>
                  <span style={{ fontSize: 11, color: '#666' }}>The config block before step 1</span>
                </div>
                <div className="content-area" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 12, color: '#8a7e60', marginBottom: 8, lineHeight: 1.5 }}>
                    This is the header for <b style={{ color: '#c9963a' }}>this sub-guide</b>. Common tags:&nbsp;
                    <code style={{ color: '#9ccf7a' }}>#name</code> (shown in the dropdown),&nbsp;
                    <code style={{ color: '#9ccf7a' }}>#next</code> (the section that follows),&nbsp;
                    and class/faction lines like <code style={{ color: '#9ccf7a' }}>&lt;&lt; Rogue</code> or <code style={{ color: '#9ccf7a' }}>&lt;&lt;Alliance</code>.
                  </div>
                  <MentionPicker
                    className="manual-textarea"
                    style={{ minHeight: 200 }}
                    value={headerText}
                    onChange={val => { setHeaderText(val); setHeaderDirty(true); }}
                    spellCheck={false}
                  />
                </div>
                <div className="manual-toolbar">
                  <button className="tool-btn primary" disabled={!headerDirty} onClick={saveHeader}>
                    {headerDirty ? '✓ Save setup' : 'Saved'}
                  </button>
                  <button className="tool-btn" disabled={!headerDirty}
                    onClick={() => { setHeaderText(guide?.header ?? ''); setHeaderDirty(false); }}>
                    ✕ Revert
                  </button>
                  <span style={{ fontSize: 11, color: '#444', marginLeft: 4 }}>
                    Raw RXP · <b style={{ color: '#7a96c8' }}>@</b> npc&nbsp;
                    <b style={{ color: '#c98a3a' }}>#</b> quest&nbsp;
                    <b style={{ color: '#9ccf7a' }}>:</b> item&nbsp;
                    <b style={{ color: '#c060c0' }}>!</b> spell&nbsp;
                    <b style={{ color: '#d0c060' }}>*</b> icon&nbsp;
                    <b style={{ color: '#c0a060' }}>~</b> format&nbsp;
                    <b style={{ color: '#60c0a0' }}>.</b> directive&nbsp;·&nbsp;
                    <b style={{ color: '#888' }}>↵</b> name&nbsp;
                    <b style={{ color: '#888' }}>⇧↵</b> id/goto&nbsp;
                    <b style={{ color: '#888' }}>⌘↵</b> snippet
                  </span>
                </div>
              </>
            ) : !selectedStep ? (
              <div className="empty-state">Select a step from the sidebar</div>
            ) : (
              <>
                {/* Step header */}
                <div className="step-header">
                  <span className="step-title">Step {selectedStep.id + 1} — {selectedStep.label}</span>
                  {!manualEdit && (
                    <div className="view-toggle">
                      <button className={`view-btn ${viewMode === 'rendered' ? 'active' : ''}`}
                        onClick={() => setViewMode('rendered')}>Preview</button>
                      <button className={`view-btn ${viewMode === 'raw' ? 'active' : ''}`}
                        onClick={() => setViewMode('raw')}>Raw</button>
                    </div>
                  )}
                </div>

                {/* Step action toolbar */}
                {!manualEdit && (
                  <div className="step-toolbar">
                    <button className="tool-btn primary" onClick={enterManualEdit} title="Edit the raw step text directly">
                      ✎ Edit manually
                    </button>
                    <button className="tool-btn" onClick={() => insertStepAfter(selectedStep.id)} title="Insert a new blank step after this one">
                      + Insert step after
                    </button>
                    <div style={{ flex: 1 }} />
                    {confirmDelete ? (
                      <>
                        <span style={{ fontSize: 11, color: '#e06060' }}>Delete this step?</span>
                        <button className="tool-btn danger" onClick={deleteStep}>Yes, delete</button>
                        <button className="tool-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
                      </>
                    ) : (
                      <button className="tool-btn danger" onClick={() => setConfirmDelete(true)} title="Delete this step">
                        🗑 Delete
                      </button>
                    )}
                  </div>
                )}

                {/* Content: manual edit mode */}
                {manualEdit ? (
                  <div className="manual-edit-area">
                    <MentionPicker
                      className="manual-textarea"
                      value={manualText}
                      onChange={setManualText}
                      spellCheck={false}
                      autoFocus
                    />
                    <div className="manual-toolbar">
                      <button className="tool-btn primary" onClick={saveManualEdit}>✓ Save changes</button>
                      <button className="tool-btn" onClick={cancelManualEdit}>✕ Cancel</button>
                      <span style={{ fontSize: 11, color: '#444', marginLeft: 4 }}>
                        Raw RXP · <b style={{ color: '#7a96c8' }}>@</b> npc&nbsp;
                        <b style={{ color: '#c98a3a' }}>#</b> quest&nbsp;
                        <b style={{ color: '#9ccf7a' }}>:</b> item&nbsp;
                        <b style={{ color: '#c060c0' }}>!</b> spell&nbsp;
                        <b style={{ color: '#d0c060' }}>*</b> icon&nbsp;
                        <b style={{ color: '#c0a060' }}>~</b> format&nbsp;
                        <b style={{ color: '#60c0a0' }}>.</b> directive&nbsp;·&nbsp;
                        <b style={{ color: '#888' }}>↵</b> name&nbsp;
                        <b style={{ color: '#888' }}>⇧↵</b> id/goto&nbsp;
                        <b style={{ color: '#888' }}>⌘↵</b> snippet
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Content: normal view */}
                    <div className="content-area">
                      {status === 'loading' ? (
                        <div className="loading-msg">
                          <div className="loading-bar" style={{ marginBottom: 16, borderRadius: 2 }} />
                          {aiActivity.length === 0 ? (
                            <div>Starting…</div>
                          ) : (
                            <div className="ai-feed">
                              {aiActivity.map((a, i) => {
                                const isLast = i === aiActivity.length - 1;
                                if (a.kind === 'status') {
                                  return (
                                    <div key={i} className={`ai-feed-row ai-status ${isLast ? 'live' : 'past'}`}>
                                      <span className="ai-feed-icon">{isLast ? '⋯' : '·'}</span>
                                      <span>{a.text}</span>
                                    </div>
                                  );
                                }
                                const icon = a.kind === 'web' ? '🌐'
                                  : a.status === 'miss' ? '↗'
                                  : a.status === 'warn' ? '?' : '✓';
                                const cls = a.status === 'miss' ? 'miss' : a.status === 'warn' ? 'warn' : 'ok';
                                return (
                                  <div key={i} className={`ai-feed-row ai-${cls}`}>
                                    <span className="ai-feed-icon">{icon}</span>
                                    <span>{a.text}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : viewMode === 'rendered' ? (
                        <StepPreview raw={currentRaw} />
                      ) : (
                        <div className="raw-view">{`step\n${currentRaw}`}</div>
                      )}
                    </div>

                    {/* Diff panel */}
                    {status === 'diff' && proposedStep !== null && (
                      <div className="diff-panel">
                        <div className="diff-header">
                          <span className="diff-title">⟳ PROPOSED EDIT</span>
                          <button className="accept-btn" onClick={acceptEdit}>✓ Accept</button>
                          <button className="reject-btn" onClick={rejectEdit}>✕ Reject</button>
                        </div>
                        <div className="diff-content">
                          <DiffView oldRaw={currentRaw} newRaw={proposedStep} />
                        </div>
                      </div>
                    )}

                    {status === 'error' && (
                      <div className="error-msg">⚠ {errorMsg}</div>
                    )}

                    {/* AI edit panel */}
                    {status !== 'diff' && (
                      <div className="edit-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="edit-label">AI edit instruction</span>
                        </div>
                        <div className="hint-chips">
                          {[
                            'Add a vendor stop before this step',
                            'Change the NPC target to…',
                            'Add training for the next spell rank',
                            'Split this into two steps',
                            'Add a warning note about…',
                          ].map(h => (
                            <span key={h} className="hint-chip" onClick={() => setInstruction(h)}>
                              {h}
                            </span>
                          ))}
                        </div>
                        <div className="edit-row">
                          <textarea
                            ref={textareaRef}
                            className="instruction-input"
                            placeholder='Describe your edit... e.g. "Replace this step with visiting the Rogue trainer in Goldshire to train Sinister Strike Rank 2"'
                            value={instruction}
                            onChange={e => setInstruction(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runEdit();
                            }}
                            rows={2}
                          />
                          <button className="run-btn" onClick={runEdit}
                            disabled={status === 'loading' || !instruction.trim()}
                            title={!apiKey ? 'Add your API key (top right) to use AI editing' : ''}>
                            {status === 'loading' ? '…' : apiKey ? 'Edit ↵' : '🔑 Edit ↵'}
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: '#333' }}>⌘ Enter to submit</div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="editor-footer">
        Made by <span style={{ color: '#c9963a' }}>Rook</span> · feedback to
        <span style={{ color: '#9ccf7a' }}> rookgalaxy_</span> on Discord or the
        <span style={{ color: '#9ccf7a' }}> Kamisayo Speedruns</span> server ·
        <button className="footer-help-link" onClick={() => setHelpOpen(true)}>Help &amp; FAQ</button>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

// ─── Root App — closes the key dropdown when clicking outside ────────────────
export default function App() {
  return <Editor />;
}

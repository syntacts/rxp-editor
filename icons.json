// HelpModal.jsx — a Help / FAQ overlay for the editor.
import { useEffect } from "react";

export function HelpModal({ open, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-modal" onClick={e => e.stopPropagation()}>
        <div className="help-head">
          <span className="help-title">RXP Guide Editor — Help</span>
          <button className="help-close" onClick={onClose}>✕</button>
        </div>

        <div className="help-body">
          <section>
            <h3>What this is</h3>
            <p>
              A purpose-built editor for RestedXP (RXP) speedrunning guide
              <code> .lua</code> files. Load a guide, browse its steps, edit them
              by hand or with AI help, preview how each step will look in-game,
              and download the finished file.
            </p>
          </section>

          <section>
            <h3>Loading &amp; sub-guides</h3>
            <p>
              Drop a <code>.lua</code> file (or click to browse). A single file can
              hold several guides — use the dropdown at the top to switch between
              them. Each guide's edits are kept separately, and
              <b> Download .lua</b> recompiles the whole file with every sub-guide
              and your edits intact.
            </p>
          </section>

          <section>
            <h3>Guide Setup (the config block)</h3>
            <p>
              The <b>⚙ Setup</b> entry at the top of the step list is the header
              that sits before step 1 — the <code>#name</code> (shown in the
              dropdown), <code>#next</code> (the following section), and
              class/faction tags like <code>&lt;&lt; Rogue</code> /
              <code>&lt;&lt;Alliance</code>. Edit it there and click <b>Save setup</b>.
            </p>
          </section>

          <section>
            <h3>Quick-insert menus (manual editing)</h3>
            <p>While editing a step's raw text, type a trigger character to search the bundled WoW Classic database — no IDs to memorize:</p>
            <ul className="help-triggers">
              <li><span className="t-at">@</span> NPCs — inserts a name, a <code>.goto</code> with coordinates, or a coloured name</li>
              <li><span className="t-hash">#</span> Quests — inserts the quest ID or a full turn-in line</li>
              <li><span className="t-colon">:</span> Items — inserts the item ID or a <code>|cRXP_LOOT_…|r</code> token</li>
              <li><span className="t-bang">!</span> Spells — inserts a spell ID, with the right rank</li>
              <li><span className="t-star">*</span> Icons — search by name (e.g. <code>*sword</code>) and insert the icon</li>
              <li><span className="t-tilde">~</span> Formatting — chat-bubble “Talk to”, warnings, loot/buy/pick text</li>
              <li><span className="t-dot">.</span> Directives — all RXP step directives, as ready scaffolds</li>
            </ul>
            <p className="help-note">
              In the menu: <b>↑/↓</b> to move, <b>Enter</b> inserts the name,
              <b> Shift+Enter</b> the ID / <code>.goto</code>, <b>⌘/Ctrl+Enter</b> the
              richer snippet. Multi-word names work (e.g. <code>:Tough Wolf Meat</code>) —
              the menu closes on its own once you type past a real name.
            </p>
          </section>

          <section>
            <h3>AI editing</h3>
            <p>
              Describe a change in plain language and the AI rewrites the step,
              looking up real quest/NPC/item/spell IDs from the local database
              first. You see exactly what it's doing, and review the change as a
              diff before it's applied. It needs an Anthropic API key (entered in
              the editor) and costs a small amount per edit; the cost meter in the
              top bar shows your session total.
            </p>
          </section>

          <section>
            <h3>Feedback</h3>
            <p>
              Made by <b style={{ color: "#c9963a" }}>Rook</b>. Questions, bugs or
              ideas are very welcome — reach out to
              <b style={{ color: "#9ccf7a" }}> rookgalaxy_</b> on Discord, or find me
              on the <b style={{ color: "#9ccf7a" }}>Kamisayo Speedruns</b> server.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

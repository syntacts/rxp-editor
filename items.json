// MentionPicker.jsx — a textarea that opens an inline, caret-positioned
// autocomplete when the user types a trigger character, searching the local
// game database and inserting the right RXP token. No AI call involved.
//
// Triggers (configurable below):
//   @  → NPCs      → inserts a ready .goto Zone,X,Y (or the coloured name)
//   #  → Quests    → inserts the quest ID
//   :  → Items     → inserts the item ID
//   !  → Spells    → inserts the spell ID (per rank)
//
// Press Esc to dismiss, ↑/↓ to move, Enter/Tab to insert, or click a row.

import { useState, useRef, useEffect, useCallback } from "react";
import GameData from "./gamedata.js";
import { TRIGGERS, detectTrigger } from "./mention-trigger.js";
import { searchStatic } from "./snippets.js";

// Measure the pixel position of the caret inside a textarea using a mirror div
// that copies the textarea's text + styling up to the caret.
function getCaretCoords(textarea, caretIndex) {
  const div = document.createElement("div");
  const style = window.getComputedStyle(textarea);
  const props = [
    "boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
    "whiteSpace", "wordWrap", "wordBreak", "textTransform",
  ];
  for (const p of props) div.style[p] = style[p];
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";
  div.style.overflow = "hidden";

  const before = textarea.value.slice(0, caretIndex);
  div.textContent = before;
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  div.appendChild(marker);
  document.body.appendChild(div);

  // Align the mirror to the textarea, accounting for its scroll.
  const rect = textarea.getBoundingClientRect();
  div.style.left = rect.left + "px";
  div.style.top = rect.top + "px";
  const top = rect.top + marker.offsetTop - textarea.scrollTop;
  const left = rect.left + marker.offsetLeft - textarea.scrollLeft;
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  document.body.removeChild(div);
  return { top, left, lineHeight };
}

// Given the text and caret index, find an active trigger token immediately
// before the caret. (Pure logic lives in mention-trigger.js.)

export default function MentionPicker({ value, onChange, className, autoFocus, spellCheck, taRef, style }) {
  const innerRef = useRef(null);
  const ref = taRef || innerRef;
  const [menu, setMenu] = useState(null); // { items, index, pos, trigger }

  const closeMenu = useCallback(() => setMenu(null), []);

  // Re-evaluate the trigger/query whenever the value or caret changes.
  const evaluate = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const trig = detectTrigger(ta.value, caret);
    if (!trig) { setMenu(null); return; }

    // Static triggers (~ formatting, . directives) use a fixed snippet list and
    // show immediately even with an empty query (no "type a name" hint needed).
    if (trig.static) {
      const items = searchStatic(trig.kind, trig.query);
      const pos = getCaretCoords(ta, trig.start);
      setMenu(prev => {
        const same = prev && !prev.hint
          && prev.trigger.start === trig.start
          && prev.trigger.query === trig.query;
        const index = same ? Math.min(prev.index, Math.max(0, items.length - 1)) : 0;
        return { items, index, pos, trigger: trig, hint: false };
      });
      return;
    }

    // Icons benefit from a longer list so people can browse variants.
    const limit = trig.type === "icon" ? 15 : 8;
    const items = GameData.loaded ? GameData.search(trig.type, trig.query, limit) : [];
    if (trig.query.length === 0) {
      // Show a hint row prompting the user to type.
      const pos = getCaretCoords(ta, trig.start);
      setMenu({ items: [], index: 0, pos, trigger: trig, hint: true });
      return;
    }
    // Multi-word query that matches nothing → the user has typed past any real
    // name into prose, so dismiss the menu. (A single-word miss keeps the menu
    // open showing "No matches" so a typo can still be corrected.)
    if (items.length === 0 && /\s/.test(trig.query)) {
      setMenu(null);
      return;
    }
    const pos = getCaretCoords(ta, trig.start);
    setMenu(prev => {
      // If this is the same query at the same position, keep the user's current
      // highlighted row rather than snapping back to 0 (otherwise arrow-key
      // navigation gets reset every time the menu re-evaluates).
      const sameContext = prev && !prev.hint
        && prev.trigger.start === trig.start
        && prev.trigger.query === trig.query;
      const index = sameContext ? Math.min(prev.index, Math.max(0, items.length - 1)) : 0;
      return { items, index, pos, trigger: trig, hint: false };
    });
  }, [ref]);

  // Ensure the DB is loaded so the first trigger has data.
  useEffect(() => { GameData.load().then(evaluate).catch(() => {}); }, [evaluate]);

  function handleChange(e) {
    onChange(e.target.value);
    // evaluate after the value/caret update lands
    requestAnimationFrame(evaluate);
  }

  // mode: "name" (Enter) | "id" (Shift+Enter) | "advanced" (Cmd/Ctrl+Enter)
  function insertItem(item, mode = "name") {
    const ta = ref.current;
    if (!ta || !menu) return;
    const { start } = menu.trigger;
    const caret = ta.selectionStart;
    const before = value.slice(0, start);
    const after = value.slice(caret);
    const text = mode === "id" ? item.insertId
      : mode === "advanced" ? item.insertAdvanced
      : item.insertName;
    const next = before + text + after;
    onChange(next);
    setMenu(null);
    // Restore caret. For static snippets with a `caret` offset, place it inside
    // the snippet (where you'd type the next value); otherwise after the token.
    const offset = (typeof item.caret === "number" && item.caret <= text.length)
      ? item.caret : text.length;
    const newCaret = before.length + offset;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCaret, newCaret);
    });
  }

  function handleKeyDown(e) {
    if (!menu || menu.hint || menu.items.length === 0) {
      if (menu && e.key === "Escape") { e.preventDefault(); closeMenu(); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMenu(m => ({ ...m, index: (m.index + 1) % m.items.length }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMenu(m => ({ ...m, index: (m.index - 1 + m.items.length) % m.items.length }));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const mode = (e.metaKey || e.ctrlKey) ? "advanced" : e.shiftKey ? "id" : "name";
      insertItem(menu.items[menu.index], mode);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    }
  }

  // Recompute caret-following menu after caret moves (click, typing, arrows
  // that move the caret). But when the menu is OPEN, the navigation keys
  // (↑ ↓ Enter Tab Esc) belong to the menu — re-evaluating on their keyup would
  // rebuild the menu and reset the highlighted index back to 0, so skip them.
  const MENU_KEYS = new Set(["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"]);
  function handleSelect(e) {
    if (menu && e && MENU_KEYS.has(e.key)) return;
    requestAnimationFrame(evaluate);
  }

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, ...style }}>
      <textarea
        ref={ref}
        className={className}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={handleSelect}
        onKeyUp={handleSelect}
        onScroll={() => menu && evaluate()}
        onBlur={() => setTimeout(closeMenu, 120)}
        spellCheck={spellCheck}
        autoFocus={autoFocus}
      />
      {menu && (
        <div
          className="mention-menu"
          style={{
            position: "fixed",
            top: menu.pos.top + menu.pos.lineHeight + 2,
            left: menu.pos.left,
          }}
          onMouseDown={e => e.preventDefault()} // keep textarea focus
        >
          <div className="mention-head">
            {menu.trigger.label}
            {menu.trigger.query ? <span className="mention-q"> “{menu.trigger.query}”</span> : null}
          </div>
          {menu.hint ? (
            <div className="mention-empty">Type a {menu.trigger.label.toLowerCase()} name…</div>
          ) : menu.items.length === 0 ? (
            <div className="mention-empty">No matches</div>
          ) : (
            menu.items.map((it, i) => (
              <div
                key={(menu.trigger.type || menu.trigger.kind) + it.id + i}
                className={"mention-row" + (i === menu.index ? " active" : "")}
                onMouseEnter={() => setMenu(m => ({ ...m, index: i }))}
                onClick={() => insertItem(it, "name")}
              >
                {it.iconId != null && GameData.iconUrl(it.iconId) && (
                  <img className="mention-icon" src={GameData.iconUrl(it.iconId)} alt=""
                    onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
                )}
                <div className="mention-row-text">
                  <div className="mention-name">{it.name}</div>
                  <div className="mention-sub">{it.sub}</div>
                </div>
              </div>
            ))
          )}
          {!menu.hint && menu.items.length > 0 && menu.trigger.static && (
            <div className="mention-foot">
              <div className="mention-modes"><span><kbd>↵</kbd> insert · <kbd>↑↓</kbd> move · <kbd>esc</kbd> close</span></div>
            </div>
          )}
          {!menu.hint && menu.items.length > 0 && !menu.trigger.static && (() => {
            const a = menu.items[menu.index];
            const adv = a.insertAdvanced && a.insertAdvanced !== a.insertId && a.insertAdvanced !== a.insertName;
            return (
              <div className="mention-foot">
                <div className="mention-modes">
                  <span><kbd>↵</kbd> name</span>
                  {a.insertId !== a.insertName && <span><kbd>⇧↵</kbd> {menu.trigger.type === "npc" ? ".goto" : "id"}</span>}
                  {adv && <span><kbd>⌘↵</kbd> snippet</span>}
                </div>
                <div className="mention-preview">⌘↵ → <code>{a.insertAdvanced}</code></div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

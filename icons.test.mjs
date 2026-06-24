// snippets.js — static insert menus that don't search the game database.
//
// Two trigger characters open these:
//   ~  → formatting tokens: the chat-bubble "Talk to" prefix + coloured
//        warning/note/loot/buy text wrappers.
//   .  → RXP step directives (.goto, .accept, .train, .hs, …), each inserted as
//        a ready scaffold with the cursor left where you type next.
//
// Each snippet has:
//   name     — label shown in the menu
//   sub      — short description / preview
//   insert   — the text dropped into the textarea
//   caret    — (optional) offset from the start of `insert` to place the cursor
//              after insertion. Defaults to end of the inserted text.
//   keywords — extra words to match when filtering (so ".turn" finds .turnin)

// The fixed chat-bubble texture token, used on every NPC talk line.
export const CHAT_BUBBLE = "|Tinterface/worldmap/chatbubble_64grey.blp:20|t";

// ── ~ : formatting / colour tokens ───────────────────────────────────────────
export const FORMATTING = [
  {
    name: "Talk to (chat bubble)",
    sub: ">>" + CHAT_BUBBLE + "Talk to …",
    insert: ">>" + CHAT_BUBBLE + "Talk to ",
    keywords: ["bubble", "talk", "chat", "npc", "speak"],
  },
  {
    name: "Chat bubble icon only",
    sub: CHAT_BUBBLE,
    insert: CHAT_BUBBLE,
    keywords: ["bubble", "icon", "chat"],
  },
  {
    name: "Warning text",
    sub: "|cRXP_WARN_…|r",
    insert: "|cRXP_WARN_|r",
    caret: "|cRXP_WARN_".length, // cursor between _ and |r
    keywords: ["warn", "warning", "caution", "danger", "note", "red"],
  },
  {
    name: "Loot text",
    sub: "|cRXP_LOOT_…|r",
    insert: "|cRXP_LOOT_|r",
    caret: "|cRXP_LOOT_".length,
    keywords: ["loot", "pick up", "item", "grab"],
  },
  {
    name: "Buy text",
    sub: "|cRXP_BUY_…|r",
    insert: "|cRXP_BUY_|r",
    caret: "|cRXP_BUY_".length,
    keywords: ["buy", "purchase", "vendor", "shop"],
  },
  {
    name: "Pick-up / quest item text",
    sub: "|cRXP_PICK_…|r",
    insert: "|cRXP_PICK_|r",
    caret: "|cRXP_PICK_".length,
    keywords: ["pick", "pickup", "quest item", "object"],
  },
  {
    name: "Friendly NPC name",
    sub: "|cRXP_FRIENDLY_…|r",
    insert: "|cRXP_FRIENDLY_|r",
    caret: "|cRXP_FRIENDLY_".length,
    keywords: ["friendly", "npc", "green", "name"],
  },
  {
    name: "Enemy NPC name",
    sub: "|cRXP_ENEMY_…|r",
    insert: "|cRXP_ENEMY_|r",
    caret: "|cRXP_ENEMY_".length,
    keywords: ["enemy", "hostile", "mob", "red", "kill"],
  },
];

// ── . : step directives ──────────────────────────────────────────────────────
// `insert` shows the typical shape; `caret` puts the cursor where you'd type.
export const DIRECTIVES = [
  { name: ".goto", sub: "Travel to a coordinate", insert: ".goto Zone,x,y", caret: ".goto ".length, keywords: ["travel", "move", "coordinate", "waypoint"] },
  { name: ".accept", sub: "Accept a quest", insert: ".accept questId >> Accept QuestName", caret: ".accept ".length, keywords: ["quest", "pick up"] },
  { name: ".turnin", sub: "Turn in a quest", insert: ".turnin questId >> Turn in QuestName", caret: ".turnin ".length, keywords: ["quest", "complete", "hand in"] },
  { name: ".complete", sub: "Complete a quest objective", insert: ".complete questId,objective", caret: ".complete ".length, keywords: ["objective", "quest"] },
  { name: ".train", sub: "Train a spell/ability", insert: ".train spellId >> Train SpellName", caret: ".train ".length, keywords: ["spell", "ability", "learn", "trainer"] },
  { name: ".mob", sub: "Target/kill a mob", insert: ".mob MobName", caret: ".mob ".length, keywords: ["kill", "enemy", "creature"] },
  { name: ".target", sub: "Set target NPC/mob", insert: ".target Name", caret: ".target ".length, keywords: ["npc", "tab"] },
  { name: ".collect", sub: "Collect an item from drops", insert: ".collect itemId,count", caret: ".collect ".length, keywords: ["item", "gather", "loot"] },
  { name: ".use", sub: "Use an item", insert: ".use itemId", caret: ".use ".length, keywords: ["item", "consume"] },
  { name: ".vendor", sub: "Vendor / sell trash", insert: ".vendor >> Vendor trash", caret: ".vendor >> ".length, keywords: ["sell", "buy", "merchant", "repair"] },
  { name: ".fly", sub: "Take a flight path", insert: ".fly FlightMaster", caret: ".fly ".length, keywords: ["flight", "taxi", "gryphon", "wyvern"] },
  { name: ".hs", sub: "Use Hearthstone", insert: ".hs", keywords: ["hearth", "home", "inn"] },
  { name: ".xp", sub: "Grind until a level/XP", insert: ".xp 10 >> Grind to level 10", caret: ".xp ".length, keywords: ["grind", "level", "experience"] },
  { name: ".skill", sub: "Require a profession skill level", insert: ".skill profession,level", caret: ".skill ".length, keywords: ["profession", "level"] },
  { name: ".money", sub: "Require/track money", insert: ".money amount", caret: ".money ".length, keywords: ["gold", "silver", "copper"] },
  { name: ".waypoint", sub: "Add a pathing waypoint", insert: ".waypoint Zone,x,y", caret: ".waypoint ".length, keywords: ["path", "route", "goto"] },
  { name: ".loop", sub: "Loop / grind a set of mobs", insert: ".loop", keywords: ["grind", "repeat", "farm"] },
  { name: ".bankdeposit", sub: "Deposit items to bank", insert: ".bankdeposit itemId", caret: ".bankdeposit ".length, keywords: ["bank", "store"] },
  { name: ".bankwithdraw", sub: "Withdraw items from bank", insert: ".bankwithdraw itemId", caret: ".bankwithdraw ".length, keywords: ["bank", "retrieve"] },
];

// Static trigger registry: char → { kind, label, items }
export const STATIC_TRIGGERS = {
  "~": { kind: "format", label: "Formatting", items: FORMATTING },
  ".": { kind: "directive", label: "Directive", items: DIRECTIVES },
};

// Filter a static list by the typed query (matches name or keywords).
// Returns rows in the picker's shape: { id, name, sub, insertName/Id/Advanced }.
export function searchStatic(kind, query) {
  const trig = Object.values(STATIC_TRIGGERS).find(t => t.kind === kind);
  if (!trig) return [];
  const q = (query || "").trim().toLowerCase();
  const all = trig.items;
  const matched = q.length === 0
    ? all
    : all.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.keywords || []).some(k => k.includes(q)));
  // Rank: name-prefix first, then the rest, preserving list order otherwise.
  const ranked = matched.slice().sort((a, b) => {
    const ap = a.name.toLowerCase().replace(/^[.~]/, "").startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().replace(/^[.~]/, "").startsWith(q) ? 0 : 1;
    return ap - bp;
  });
  return ranked.map((s, i) => ({
    id: `static-${kind}-${i}`,
    name: s.name,
    sub: s.sub,
    // All three insert modes are identical for static snippets — Enter inserts.
    insertName: s.insert,
    insertId: s.insert,
    insertAdvanced: s.insert,
    caret: s.caret, // optional cursor offset within the inserted text
  }));
}

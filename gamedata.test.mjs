// RXP guide syntax knowledge — embedded as system prompt for AI edits
const SKILL_FILE = `# SKILL: RXP Speedrunning Guide Editor

## What this skill is for

You are editing World of Warcraft Classic speedrunning guides for the **RestedXP (RXP) addon**. These guides are \`.lua\` files containing a domain-specific text language. This skill teaches you the complete syntax so you can read, write, and edit guide steps accurately.

---

## File structure

A guide file is a Lua string passed to \`RXPGuides.RegisterGuide()\`:

\`\`\`lua
RXPGuides.RegisterGuide("Guide Display Name",[[
<< ClassName

#classic
<<Alliance
#name Guide Display Name (section title)
#next Next Section Name

step
... step content ...

step
... step content ...

]])
\`\`\`

### File-level header directives

These appear once at the top of the guide body, before the first \`step\`:

| Directive | Meaning |
|---|---|
| \`<< ClassName\` | Restricts guide to a class (e.g. \`<< Warrior\`, \`<< Rogue\`) |
| \`<<Alliance\` | Restricts guide to Alliance faction |
| \`<<Horde\` | Restricts guide to Horde faction |
| \`#classic\` | Marks guide as for Classic (not Retail) |
| \`#name Title\` | The display name of this section |
| \`#next Title\` | The name of the next guide section that follows this one |

The \`#name\` and \`#next\` values can contain rich text inline icons (see Rich Text section below), e.g.:
\`\`\`
#name Kamisayo |T236448:0|t Speedrun 1-14
\`\`\`

---

## Step structure

Every step begins with the keyword \`step\` on its own line. Steps are separated by a blank line. Directives, display text, and notes can appear in any order within a step (though by convention \`.goto\` comes first, then text lines, then action directives, then \`.target\`).

### Step modifier keywords

These appear on the line immediately after \`step\`, before any other content:

| Modifier | Meaning |
|---|---|
| \`#label LabelName\` | Names this step so other steps can jump to it with \`#completewith LabelName\` |
| \`#completewith LabelName\` | This step is considered complete when the named label step is reached (used to group parallel tasks) |
| \`#completewith next\` | Completes when the very next step is reached |
| \`#loop\` | The step's waypoint path loops continuously until all objectives are met |

Multiple modifiers can appear on consecutive lines after \`step\`.

---

## Display text lines

These lines appear in the guide UI for the player to read.

### \`>>\` — Standard instruction line

\`\`\`
>>Kill |cRXP_ENEMY_Kobold Vermins|r
>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Deputy Willem|r
\`\`\`

Use \`>>\` for all step-by-step player instructions. Multiple \`>>\` lines appear as a bulleted list in the UI.

### \`+\` — Important note / warning highlight

\`\`\`
+|cRXP_WARN_Do not buy anything from a vendor unless the guide tells you to|r
\`\`\`

\`+\` lines are rendered prominently (boxed warning). Use for critical information the player must not miss.

### \`--\` — Comment

\`\`\`
.complete 7,1 --Kill Kobold Vermin (x10)
\`\`\`

Comments appear after directives to explain what the objective is. They are not shown in the UI.

### \`---\` — Disabled directive

\`\`\`
---.buy 2488,1
\`\`\`

Triple-dash disables a directive (treated as a comment). Often used alongside a \`.collect\` directive when the player must buy something manually rather than having automation handle it.

---

## Action directives

All directives begin with \`.\` and go on their own line.

### Navigation

#### \`.goto\` — Navigate to a location

\`\`\`
.goto ZoneName,X,Y
.goto ZoneName,X,Y,Radius
.goto ZoneName,X,Y,Radius,0
.goto ZoneID,X,Y,Radius,0
\`\`\`

- \`ZoneName\`: Human-readable zone name (e.g. \`Elwynn Forest\`, \`Dun Morogh\`, \`StormwindClassic\`, \`The Barrens\`, \`Thousand Needles\`)
- \`ZoneID\`: Numeric internal zone ID (e.g. \`1429\` = Elwynn Forest, \`1426\` = Dun Morogh, \`1453\` = Stormwind). Use numeric IDs when doing patrol loops with many waypoints — they are faster for the addon to process.
- \`X,Y\`: Map coordinates as percentages (e.g. \`48.17,42.94\`)
- \`Radius\`: Optional. The distance in yards at which this waypoint is considered "reached" and the addon advances to the next \`.goto\` in the step. Omit for a destination (the arrow stops there). Common values: \`15\`, \`25\`, \`30\`, \`40\`, \`45\`, \`50\`, \`55\`, \`70\`, \`80\`.
- The trailing \`,0\` tells the addon this is a waypoint in a multi-goto chain (not the final destination). The final \`.goto\` in a chain omits the \`,0\`.

**Multi-waypoint routing pattern** — used for patrol loops or navigating through terrain:
\`\`\`
step
.goto Elwynn Forest,52.55,48.79,0
.goto Elwynn Forest,55.43,45.87,0
.goto Elwynn Forest,52.55,48.79,30,0
.goto Elwynn Forest,53.89,50.52,30,0
.goto Elwynn Forest,55.43,45.87,30,0
>>Kill |cRXP_ENEMY_Defias Thugs|r
.complete 18,1
.mob Defias Thug
\`\`\`
The first block (radius \`,0\`) sets up the initial path without radius checks. The second block (with radius) is the looping patrol route.

#### \`.waypoint\` — Secondary waypoint hint

\`\`\`
.waypoint ZoneName,X,Y,Radius,0
.waypoint ZoneID,X,Y,Radius,0
\`\`\`

Same syntax as \`.goto\`. Used alongside \`.goto\` lines to define sub-waypoints within a step's movement path.

#### \`.loop\` — Looping patrol with coordinate list

\`\`\`
.loop Count,ZoneName,X1,Y1,X2,Y2,X3,Y3,...
\`\`\`

An alternative patrol syntax that encodes all coordinates on one line. \`Count\` is the maximum number of patrol cycles. Coordinates alternate X,Y pairs for each waypoint.

Example:
\`\`\`
.loop 40,Thousand Needles,72.98,80.33,70.89,78.41,73.17,76.19,...
\`\`\`

#### \`.zone\` — Zone transition trigger

\`\`\`
.zone ZoneName >>Flavor text
\`\`\`

Step advances when the player enters the specified zone.

#### \`.subzone\` — Sub-zone trigger

\`\`\`
.subzone SubZoneID >>Flavor text
\`\`\`

Step advances when the player enters the specified sub-zone (by numeric ID, e.g. \`2257\` = Deeprun Tram, \`136\` = The Grizzled Den, \`137\` = Brewnall Village).

#### \`.zoneskip\` — Skip if player is already in zone

\`\`\`
.zoneskip ZoneName
\`\`\`

Skips the current step if the player is already in the named zone. Used with Deeprun Tram steps to avoid confusion.

---

### Quest directives

#### \`.accept QUESTID\` — Accept a quest

\`\`\`
.accept 783 >> Accept A Threat Within
\`\`\`

The \`>> text\` after the quest ID is a label shown in the UI. Always include it.

#### \`.turnin QUESTID\` — Turn in a quest

\`\`\`
.turnin 783 >> Turn in A Threat Within
\`\`\`

#### \`.turnin QUESTID,REWARDINDEX\` — Turn in with reward choice

\`\`\`
.turnin 18,3 >> Turn in Brotherhood of Thieves
.turnin 61,2 >> Turn in Shipment to Stormwind
\`\`\`

The second number selects the reward (1-indexed). Include a note about which reward is selected in the \`>>\` text or as a \`+\` line before the step.

#### \`.complete QUESTID,OBJECTIVEIDX\` — Track quest objective completion

\`\`\`
.complete 7,1 --Kill Kobold Vermin (x10)
.complete 33,1 --Collect Tough Wolf Meat (x8)
\`\`\`

The \`OBJECTIVEIDX\` is the index of the objective within the quest (1-indexed). Multiple \`.complete\` lines track multiple objectives of the same quest or different quests. The \`--comment\` should describe what the objective is and the quantity.

#### \`.isQuestTurnedIn QUESTID\` — Conditional: skip if quest already done

\`\`\`
.isQuestTurnedIn 2078
\`\`\`

Step is skipped if the specified quest has already been turned in.

---

### Interaction directives

#### \`.target NpcName\` — Target an NPC

\`\`\`
.target Deputy Willem
.target +Ma Stonefield
\`\`\`

Places a target arrow on the named NPC. Prefix with \`+\` to add a second target in the same step without replacing the first (used when visiting two NPCs in one step).

#### \`.vendor\` — Visit a vendor

\`\`\`
.vendor >> Vendor trash
.vendor >> Vendor trash and sell your |T134708:0|t[Mining Pick]
\`\`\`

Tells the player to open the vendor and sell junk. Include any specific items to sell in the \`>>\` label.

#### \`.buy ITEMID,QTY\` — Buy from vendor (automated)

Usually appears as \`---.buy\` (disabled) alongside a \`.collect\` check. When enabled, the addon can automate the purchase.

\`\`\`
.collect 2488,1 --Collect Gladius (1)
---.buy 2488,1
\`\`\`

#### \`.collect ITEMID,QTY\` — Check player has item

\`\`\`
.collect 2488,1 --Gladius (1)
.collect 3712,10
\`\`\`

With one additional argument (a quest ID), tracks a quest loot objective:
\`\`\`
.collect 769,4,86,1 --Chunk of Boar Meat (4) for quest 86 objective 1
\`\`\`

Format: \`.collect ITEMID,QTY,QUESTID,OBJECTIVEIDX\`

#### \`.home\` — Set hearthstone

\`\`\`
.home >> Set your Hearthstone to Goldshire
\`\`\`

#### \`.hs\` — Use hearthstone

\`\`\`
.hs >> Hearth to Goldshire
.use 6948
\`\`\`

Always pair \`.hs\` with \`.use 6948\` on the next line (6948 is the Hearthstone item ID).

#### \`.use ITEMID\` — Use an item

\`\`\`
.use 6948
.use 2454
\`\`\`

#### \`.destroy ITEMID\` — Destroy an item

\`\`\`
.destroy 6948 >>Destroy your |T134414:0|t[Hearthstone] to save bag space
\`\`\`

#### \`.fly Destination\` — Take a flight path

\`\`\`
.fly Stormwind >> Fly to Stormwind
.fly Theramore >> Fly to Theramore
\`\`\`

\`Destination\` is the flight point city name as it appears in the game.

#### \`.cast SPELLID\` — Cast a spell

\`\`\`
.cast 2580 >>Cast |T136025:0|t[Find Minerals]
\`\`\`

#### \`.bankdeposit ITEMID,ITEMID,...\` — Deposit items to bank

\`\`\`
.bankdeposit 1127,2592,2712 >>Deposit Wool Cloth, Silk Cloth, Mageweave Cloth
\`\`\`

Multiple item IDs comma-separated. Add a \`>>\` comment listing item names.

#### \`.bankwithdraw ITEMID,ITEMID,...\` — Withdraw items from bank

\`\`\`
.bankwithdraw 5809,5919,5950 >>Withdraw Highperch Venom Sacs, Reethe's Badge and Blackened Iron Shield
\`\`\`

---

### Training directives

#### \`.train SPELLID\` — Train a spell or profession rank

\`\`\`
.train 772 >> Train |T132155:0|t[Rend]
.train 2020 >> Train |T136241:0|t[Blacksmithing]
\`\`\`

Multiple \`.train\` lines can appear in one step for training several spells at the same trainer.

#### \`.train SPELLID,MINLEVEL\` — Train only if minimum level met

\`\`\`
.train 3127,3
\`\`\`

The second argument is a minimum level requirement. Step skips this train if the player is below that level.

#### \`.skill PROFESSIONNAME,CURRENT,TARGET\` — Track profession skill

\`\`\`
.skill blacksmithing,1,1
.skill mining,1,1
\`\`\`

Used after \`.train\` for professions to track that the player learned them.

---

### Status directives

#### \`.mob MobName\` — Tag a mob for kill tracking

\`\`\`
.mob Kobold Vermin
.mob +Timber Wolf
\`\`\`

Lists mobs the player should be killing in this step. Prefix with \`+\` to add a mob to the list without replacing the previous entry. Used in combination with \`.complete\` to track kill objectives.

#### \`.xp LEVEL\` — Grind to level

\`\`\`
.xp 4 >>|cRXP_WARN_Grind to level 4 on these mobs|r
\`\`\`

Step completes when the player reaches the specified level.

#### \`.money <AMOUNT\` — Money check

\`\`\`
.money <0.04
.money <0.17
\`\`\`

The amount is in gold (decimal). \`<0.04\` = less than 4 copper (i.e. check player has less than 4 copper — used to present a conditional step only to players who are broke). \`<0.17\` = less than 17 copper. These are used to show an alternate step to players who can't afford something.

---

## Rich text formatting

### Color spans

These wrap text to colorize it in the UI. The \`|r\` at the end closes the color. The color code and content must be on the same line.

| Code | Color / Use | Example |
|---|---|---|
| \`\\|cRXP_WARN_text\\|r\` | Orange/red — warnings, important alerts | \`\\|cRXP_WARN_Do not sell this\\|r\` |
| \`\\|cRXP_FRIENDLY_NpcName\\|r\` | Green — friendly NPC names | \`\\|cRXP_FRIENDLY_Deputy Willem\\|r\` |
| \`\\|cRXP_ENEMY_MobName\\|r\` | Red — enemy mob names | \`\\|cRXP_ENEMY_Kobold Vermin\\|r\` |
| \`\\|cRXP_LOOT_ItemName\\|r\` | Yellow — items to loot | \`\\|cRXP_LOOT_Tough Wolf Meat\\|r\` |
| \`\\|cRXP_BUY_text\\|r\` | Blue — buy instructions | \`\\|cRXP_BUY_Buy a Gladius from her\\|r\` |
| \`\\|cRXP_PICK_ObjectName\\|r\` | Purple — interactable objects, clickable things, UI elements | \`\\|cRXP_PICK_Ammo Crate\\|r\` |

**Important:** \`|r\` closes any open color. Do not nest color spans.

### Inline icons

\`\`\`
|TICONID:0|t
|Tinterface/worldmap/chatbubble_64grey.blp:20|t
\`\`\`

- \`|T\` opens an inline texture, \`|t\` closes it.
- \`ICONID\` is the Wowhead icon file ID (a numeric ID). Size is always \`:0\` (auto-size).
- The chat bubble icon uses a texture path instead: \`interface/worldmap/chatbubble_64grey.blp\` at size \`20\`.
- To find the correct icon ID for a spell, item, or ability, look it up on Wowhead — the icon file ID is in the item/spell page URL or tooltip data.

**Chat bubble prefix — used on every NPC talk line:**
\`\`\`
>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_NpcName|r
\`\`\`

**Item/spell inline format:**
\`\`\`
|T135321:0|t[Weapons]
|T132155:0|t[Rend]
|T133787:0|t[Money]
|T134414:0|t[Hearthstone]
\`\`\`

The bracketed \`[Name]\` after the icon is display text shown as a tooltip label. It is optional but conventional.

### Money icons

| Icon | Meaning |
|---|---|
| \`\\|T133787:0\\|t[Money]\` | Silver coin icon |
| \`\\|T133789:0\\|t[Copper]\` | Copper coin icon |

---

## Common step patterns

### Talk to NPC and accept quest

\`\`\`
step
.goto Elwynn Forest,48.171,42.943
>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Deputy Willem|r
.accept 5261 >> Accept Eagan Peltskinner
.target Deputy Willem
\`\`\`

### Turn in quest and accept follow-up

\`\`\`
step
.goto Elwynn Forest,48.941,40.166
>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Eagan Peltskinner|r
.turnin 5261 >> Turn in Eagan Peltskinner
.accept 33 >> Accept Wolves Across The Border
.target Eagan Peltskinner
\`\`\`

### Kill mobs for objectives

\`\`\`
step
#completewith next
>>Kill |cRXP_ENEMY_Young Wolves|r and |cRXP_ENEMY_Timber Wolves|r. Loot them for their |cRXP_LOOT_Tough Wolf Meat|r
>>Kill |cRXP_ENEMY_Kobold Vermins|r
.complete 7,1 --Kill Kobold Vermin (x10)
.complete 33,1 --Collect Tough Wolf Meat (x8)
.xp 4 >>|cRXP_WARN_Grind to level 4 on these mobs|r
.mob Young Wolf
.mob Timber Wolf
.mob Kobold Vermin
\`\`\`

### Train spells at a trainer

\`\`\`
step
.goto Elwynn Forest,50.242,42.287
>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Llane Beshere|r
.train 100 >> Train |T132337:0|t[Charge]
.train 772 >> Train |T132155:0|t[Rend]
.target Llane Beshere
\`\`\`

### Vendor trash

\`\`\`
step
.goto Elwynn Forest,47.7,41.4
>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Godric|r
.vendor >> Vendor trash
.target Godric Rothmar
\`\`\`

### Patrol loop with kill objectives

\`\`\`
step
#loop
.goto 1429,47.784,31.540,0
.goto 1429,48.659,29.161,0
.goto 1429,50.491,26.867,0
.goto 1429,47.784,31.540,30,0
.goto 1429,47.909,30.850,30,0
.goto 1429,48.659,29.161,30,0
.goto 1429,50.491,26.867,30,0
>>Kill |cRXP_ENEMY_Kobold Laborers|r inside the Echo Ridge Mine
.complete 21,1 --Kill Kobold Laborer (x12)
.mob Kobold Laborer
\`\`\`

### Buy an item (with manual buy fallback)

\`\`\`
step
.goto Elwynn Forest,41.529,65.900
>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Corina Steele|r
>>|cRXP_BUY_Buy a|r |T135321:0|t[Gladius] |cRXP_BUY_from her. Sell your|r |T135274:0|t[Militia Shortsword]
.collect 2488,1 --Collect Gladius (1)
---.buy 2488,1
.target Corina Steele
\`\`\`

### Hearth to a location

\`\`\`
step
.hs >> Hearth to Goldshire
.use 6948
\`\`\`

### Conditional alternate steps using \`.money\`

When two consecutive steps cover the same action but one includes an extra training item (for players who can afford it):
\`\`\`
step
.goto Elwynn Forest,50.242,42.287
>>Talk to Llane Beshere
.turnin 3100 >> Turn in Simple Letter
.train 100 >> Train Charge
.train 772 >> Train Rend
.target Llane Beshere
.money <0.04

step
.goto Elwynn Forest,50.242,42.287
>>Talk to Llane Beshere
.turnin 3100 >> Turn in Simple Letter
.train 100 >> Train Charge
.target Llane Beshere
\`\`\`

The first step shows to players with less than 4 copper; the second shows to others.

### Flight path

\`\`\`
step
.goto Redridge Mountains,30.590,59.410
>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Ariena Stormfeather|r
.fly Stormwind >> Fly to Stormwind
.target Ariena Stormfeather
\`\`\`

### Stuck character teleport trick

Used for the RXP-specific "stuck character" speedrun teleport trick:
\`\`\`
step
.goto Elwynn Forest,53.5,67.6,10 >>Once you reach a certain point on this flight path, the guide will say "LOG OUT NOW"
>>When this happens, log out and use the "Stuck Character Service" on battle.net

step
.goto Elwynn Forest,39.3,60.5,15 >>LOG OUT NOW
\`\`\`

### Branch convergence with \`#label\` and \`#completewith\`

\`\`\`
step
#completewith Godric
... do task A ...

step
... do task B ...

step
#label Godric
.goto Elwynn Forest,47.7,41.4
>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Godric|r
.vendor >> Vendor trash
.target Godric Rothmar
\`\`\`

The \`#completewith Godric\` step completes when the player reaches the \`#label Godric\` step, regardless of order.

---

## Looking up IDs

When writing or editing steps, you will often need to look up numeric IDs. Use web search on Wowhead Classic.

### Quest IDs

Search: \`wowhead.com/classic/quest=QUESTNAME\` or \`site:wowhead.com classic "Quest Name"\`. The quest ID is in the URL: \`wowhead.com/classic/quest=783\` → quest ID is \`783\`.

### Spell / training IDs

Search: \`wowhead.com/classic/spell=SPELLNAME\`. The spell ID is in the URL. For trainer spells, find the specific rank: "Sinister Strike Rank 2" has a different ID from Rank 1.

### Item IDs

Search: \`wowhead.com/classic/item=ITEMNAME\`. Item ID is in the URL.

### Icon IDs

On any Wowhead item or spell page, the icon is embedded in the page. The icon file ID appears in the page source as \`"icon":NNNNN\`. Alternatively, the icon texture name (e.g. \`ability_rogue_sinisterstrike\`) can be found on the page and mapped to an ID via \`wowhead.com/icon=ICONNAME\`.

### NPC locations and coordinates

Search: \`wowhead.com/classic/npc=NPCNAME\`. The NPC page shows zone and map coordinates. Convert Wowhead's percentage coordinates directly to RXP \`.goto\` format — they use the same coordinate system.

### Zone IDs (numeric)

Zone IDs are internal map IDs used in multi-waypoint goto chains. Common ones:
| Zone | ID |
|---|---|
| Elwynn Forest | 1429 |
| Dun Morogh | 1426 |
| Stormwind City | 1453 |
| Westfall | 1436 |
| Redridge Mountains | 1441 |
| Loch Modan | 1432 |
| The Barrens | 1413 |
| Thousand Needles | 1447 |
| Dustwallow Marsh | 1445 |
| Ashenvale | 1440 |

When in doubt, use the human-readable zone name — it works for simple destination gotos.

---

## Important conventions

1. **Always include \`.target NpcName\` after NPC interaction steps.** This places an arrow on the NPC.
2. **Use \`+\` prefix on \`.target\` to add a second target** without clearing the first (e.g. when two NPCs are at the same location).
3. **Always include a \`>> text\` label on \`.accept\`, \`.turnin\`, \`.train\`, \`.fly\`** — this is what the player sees in the UI.
4. **Comments on \`.complete\` lines** should describe the objective and quantity in a human-readable format: \`--Kill Kobold Vermin (x10)\`.
5. **Never write \`.buy\` as an active directive** — always write it as \`---.buy\` (disabled) alongside a \`.collect\` check, so players with addon automation get both options.
6. **Chat bubble icon goes at the start of every \`>>\` line involving NPC dialogue:** \`>>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to ...\`
7. **Patrol route conventions:** First pass of \`.goto\` lines uses \`,0\` suffix and no radius (sets initial path). Second pass of \`.goto\` lines uses \`Radius,0\` (defines the looping patrol). Final \`.goto\` in the step omits \`,0\` entirely.
8. **\`#label\` names are case-sensitive** and must exactly match their \`#completewith\` references.
9. **Multiple objectives in one step:** list all \`.complete\` and \`.mob\` lines together; the step is done when all are satisfied.
10. **\`>>\` lines within a step are shown as a bulleted list in order** — put the most important instruction first.
11. **Icon embeds in \`#name\` and \`#next\` headers** use the same \`|T...|t\` syntax as in step text.

---

## Editing checklist

When making any edit to a guide step:

- [ ] Does the \`.goto\` have the correct zone name/ID and coordinates for the NPC or location?
- [ ] Is the NPC name spelled correctly in both \`|cRXP_FRIENDLY_...|r\` and \`.target\`?
- [ ] Does \`.accept\` / \`.turnin\` use the correct quest ID? (Verify on Wowhead)
- [ ] Does \`.train\` use the correct spell ID for the right rank? (Verify on Wowhead)
- [ ] Does every \`|T...:0|t\` icon reference use the right icon ID?
- [ ] Are all color spans closed with \`|r\`?
- [ ] Is there a \`>> text\` label after every \`.accept\`, \`.turnin\`, \`.train\`, \`.fly\`?
- [ ] Is there a \`.target\` line for every NPC interaction step?
- [ ] If this step is part of a \`#completewith\` chain, does the label still resolve correctly?
- [ ] For patrol steps: does the \`.goto\` chain follow the first-pass / second-pass radius convention?
`;

export default SKILL_FILE;

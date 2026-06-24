# Game data extraction

The editor's local game database (`src/data/*.json`) is derived from
[pfQuest](https://github.com/shagu/pfQuest) (GPLv3), which ships WoW Classic
content with coordinates already converted to map-percentage and tagged by zone
— exactly the format RXP `.goto` lines use.

## Regenerating the data

```bash
# 1. Get pfQuest's vanilla (Era) data
git clone --depth 1 --filter=blob:none --sparse https://github.com/shagu/pfQuest.git
cd pfQuest && git sparse-checkout set db && cd ..

# 2. Extract to lean JSON (requires lua5.3)
lua5.3 scripts/extract-gamedata.lua pfQuest/db src/data
```

This emits `quests.json`, `npcs.json`, `items.json`, `zones.json`.

## What's covered vs. not

| Data | Source | In local DB? |
|---|---|---|
| Quest name → ID, level, start/end NPC | pfQuest | ✅ |
| NPC name → ID + spawn coords + zone | pfQuest | ✅ |
| Item name → ID | pfQuest | ✅ |
| Zone name ↔ ID | pfQuest | ✅ |
| Spell name → ID, **all ranks + levels** (for `.train`/`.cast`) | VMaNGOS | ✅ |
| Item/spell icon file IDs (for `\|T<id>:0\|t`) | — | ❌ web_search fallback |

Spell names live in the client `Spell.dbc`, which CMaNGOS/classic-db does not
ship (it loads spells from the DBC at runtime). VMaNGOS, however, mirrors the
DBC into a `spell_template` SQL table *with names and ranks* — so spells come
from the [brotalnia/database](https://github.com/brotalnia/database) VMaNGOS
world dump. See `scripts/parse-spells.py`.

The only remaining web_search case is **icon file IDs** (the numeric `132155`
in `\|T132155:0\|t`). These are texture FileDataIDs that require mapping
item/spell → SpellIcon/ItemDisplayInfo → a client listfile — out of scope here.
Icons are cosmetic; the AI can copy an existing icon token or omit it.

## Regenerating spell data

```bash
# Download the VMaNGOS world DB (has spell names; pfQuest/CMaNGOS don't)
curl -L https://github.com/brotalnia/database/raw/master/world_full_14_june_2021.7z -o vmangos.7z
7z x vmangos.7z

python3 scripts/parse-spells.py world_full_14_june_2021.sql spells_raw.json
python3 scripts/build-spells.py spells_raw.json src/data/spells.json
```

## Use the underlying open DB instead

If you ever want fuller data (icons, spells, professions), the cmangos
[classic-db](https://github.com/classicdb/database) SQL dump is the canonical
source ClassicDB.ch itself runs on — but its `creature` table stores raw world
coordinates, so you'd have to do the world→map-percent conversion yourself
(per-zone WorldMapArea bounds). pfQuest already did that conversion, which is
why it's the better starting point here.

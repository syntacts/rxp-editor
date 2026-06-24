#!/usr/bin/env python3
"""build_spells.py — turn parsed VMaNGOS spell_template data into a lean
name->id lookup for the RXP editor's .train support.

Input:  spells_raw.json  ({ id: {name, rank, icon, lvl, build} })
Output: spells.json       ({ byName: {lowername: [{id,rank,lvl}]}, byId: {id:{name,rank,lvl}} })

Spells that share a name (different ranks) are grouped, so a lookup for
"sinister strike" returns every rank with its level, letting the AI pick the
right one for the guide's level bracket.
"""
import json, re, sys

raw = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'spells_raw.json'))
raw = {int(k): v for k, v in raw.items()}

def is_junk(name):
    if not name or name.strip() == "":
        return True
    low = name.lower()
    for bad in ("test", "unused", "deprecated", "[ph]", "ph]", "deprecate",
                "qaqa", "zzold", "z_", "oldspell", "monster", "creature -",
                "internal", "debug", "[dnd]", "(dnd)", "(old)", "do not use"):
        if bad in low:
            return True
    if name.startswith("?") or name.startswith("$"):
        return True
    return False

byId, byName = {}, {}
for sid, s in raw.items():
    name = s["name"].strip()
    if is_junk(name):
        continue
    rank = (s.get("rank") or "").strip()
    lvl = s.get("lvl") or 0
    rec = {"name": name, "rank": rank, "lvl": lvl}
    byId[sid] = rec
    key = name.lower()
    byName.setdefault(key, []).append({"id": sid, "rank": rank, "lvl": lvl})

# Sort each name's ranks by level then id for stable, sensible ordering.
def rank_num(r):
    m = re.search(r'(\d+)', r or "")
    return int(m.group(1)) if m else 0
for key in byName:
    byName[key].sort(key=lambda e: (e["lvl"], rank_num(e["rank"]), e["id"]))

out = {"byId": byId, "byName": byName}
json.dump(out, open(sys.argv[2] if len(sys.argv) > 2 else 'spells.json', 'w'),
          separators=(',', ':'), ensure_ascii=False)

print(f"Spells: {len(byId)}  unique names: {len(byName)}")
# quick checks
for probe in ["rend", "sinister strike", "fireball", "blacksmithing"]:
    n = len(byName.get(probe, []))
    print(f"  {probe!r}: {n} rank(s)")

#!/usr/bin/env python3
"""parse-spells.py — extract spell name/rank/level/id from a VMaNGOS world DB
dump (brotalnia/database) into spells_raw.json, then run build-spells.py.

Usage:
  # 1. download + extract the VMaNGOS world DB (7z -> .sql), then:
  python3 scripts/parse-spells.py world_full_<date>.sql spells_raw.json
  python3 scripts/build-spells.py spells_raw.json src/data/spells.json

The VMaNGOS `spell_template` table carries spell names + nameSubtext (rank),
which the CMaNGOS/classic-db dump does NOT (CMaNGOS loads spells from the
client DBC). That's why spells use this second source.
"""
import sys, json

ENTRY, BUILD, SPELLLEVEL, SPELLICON, NAME, NAMESUB = 0, 1, 30, 121, 124, 126

def parse_tuples(s, start):
    rows, i, n = [], start, len(s)
    while i < n:
        c = s[i]
        if c == ';': break
        if c == '(':
            i += 1; fields, cur, in_str = [], [], False
            while i < n:
                ch = s[i]
                if in_str:
                    if ch == '\\': cur.append(s[i:i+2]); i += 2; continue
                    if ch == "'": in_str = False; cur.append(ch); i += 1; continue
                    cur.append(ch); i += 1; continue
                else:
                    if ch == "'": in_str = True; cur.append(ch); i += 1; continue
                    if ch == ',': fields.append(''.join(cur).strip()); cur = []; i += 1; continue
                    if ch == ')': fields.append(''.join(cur).strip()); i += 1; rows.append(fields); break
                    cur.append(ch); i += 1; continue
        else: i += 1
    return rows, i

def unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == "'" and v[-1] == "'":
        return v[1:-1].replace("\\'", "'").replace('\\"', '"').replace('\\\\', '\\')
    return v

def main():
    sql = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else 'spells_raw.json'
    content = open(sql, encoding='utf-8', errors='replace').read()
    spells, pos = {}, 0
    marker = "INSERT INTO `spell_template`"
    while True:
        p = content.find(marker, pos)
        if p == -1: break
        v = content.find("VALUES", p)
        rows, end = parse_tuples(content, v + 6)
        for f in rows:
            if len(f) < 127: continue
            try: entry = int(f[ENTRY]); build = int(f[BUILD])
            except: continue
            name = unquote(f[NAME])
            if not name: continue
            try: icon = int(f[SPELLICON])
            except: icon = 0
            try: lvl = int(f[SPELLLEVEL])
            except: lvl = 0
            if entry not in spells or build == 5875:
                spells[entry] = {'name': name, 'rank': unquote(f[NAMESUB]),
                                 'icon': icon, 'lvl': lvl, 'build': build}
        pos = end
    json.dump(spells, open(out, 'w'))
    print(f"Parsed {len(spells)} spells -> {out}")

if __name__ == '__main__':
    main()

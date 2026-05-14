#!/usr/bin/env python3
"""Validate the built JSON against the contract js/app.js relies on, and check
that every hover-link target actually resolves to a section in the right
document. Run after build_data.py.

Exit code 0 = all good, 1 = problems found.
"""
import json
import sys
from pathlib import Path

DATA = Path(__file__).parent.parent / "data"
errors = []
warnings = []


def err(m): errors.append(m)
def warn(m): warnings.append(m)


def load(name):
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8"))
    except Exception as e:                       # noqa: BLE001
        err(f"{name}: cannot load — {e}")
        return None


bill = load("bill.json")
orig = load("act-original.json")
prop = load("act-proposed.json")
pe = load("plain-english.json")
if errors:
    print("\n".join(errors)); sys.exit(1)

# ---- act files: shape + section index integrity ---------------------------
orig_sections, prop_sections = set(), set()
for name, doc, bag in (("act-original.json", orig, orig_sections),
                       ("act-proposed.json", prop, prop_sections)):
    if not isinstance(doc.get("meta", {}).get("compilation"), str):
        err(f"{name}: meta.compilation missing")
    idx = doc.get("sectionIndex", {})
    seen_ids = set()
    for i, n in enumerate(doc.get("nodes", [])):
        if n["type"] != "section":
            continue
        bag.add(n["num"])
        if n["id"] in seen_ids:
            err(f"{name}: duplicate section id {n['id']}")
        seen_ids.add(n["id"])
        if not n.get("heading"):
            warn(f"{name}: section {n['num']} has no heading")
        if idx.get(n["num"]) != i:
            err(f"{name}: sectionIndex[{n['num']}] != node position")
        block_ids = set()
        for b in n.get("blocks", []):
            if not all(k in b for k in ("id", "kind", "text")):
                err(f"{name}: {n['id']} has a malformed block")
            if b["id"] in block_ids:
                err(f"{name}: duplicate block id {b['id']}")
            block_ids.add(b["id"])
    if not bag:
        err(f"{name}: no sections parsed")

# ---- bill file: shape + every jump target resolves ------------------------
items = [n for n in bill.get("nodes", []) if n["type"] == "item"]
if not items:
    err("bill.json: no items parsed")
if not bill.get("meta", {}).get("title"):
    err("bill.json: meta.title missing")

item_ids = set()
unresolved = 0
for it in items:
    for k in ("num", "descriptor", "id", "content", "target"):
        if k not in it:
            err(f"bill.json: item missing '{k}': {it.get('num')}")
    if it["id"] in item_ids:
        err(f"bill.json: duplicate item id {it['id']}")
    item_ids.add(it["id"])

    t = it["target"] or {}
    # every section the UI offers as a jump must exist in the target document
    if t.get("section") and t["section"] not in orig_sections:
        err(f"item {it['num']}: target section s{t['section']} not in original Act")
    if t.get("relatedSection") and t["relatedSection"] not in orig_sections:
        err(f"item {it['num']}: relatedSection s{t['relatedSection']} not in original Act")
    for ns in t.get("newSections", []):
        if ns not in prop_sections:
            err(f"item {it['num']}: newSection s{ns} not in proposed Act")
    # an item with no jump at all is allowed, but worth counting
    if not t.get("section") and not t.get("newSections") and not t.get("relatedSection"):
        unresolved += 1

# ---- plain-English keys must reference real block ids ---------------------
all_block_ids = set()
for doc in (orig, prop):
    for n in doc["nodes"]:
        if n["type"] == "section":
            for b in n["blocks"]:
                all_block_ids.add(b["id"])
stray = [k for k in (pe or {}) if k not in all_block_ids]
if stray:
    err(f"plain-english.json: {len(stray)} keys don't match any block id "
        f"(e.g. {stray[:3]})")

# ---- report ---------------------------------------------------------------
print(f"bill: {len(items)} items  ({unresolved} with no jump target — structural)")
print(f"act-original: {len(orig_sections)} sections")
print(f"act-proposed: {len(prop_sections)} sections")
print(f"plain-english: {len(pe or {})} translations")
for w in warnings:
    print(f"  warn: {w}")
if errors:
    print(f"\n{len(errors)} ERROR(S):")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
print("\nAll checks passed — data contract intact, every jump target resolves.")

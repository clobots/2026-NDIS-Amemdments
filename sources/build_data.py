#!/usr/bin/env python3
"""Parse the downloaded legislation HTML into the structured JSON the web app
renders from.

Inputs  (sources/):  amending-act-2026_C2026A00041.html
                     ndis-act-2013_2024-10-03.html
                     ndis-act-2013_2026-05-06.html
Outputs (data/):     bill.json  act-original.json  act-proposed.json

Run:  python3 build_data.py            # build all three
      python3 build_data.py --inspect  # dump block-class streams for debugging
"""
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

HERE = Path(__file__).parent
DATA = HERE.parent / "data"

AMENDING = HERE / "amending-act-2026_C2026A00041.html"
ACT_ORIG = HERE / "ndis-act-2013_2024-10-03.html"
ACT_PROP = HERE / "ndis-act-2013_2026-05-06.html"

SKIP_PREFIX = ("TOC", "Header", "ENote")

# em-dash splitter for "Schedule 1—Title", "Part 1—Title", "Chapter 1—Title"
HEAD_SPLIT = re.compile(r"^(Schedule|Part|Division|Chapter|Subdivision)\s+([^—\-]+?)\s*[—\-]\s*(.+)$")
SECT_SPLIT = re.compile(r"^(\d+[A-Z]*)\s+(.+)$")
# a provision reference in an item descriptor -> the existing section it touches
TARGET_RE = re.compile(
    r"\b(?:section|subsection|subsections|paragraph|paragraphs|subparagraph)s?\s+(\d+[A-Z]*)",
    re.I,
)
QUOTE_RE = re.compile(r"[“”\"]([^“”\"]+)[“”\"]")


def blocks(path):
    """Ordered (css_class, text) for every classed <p> in the document."""
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    out = []
    for p in soup.find_all("p"):
        cls = p.get("class")
        if not cls:
            continue
        # str.split() collapses every Unicode space (incl. \xa0, narrow nbsp)
        text = " ".join(p.get_text().replace("‑", "-").split())
        if text:
            out.append((cls[0], text))
    return out


# --------------------------------------------------------------------------
# Amending Act  ->  bill.json
# --------------------------------------------------------------------------
def derive_target(descriptor, content):
    """Work out which existing NDIS Act section an item touches, and which new
    sections it inserts."""
    new_sections = []
    for b in content:
        if b["kind"] == "head-section":
            m = SECT_SPLIT.match(b["text"])
            if m:
                new_sections.append(m.group(1))

    m = TARGET_RE.search(descriptor)
    section = m.group(1) if m else None

    if section:
        kind = "insert-section" if new_sections else "amend"
    elif new_sections:
        kind = "insert-section"
    elif re.match(r"(Application|Transitional|Savings)", descriptor, re.I):
        kind = "provision"
    else:
        kind = "structural"

    # provision/structural items have no section in their heading, but their
    # body often names the section they relate to — surface it as a soft link.
    related = None
    if section is None:
        for b in content:
            cm = TARGET_RE.search(b["text"])
            if cm:
                related = cm.group(1)
                break

    quotes = [q.strip() for b in content for q in QUOTE_RE.findall(b["text"]) if q.strip()]
    return {
        "section": section,
        "relatedSection": related,
        "newSections": new_sections,
        "kind": kind,
        "quotes": sorted(set(quotes), key=len, reverse=True),
    }


def parse_bill(path):
    bl = blocks(path)
    meta = {"id": "C2026A00041"}
    nodes = []
    in_schedules = False
    cur_item = None
    cur_section = None  # the bill's own ss 1-3, before the schedules

    # content classes that belong to whatever item / bill-section is open
    INSERTED_HEAD = {"ActHead3": "head-division", "ActHead4": "head-subdivision",
                     "ActHead5": "head-section"}

    for cls, text in bl:
        if cls.startswith(SKIP_PREFIX):
            continue

        if cls == "ShortT" and "title" not in meta:
            meta["title"] = text
            continue
        if cls == "Actno" and "no" not in meta:
            meta["no"] = text
            continue
        if cls == "LongT" and "longTitle" not in meta:
            meta["longTitle"] = text
            continue
        if cls == "AssentDt":
            meta["assent"] = text.strip("[]")
            continue
        if cls in ("ShortTP1", "ActNoP1", "Page1"):
            continue  # duplicate reprint of the title block

        if cls == "ActHead6":  # Schedule
            in_schedules = True
            cur_item = cur_section = None
            m = HEAD_SPLIT.match(text)
            num, title = (m.group(2), m.group(3)) if m else ("", text)
            nodes.append({"type": "schedule", "num": num, "title": title,
                          "id": f"sch{num}", "raw": text})
            continue
        if cls == "ActHead7":  # Part
            cur_item = None
            m = HEAD_SPLIT.match(text)
            num, title = (m.group(2), m.group(3)) if m else ("", text)
            nodes.append({"type": "part", "num": num, "title": title, "raw": text})
            continue
        if cls == "ActHead8":  # Division within a schedule part
            cur_item = None
            m = HEAD_SPLIT.match(text)
            num, title = (m.group(2), m.group(3)) if m else ("", text)
            nodes.append({"type": "division", "num": num, "title": title, "raw": text})
            continue
        if cls == "ActHead9":  # the amended Act's name
            cur_item = None
            nodes.append({"type": "act-ref", "text": text})
            continue

        if cls in ("ItemHead", "Transitional"):
            # 'Transitional' marks the heading of application/transitional/
            # savings provision items (otherwise structured like any item).
            m = SECT_SPLIT.match(text)
            num, descriptor = (m.group(1), m.group(2)) if m else ("", text)
            cur_item = {"type": "item", "num": num, "descriptor": descriptor,
                        "id": f"item-{len(nodes)}", "content": [], "target": None}
            nodes.append(cur_item)
            continue

        if cls == "ActHead5" and not in_schedules:
            # the amending Act's own sections 1-3
            m = SECT_SPLIT.match(text)
            num, heading = (m.group(1), m.group(2)) if m else ("", text)
            cur_section = {"type": "bill-section", "num": num, "heading": heading,
                           "id": f"bill-s{num}", "content": []}
            cur_item = None
            nodes.append(cur_section)
            continue

        # everything else is a content block belonging to the open item / section
        block = {"kind": INSERTED_HEAD.get(cls, cls), "text": text}
        if cur_item is not None:
            cur_item["content"].append(block)
        elif cur_section is not None:
            cur_section["content"].append(block)
        # else: stray front/trailing matter — ignore

    for n in nodes:
        if n["type"] == "item":
            n["target"] = derive_target(n["descriptor"], n["content"])

    return {"meta": meta, "nodes": nodes}


# --------------------------------------------------------------------------
# NDIS Act compilations  ->  act-original.json / act-proposed.json
# --------------------------------------------------------------------------
def parse_act(path, compilation):
    bl = blocks(path)
    meta = {"id": "C2013A00020", "compilation": compilation}
    nodes = []
    section_index = {}
    cur_section = None

    for cls, text in bl:
        if cls.startswith(SKIP_PREFIX):
            continue

        if cls == "ShortT" and "title" not in meta:
            meta["title"] = text
            continue
        if cls == "CompiledActNo" and "no" not in meta:
            meta["no"] = text
            continue
        if cls == "LongT" and "longTitle" not in meta:
            meta["longTitle"] = text
            continue

        if cls in ("ActHead1", "ActHead2", "ActHead3", "ActHead4"):
            kind = {"ActHead1": "chapter", "ActHead2": "part",
                    "ActHead3": "division", "ActHead4": "subdivision"}[cls]
            cur_section = None
            m = HEAD_SPLIT.match(text)
            num, title = (m.group(2), m.group(3)) if m else ("", text)
            nodes.append({"type": kind, "num": num, "title": title, "raw": text})
            continue

        if cls == "ActHead5":  # section
            m = SECT_SPLIT.match(text)
            num, heading = (m.group(1), m.group(2)) if m else (text, text)
            cur_section = {"type": "section", "num": num, "id": f"s{num}",
                           "heading": heading, "blocks": []}
            section_index[num] = len(nodes)
            nodes.append(cur_section)
            continue

        if cur_section is not None:
            n = len(cur_section["blocks"]) + 1
            cur_section["blocks"].append({
                "id": f"{cur_section['id']}-b{n}", "kind": cls, "text": text,
            })

    return {"meta": meta, "sectionIndex": section_index, "nodes": nodes}


# --------------------------------------------------------------------------
def inspect():
    for path in (AMENDING, ACT_ORIG):
        bl = blocks(path)
        print(f"\n{'='*70}\n{path.name} — {len(bl)} blocks\n{'='*70}")
        shown = 0
        for cls, text in bl:
            if cls.startswith(SKIP_PREFIX):
                continue
            print(f"  [{cls:16s}] {text[:86]}")
            shown += 1
            if shown >= 70:
                break


def build():
    DATA.mkdir(exist_ok=True)

    bill = parse_bill(AMENDING)
    (DATA / "bill.json").write_text(json.dumps(bill, ensure_ascii=False, indent=1))

    orig = parse_act(ACT_ORIG, "2024-10-03")
    (DATA / "act-original.json").write_text(json.dumps(orig, ensure_ascii=False, indent=1))

    prop = parse_act(ACT_PROP, "2026-05-06")
    (DATA / "act-proposed.json").write_text(json.dumps(prop, ensure_ascii=False, indent=1))

    # ---- validation summary ----
    items = [n for n in bill["nodes"] if n["type"] == "item"]
    scheds = [n for n in bill["nodes"] if n["type"] == "schedule"]
    parts = [n for n in bill["nodes"] if n["type"] == "part"]
    with_section = [i for i in items if i["target"]["section"]]
    inserts = [i for i in items if i["target"]["newSections"]]
    no_target = [i for i in items if i["target"]["kind"] in ("structural", "provision")]
    print(f"bill.json          {len(scheds)} schedules, {len(parts)} parts, {len(items)} items")
    print(f"                   {len(with_section)} map to an existing section, "
          f"{len(inserts)} insert new sections, {len(no_target)} structural/provision")
    print(f"act-original.json  {len(orig['sectionIndex'])} sections  (compilation {orig['meta']['compilation']})")
    print(f"act-proposed.json  {len(prop['sectionIndex'])} sections  (compilation {prop['meta']['compilation']})")
    # surface any items the regex could not classify, for manual review
    unmapped = [f"{i['num']}: {i['descriptor']}" for i in items
                if i["target"]["kind"] == "structural"]
    if unmapped:
        print("  structural (no section ref) — expected for Part/Division/Chapter edits:")
        for u in unmapped:
            print(f"    - {u}")


if __name__ == "__main__":
    if "--inspect" in sys.argv:
        inspect()
    else:
        build()

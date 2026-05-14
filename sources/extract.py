#!/usr/bin/env python3
"""Convert downloaded legislation HTML (Federal Register of Legislation) into
clean, paragraph-preserving plain text for verbatim extraction.

Usage:  python3 extract.py            # converts every *.html in this dir
        python3 extract.py FILE ...   # converts the named files
"""
import re
import sys
import html
from pathlib import Path

HERE = Path(__file__).parent
BLOCK_CLOSE = re.compile(r"</(p|div|h[1-6]|tr|li|table|ul|ol|section)\s*>", re.I)
BR = re.compile(r"<br\s*/?>", re.I)
TAG = re.compile(r"<[^>]+>")
WS = re.compile(r"[ \t   ]+")


def to_text(raw: str) -> str:
    s = BR.sub("\n", raw)
    s = BLOCK_CLOSE.sub("\n", s)
    s = TAG.sub("", s)
    s = html.unescape(s)
    # normalise the various non-breaking / narrow spaces to a plain space,
    # but keep the non-breaking hyphen (‑) -> ordinary hyphen for grep-ability
    s = s.replace("‑", "-")
    out = []
    for line in s.split("\n"):
        line = WS.sub(" ", line).strip()
        if line:
            out.append(line)
    return "\n".join(out) + "\n"


def main(argv):
    files = [Path(a) for a in argv] if argv else sorted(HERE.glob("*.html"))
    for f in files:
        raw = f.read_text(encoding="utf-8", errors="replace")
        txt = to_text(raw)
        dest = f.with_suffix(".txt")
        dest.write_text(txt, encoding="utf-8")
        print(f"{f.name:45s} -> {dest.name}  ({len(txt.splitlines())} lines)")


if __name__ == "__main__":
    main(sys.argv[1:])

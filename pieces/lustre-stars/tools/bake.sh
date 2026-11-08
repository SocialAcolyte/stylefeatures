#!/bin/sh
# Rebuild assets/frieze.webp and assets/frieze-tiles.png from The Met's DP231256 (accession 91.1.106 panel group).
# usage: tools/bake.sh <DP231256.jpg> <scratch dir>     (needs uv; nothing here is loaded by the page)
set -e
SRC="$1"; OUT="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"; ASSETS="$HERE/../assets"
mkdir -p "$OUT"
PY="uv run --with numpy --with scipy --with scikit-image --with pillow python -I"
$PY "$HERE/fg.py" "$SRC" "$OUT"                                           # tiles vs the grey wall
$PY "$HERE/fitstars2.py" "$SRC" "$OUT" '[[570,680,360],[1320,640,360],[2080,640,360],[2800,630,360],[540,1470,360],[1330,1490,360],[2080,1470,360],[2790,1480,360],[3570,1500,360]]'
$PY "$HERE/snap.py" "$SRC" "$OUT"                                         # each star edge onto its joint
$PY "$HERE/ws.py" "$SRC" "$OUT" '[[890,1074,60,235],[1670,1070,60,235],[2440,1080,60,235],[3180,1090,60,235]]' 0.01
$PY "$HERE/clip.py" "$OUT" "$SRC"                                         # regions clipped to their own shape
$PY "$HERE/clip2.py" "$OUT" "$SRC"                                        # crosses cut off the top row exactly
$PY "$HERE/frieze.py" "$SRC" "$OUT"
$PY "$HERE/bake.py" "$SRC" "$OUT" "$ASSETS" 2400

#!/bin/sh
# ./run.sh cut.py [ids] | export.py   (offline cutting tools; KB_TIFF, KB_CACHE and KB_ENDS name their inputs: see cut.py)
cd "$(dirname "$0")" && exec uv run --with pillow --with numpy --with scipy --with scikit-image python "$@"

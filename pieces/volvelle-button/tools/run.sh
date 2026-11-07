#!/bin/sh
# run one offline stage with its dependencies:  ./tools/run.sh face.py [--n 384]
cd "$(dirname "$0")" && exec uv run --quiet --with pillow --with numpy python "$@"

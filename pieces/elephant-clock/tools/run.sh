#!/bin/sh
# run one pipeline stage with its dependencies:  ./run.sh cutparts.py serpent
cd "$(dirname "$0")" && exec uv run --quiet --with pillow --with numpy --with scipy --with scikit-image \
  --with opencv-contrib-python-headless python "$@"

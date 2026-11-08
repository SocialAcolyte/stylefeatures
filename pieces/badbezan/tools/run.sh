#!/bin/sh
# run one pipeline stage with its dependencies:  ./run.sh geometry.py
cd "$(dirname "$0")" && exec uv run --quiet --with pillow --with numpy --with scipy \
  --with opencv-contrib-python-headless python "$@"

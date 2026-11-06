#!/bin/sh
# run one stage with its dependencies:  ./run.sh parts.py
cd "$(dirname "$0")" && exec uv run --quiet --with pillow --with numpy --with scipy \
  --with opencv-contrib-python-headless python "$@"

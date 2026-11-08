#!/bin/sh
# the light data for the demo's Peacock Room photographs (gold_bake.py), at the sizes the page uses
set -e
cd "$(dirname "$0")"
R=../assets/room
S=../../../tools/engine/jobs/fan-peacock-room/src
b() { uv run --quiet --with pillow --with numpy --with scipy --with scikit-image python gold_bake.py "$@"; }
b "$S/Whistler_-_Harmony_in_Blue_and_Gold_The_Peacock_Room_FS-F1904.61_028.jpg" $R/mural-gold.png 1920
b $R/mural-1400.webp $R/mural-1400-gold.png 960
b $R/fireplace.webp $R/fireplace-gold.png 900
b $R/shutters.webp $R/shutters-gold.png 600

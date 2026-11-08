#!/bin/sh
# the whole cut, in order: source in tools/engine/jobs/fan-peacock2-src/kv-5330.png (the 10661 px original at half size);
# mask.py needs WORK/birefnet-half.png from tools/engine/stages/matte_worker.py (see README)
set -e
cd "$(dirname "$0")"
for s in rivet mask edges cut export box preview; do echo "== $s"; ./run.sh $s.py; done

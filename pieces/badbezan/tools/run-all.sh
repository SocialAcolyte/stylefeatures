#!/bin/sh
# the whole cut, in order (about 10 minutes): source in tools/engine/jobs/fan-src/443577-0.jpg
set -e
cd "$(dirname "$0")"
for s in rivet geometry rimscore edges cut export box preview; do echo "== $s"; ./run.sh $s.py; done

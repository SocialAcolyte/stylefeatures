"""Stage 0: the matte. The engine's BiRefNet worker says what is object; matte_fine.py then solves every edge again at
full resolution against the museum's white sweep, and unmixes the edge colour from it."""
import subprocess
from common import *

raw = FINE.with_name('raw.png')
raw.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['uv', 'run', str(ENGINE / 'stages' / 'matte_worker.py'), str(SRC), str(raw), 'birefnet-general'], check=True)
subprocess.run(['uv', 'run', str(HERE / 'matte_fine.py'), str(SRC), str(raw), str(FINE)], check=True)

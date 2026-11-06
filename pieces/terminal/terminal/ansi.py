#!/usr/bin/env python3
"""Capture a CLI's real output, colours and timing, as terminal-film lines.

  python3 terminal/ansi.py --run "yourtool new my-site" --cwd /tmp/demo --hook out-2 > out-2.html
  python3 terminal/ansi.py --file captured.txt --hook out-2          # output you saved with colours, e.g. `script -q`
  some-command --color=always | python3 terminal/ansi.py --hook out-2

--run starts the command in a pseudo-terminal (so it prints colours, spinners and progress bars as it would for a
person), with FORCE_COLOR / CLICOLOR_FORCE set, and notes when each line arrives. It prints one block of HTML:

  <div class="tb" data-tour="out-2">
    <p class="tl" data-tour-wait="0.84"><span class="t-green">✓</span> Created <b>my-site</b></p>
    …
  </div>

which drops into the terminal in index.html, after the prompt line whose command made it. script.js reveals it with
stream('@out-2 > *'): each line comes in on the engine's beat, and data-tour-wait adds the real pause before a slow
line (the gaps are squeezed: --min-wait, --max-wait and --speed, so a 40 s install plays in a few seconds).

ANSI handling: the 16 colours, 256-colour and truecolour map onto the house palette (.t-red, .t-accent for oranges, .t-green, .t-yellow,
.t-blue, .t-magenta, .t-cyan, .t-black, .t-white; backgrounds .t-bg-*); bold .t-b, dim .t-dim, italic .t-i,
underline .t-u. Carriage returns and cursor-up/erase sequences (spinners, progress bars, redraws) are applied the way
a terminal applies them, so you get the final state of each line, not every frame. Re-create a progress bar or a
spinner by hand where the moment matters (see the .bar and .t-spin lines in index.html).

  --cols 72           wrap width the command is told it has (keep it under the terminal's width: ~70 wide, ~48 tall)
  --max-lines 18      keep the first N lines (a long log reads badly in a film; cut it to what matters)
  --redact "re=sub"   replace matches (home paths, tokens, user names); ~ for $HOME is automatic
  --no-wait           no data-tour-wait attributes
"""
import argparse, html, os, re, select, subprocess, sys, time

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
src = ap.add_mutually_exclusive_group()
src.add_argument('--run', help='shell command to run in a pseudo-terminal')
src.add_argument('--file', help='a file holding output with ANSI codes')
ap.add_argument('--cwd', default=None); ap.add_argument('--hook', default='out-1')
ap.add_argument('--cols', type=int, default=72); ap.add_argument('--max-lines', type=int, default=0)
ap.add_argument('--min-wait', type=float, default=.25, help='gaps shorter than this get no data-tour-wait')
ap.add_argument('--max-wait', type=float, default=1.6, help='longest pause kept, seconds')
ap.add_argument('--speed', type=float, default=.5, help='multiply real gaps by this')
ap.add_argument('--timeout', type=float, default=120); ap.add_argument('--redact', action='append', default=[])
ap.add_argument('--no-wait', action='store_true')
a = ap.parse_args()

# ── 1. get bytes, with the time each chunk arrived ──────────────────────────────────────────────────────────────
chunks = []  # (seconds since start, text)
if a.run:
    import pty
    env = dict(os.environ, FORCE_COLOR='1', CLICOLOR_FORCE='1', COLUMNS=str(a.cols), LINES='40', TERM='xterm-256color')
    m, s = pty.openpty()
    try:
        import fcntl, struct, termios
        fcntl.ioctl(s, termios.TIOCSWINSZ, struct.pack('HHHH', 40, a.cols, 0, 0))
    except Exception: pass
    p = subprocess.Popen(a.run, shell=True, cwd=a.cwd, stdin=s, stdout=s, stderr=s, env=env, close_fds=True)
    os.close(s); t0 = time.time()
    while True:
        r, _, _ = select.select([m], [], [], .05)
        if r:
            try: b = os.read(m, 65536)
            except OSError: b = b''
            if not b: break
            chunks.append((time.time() - t0, b.decode('utf-8', 'replace')))
        elif p.poll() is not None: break
        if time.time() - t0 > a.timeout: p.kill(); print(f'[ansi.py] stopped after {a.timeout}s', file=sys.stderr); break
    p.wait()
else:
    data = open(a.file, encoding='utf-8', errors='replace').read() if a.file else sys.stdin.read()
    chunks = [(0, data)]

# ── 2. a small terminal: lines of styled cells, a cursor, SGR state ─────────────────────────────────────────────
BASE = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
HUES = [('red', 0), ('accent', 27), ('yellow', 52), ('green', 120), ('cyan', 180), ('blue', 220), ('magenta', 290), ('red', 360)]
def rgb_name(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    if mx - mn < 30: return 'black' if mx < 110 else 'white'
    d = mx - mn
    h = (60 * ((g - b) / d) % 360) if mx == r else (60 * ((b - r) / d) + 120) if mx == g else (60 * ((r - g) / d) + 240)
    return min(HUES, key=lambda x: abs(x[1] - h))[0]
def x256(n):
    if n < 16: return BASE[n % 8]
    if n >= 232: return 'black' if n < 244 else 'white'
    n -= 16; return rgb_name(n // 36 * 51, n // 6 % 6 * 51, n % 6 * 51)

lines, born = [[]], [0.0]   # lines of (char, style); when each line got its first visible char
row = col = 0; st = {}
def put(ch, t):
    global col
    L = lines[row]
    while len(L) < col: L.append((' ', ()))
    cell = (ch, tuple(sorted(st.items())))
    if col < len(L): L[col] = cell
    else: L.append(cell)
    col += 1
    if ch.strip() and born[row] is None: born[row] = t
def newline(t):
    global row, col
    row += 1; col = 0
    while len(lines) <= row: lines.append([]); born.append(None)
def sgr(params):
    ps = [int(x) if x.isdigit() else 0 for x in (params.split(';') if params else ['0'])]
    i = 0
    while i < len(ps):
        n = ps[i]
        if n == 0: st.clear()
        elif n == 1: st['b'] = 1
        elif n == 2: st['dim'] = 1
        elif n == 3: st['i'] = 1
        elif n == 4: st['u'] = 1
        elif n in (22,): st.pop('b', None); st.pop('dim', None)
        elif n == 23: st.pop('i', None)
        elif n == 24: st.pop('u', None)
        elif 30 <= n <= 37: st['fg'] = BASE[n - 30]
        elif 90 <= n <= 97: st['fg'] = BASE[n - 90]
        elif n == 39: st.pop('fg', None)
        elif 40 <= n <= 47: st['bg'] = BASE[n - 40]
        elif 100 <= n <= 107: st['bg'] = BASE[n - 100]
        elif n == 49: st.pop('bg', None)
        elif n in (38, 48) and i + 1 < len(ps):
            k = 'fg' if n == 38 else 'bg'
            if ps[i + 1] == 5 and i + 2 < len(ps): st[k] = x256(ps[i + 2]); i += 2
            elif ps[i + 1] == 2 and i + 4 < len(ps): st[k] = rgb_name(*ps[i + 2:i + 5]); i += 4
        i += 1

ESC = re.compile(r'\x1b\[([?0-9;]*)([A-Za-z])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]|\x1b[=>78]')
born[0] = None
for t, text in chunks:
    pos = 0
    for mt in list(ESC.finditer(text)) + [None]:
        seg = text[pos:mt.start()] if mt else text[pos:]
        for ch in seg:
            if ch == '\n': newline(t)
            elif ch == '\r': col = 0
            elif ch == '\b': col = max(0, col - 1)
            elif ch == '\t': col = (col // 8 + 1) * 8
            elif ch >= ' ': put(ch, t)
        if not mt: break
        pos = mt.end()
        if mt.group(2) is None: continue
        p, c = mt.group(1), mt.group(2); n = int(p) if p.isdigit() else 1
        if c == 'm': sgr(p)
        elif c == 'A': row = max(0, row - n)
        elif c == 'B':
            for _ in range(n): newline(t)
        elif c == 'C': col += n
        elif c == 'D': col = max(0, col - n)
        elif c == 'G': col = max(0, n - 1)
        elif c == 'K':
            if p in ('', '0'): del lines[row][col:]
            elif p == '2': lines[row] = []
            elif p == '1': lines[row][:col] = [(' ', ())] * min(col, len(lines[row]))
        elif c == 'J' and p in ('', '0'): del lines[row][col:]; del lines[row + 1:]; del born[row + 1:]
        elif c == 'J' and p == '2': lines[:] = [[]]; born[:] = [None]; row = col = 0

# ── 3. lines → HTML ────────────────────────────────────────────────────────────────────────────────────────────
home = os.path.expanduser('~')
subs = [(re.escape(home), '~')] + [tuple(r.split('=', 1)) for r in a.redact if '=' in r]
def cls(style):
    d = dict(style); c = []
    if 'fg' in d: c.append('t-' + d['fg'])
    if 'bg' in d: c.append('t-bg-' + d['bg'])
    for k in ('b', 'dim', 'i', 'u'):
        if k in d: c.append('t-' + k)
    return ' '.join(c)
def render(cells):
    out, cur, buf = [], None, ''
    def flush():
        if buf: out.append(f'<span class="{cur}">{html.escape(buf, False)}</span>' if cur else html.escape(buf, False))
    for ch, style in cells + [('', ('END',))]:
        c = cls(style) if style != ('END',) else None
        if c != cur: flush(); cur, buf = c, ''
        buf += ch
    s = ''.join(out).rstrip()
    for pat, rep in subs: s = re.sub(pat, rep, s)
    return s

while len(lines) > 1 and not lines[-1]: lines.pop(); born.pop()
if a.max_lines: lines, born = lines[:a.max_lines], born[:a.max_lines]
out, last = [f'<div class="tb" data-tour="{html.escape(a.hook)}">'], 0.0
for cells, b in zip(lines, born):
    b = last if b is None else b
    gap = (b - last) * a.speed; last = max(last, b)
    w = '' if a.no_wait or gap < a.min_wait else f' data-tour-wait="{min(gap, a.max_wait):.2f}"'
    out.append(f'  <p class="tl"{w}>{render(cells)}</p>')
out.append('</div>')
print('\n'.join(out))

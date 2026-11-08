#!/usr/bin/env python3
"""Rebuild the README's gallery from the site's own catalogue.

Reads the DATA object in index.html, makes a small thumbnail per piece in
.github/readme/pieces/ (from thumbs/, with cwebp), and rewrites the block
between the <!-- gallery --> markers in README.md.

    python3 .github/readme/build.py
"""
import json, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.join(ROOT, '.github', 'readme')
THUMBS = os.path.join(HERE, 'pieces')
SITE = 'https://socialacolyte.github.io/stylefeatures/'
COLS = 3
LIMIT = 105  # characters in a gallery caption

def catalogue():
    s = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    m = re.search(r'const DATA\s*=\s*', s)
    data, _ = json.JSONDecoder().raw_decode(s, m.end())
    return data

def thumb(p):
    src = os.path.join(ROOT, p['thumb'])
    dst = os.path.join(THUMBS, p['slug'] + '.webp')
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        subprocess.run(['cwebp', '-quiet', '-q', '74', '-resize', '480', '300', src, '-o', dst], check=True)
    return os.path.relpath(dst, ROOT)

def cut(text, at):
    # last `at` outside brackets, before LIMIT
    depth, best = 0, -1
    for i, ch in enumerate(text[:LIMIT]):
        depth += ch in '(['
        depth -= ch in ')]'
        if depth == 0 and text.startswith(at, i) and i > 24:
            best = i
            if at == ':': break
    return text[:best].rstrip() + '.' if best > 0 else None

def caption(blurb):
    """One line for the gallery: the blurb's first sentence, shortened where it must be."""
    b = re.sub(r'\s+', ' ', blurb or '').strip()
    if not b:
        return ''
    sents = re.findall(r'.+?[.!?](?=\s|$)|.+$', b)
    s = sents[0].strip()
    if len(s) < 40 and len(sents) > 1:  # "A porcelain dish lying on the paper." says too little alone
        nxt = re.sub(r'\s*\([^)]*\)', '', sents[1].strip())
        if '(' in nxt:  # a bracket the sentence split left open
            nxt = nxt[:nxt.index('(')].rstrip(' ,;:') + '.'
        if len(s) + 1 + len(nxt) > LIMIT:  # keep only the next sentence's first clause
            m = re.search(r'[:;,] ', nxt[20:])
            if m:
                nxt = nxt[:20 + m.start()].rstrip() + '.'
        s = s + ' ' + nxt
    if len(s) <= LIMIT:
        return s
    s = re.sub(r'\s*\([^)]*\)', '', s)
    if len(s) <= LIMIT:
        return s
    for at in (':', ';', ', '):
        c = cut(s, at)
        if c:
            return c
    return s[:LIMIT].rsplit(' ', 1)[0].rstrip(',;:') + '…'

def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def table(pieces, names):
    rows = []
    for i in range(0, len(pieces), COLS):
        cells = []
        for p in pieces[i:i + COLS]:
            href = SITE + '#/' + p['slug']
            cap = caption(p['blurb'])
            name = names[p['slug']]
            cells.append(
                f'<td width="33%" valign="top">'
                f'<a href="{href}"><img src="{thumb(p)}" alt="{esc(name)}"></a><br>'
                f'<a href="{href}"><b>{esc(name)}</b></a>'
                + (f'<br><sub>{esc(cap)}</sub>' if cap else '') +
                '</td>')
        cells += ['<td width="33%"></td>'] * (COLS - len(cells))
        rows.append('<tr>\n' + '\n'.join(cells) + '\n</tr>')
    return '<table>\n' + '\n'.join(rows) + '\n</table>'

def main():
    data = catalogue()
    os.makedirs(THUMBS, exist_ok=True)
    pieces = data['pieces']
    # two pieces may share a display name (Chapters, Chapters film); fall back to the slug
    seen = {}
    for p in pieces:
        seen[p['name']] = seen.get(p['name'], 0) + 1
    names = {p['slug']: p['name'] if seen[p['name']] == 1 else p['slug'].replace('-', ' ').capitalize() if p['name'][0].isupper() else p['slug'] for p in pieces}
    by = {}
    for p in pieces:
        by.setdefault(p['cat'], []).append(p)

    out = []
    for c in data['cats']:
        ps = by.get(c['id'], [])
        if not ps:
            continue
        head = f'### {c["label"]} <sub>{len(ps)}</sub>\n\n{esc(c["desc"])}\n\n{table(ps, names)}'
        if c['id'] == 'other':
            out.append(f'<details>\n<summary><b>{c["label"]}</b> · {len(ps)} more, from outside the catalogue</summary>\n\n{table(ps, names)}\n\n</details>')
        else:
            out.append(head)
    gallery = '\n\n'.join(out)

    templates = [p for p in pieces if p.get('kind') == 'template']
    n_personal = sum(1 for p in pieces if p.get('family') == 'personal')
    n_pieces = len(pieces) - len(templates)
    n_demo = len(templates) - n_personal

    path = os.path.join(ROOT, 'README.md')
    md = open(path, encoding='utf-8').read()
    for name, body in (('gallery', gallery),):
        pat = re.compile(rf'(<!-- {name} -->).*?(<!-- /{name} -->)', re.S)
        if not pat.search(md):
            sys.exit(f'README.md has no <!-- {name} --> block')
        md = pat.sub(lambda m: m.group(1) + '\n' + body + '\n' + m.group(2), md)
    open(path, 'w', encoding='utf-8').write(md)

    keep = {p['slug'] + '.webp' for p in pieces}
    for f in os.listdir(THUMBS):
        if f not in keep:
            os.remove(os.path.join(THUMBS, f))
    print(f'README.md: {n_pieces} pieces, {n_demo} demo sites, {n_personal} personal sites, {len(pieces)} thumbnails')

if __name__ == '__main__':
    main()

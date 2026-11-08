"""Write the handlist's first page into demo.html (between <!-- page-1 --> markers), so that without JavaScript the
demo is still a page: page 1 of the list, and the board's links to the others.

  python3 components/senet/tools/demo_page1.py
"""
import html, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'assets' / 'catalogue.json').read_text())
items = data['items'][:12]
e = html.escape
rows = []
for o in items:
    when = e(o['date']) + (' · ' + e(o['dynasty']) if o['dynasty'] else '')
    rows.append(
        f'      <li class="obj"><a href="{e(o["url"])}" rel="noopener" target="_blank">\n'
        f'        <figure><img src="assets/{e(o["img"])}" width="{o["w"]}" height="{o["h"]}" alt="" loading="lazy" decoding="async"></figure>\n'
        f'        <h3>{e(o["title"])}</h3></a>\n'
        f'        <p><span>{when}</span><span>{e(o["medium"])}</span></p></li>')
demo = ROOT / 'demo.html'
s = demo.read_text()
s = re.sub(r'<!-- page-1 -->.*?<!-- /page-1 -->', '<!-- page-1 -->\n' + '\n'.join(rows) + '\n<!-- /page-1 -->', s, flags=re.S)
pages = -(-data['count'] // 12)
s = re.sub(r'data-pages="\d+" data-page="1" data-href="\?page=\{n\}"', f'data-pages="{pages}" data-page="1" data-href="?page={{n}}"', s)
s = re.sub(r'Page 1 of \d+ · objects 1–12 of \d+', f'Page 1 of {pages} · objects 1–12 of {data["count"]}', s)
s = re.sub(r'<li><a href="\?page=\d+">\d+</a></li>\n(\s+<li class="sn-step sn-next">)',
           f'<li><a href="?page={pages}">{pages}</a></li>\n\\1', s)
demo.write_text(s)
print('page 1 written;', data['count'], 'objects,', pages, 'pages')

# /// script
# dependencies = ["pillow"]
# ///
"""The demo's handlist: the Cleveland Museum of Art's open-access (CC0) Egyptian objects of the New Kingdom, Third
Intermediate Period and Late Period, dated within 1550-332 BCE, oldest first. Reads the API pages saved by
  curl 'https://openaccess-api.clevelandart.org/api/artworks/?department=Egyptian%20and%20Ancient%20Near%20Eastern%20Art&cc0=1&has_image=1&limit=1000&skip=0'  (and skip=1000)
into J, fetches each object's web image once and keeps a 300 px thumbnail (assets/catalogue/), and writes
assets/catalogue.json."""
import json, io, os, time, urllib.request, re
from PIL import Image
J='/Users/connorhood/StyleFeatures/tools/engine/jobs/senet-cma/'
OUT='/Users/connorhood/StyleFeatures/components/senet/assets/catalogue/'
UA={'User-Agent':'StyleFeaturesHunt/1.0 (research)'}
a=json.load(open(J+'egypt0.json'))['data']+json.load(open(J+'egypt1.json'))['data']
sel=[]
for x in a:
    c=(x.get('culture') or [''])[0]
    if 'Egypt' not in c or 'forgery' in c.lower(): continue
    if not any(k in c for k in ['New Kingdom','Third Intermediate','Late period']): continue
    if not (x.get('images') or {}).get('web'): continue
    if (x.get('creation_date_earliest') or -9999) < -1550 or (x.get('creation_date_latest') or 0) > -332: continue
    sel.append(x)
sel.sort(key=lambda x:(x.get('creation_date_earliest') or 0, x['accession_number']))
items=[]
for x in sel:
    acc=x['accession_number']; fn=re.sub(r'[^0-9A-Za-z.-]','_',acc)+'.webp'
    fp=OUT+fn
    if not os.path.exists(fp):
        for k in range(4):
            try:
                b=urllib.request.urlopen(urllib.request.Request(x['images']['web']['url'],headers=UA),timeout=60).read(); break
            except Exception as e:
                print('retry',acc,e,flush=True); time.sleep(10*(k+1))
        else: continue
        im=Image.open(io.BytesIO(b)).convert('RGB'); im.thumbnail((300,300),Image.LANCZOS)
        im.save(fp,quality=78,method=6); time.sleep(0.4)
    im=Image.open(fp)
    c=x['culture'][0]
    period=next((p for p in ['New Kingdom','Third Intermediate','Late period'] if p in c),'')
    dyn=re.search(r'Dynast(?:y|ies) [0-9–\-]+',c)
    items.append({'title':x['title'],'date':x['creation_date'],'medium':x.get('technique') or '','acc':acc,
                  'period':period,'dynasty':dyn.group(0) if dyn else '','type':x.get('type') or '',
                  'url':x['url'],'img':'catalogue/'+fn,'w':im.width,'h':im.height})
    if len(items)%50==0: print(len(items),flush=True)
json.dump({'source':'Cleveland Museum of Art Open Access (CC0), department of Egyptian and Ancient Near Eastern Art: Egypt, New Kingdom to Late Period (dated 1550-332 BCE), with images, oldest first','count':len(items),'items':items},open(OUT+'../catalogue.json','w'),ensure_ascii=False,indent=0)
print('done',len(items))

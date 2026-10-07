import sys, re
from rapidocr_onnxruntime import RapidOCR
from PIL import Image, ImageDraw
import numpy as np
bl, paths = sys.argv[1], sys.argv[2:]
terms=[]
for l in open(bl,encoding='utf8'):
    t=l.strip()
    if t and not t.startswith('#'): terms.append(re.sub(r'[^a-z0-9]','',t.lower()))
terms=[t for t in terms if t]
ocr=RapidOCR()
for p in paths:
    im=Image.open(p).convert('RGB'); d=ImageDraw.Draw(im); n=0
    res,_=ocr(np.array(im))
    for box,txt,_c in (res or []):
        flat=re.sub(r'[^a-z0-9]','',txt.lower())
        if any(t in flat for t in terms):
            xs=[q[0] for q in box]; ys=[q[1] for q in box]
            x0,x1,y0,y1=int(min(xs))-3,int(max(xs))+3,int(min(ys))-2,int(max(ys))+2
            bg=im.getpixel((max(x0-4,0),(y0+y1)//2))
            d.rectangle([x0,y0,x1,y1],fill=bg); n+=1
    im.save(p,'WEBP',quality=92); print(p,'boxes',n)

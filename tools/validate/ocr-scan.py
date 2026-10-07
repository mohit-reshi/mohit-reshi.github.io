#!/usr/bin/env python3
"""OCR every image under the given folders and report files whose text contains a blocklist term.
Never prints a term, only the file, the tier and a count. Usage: ocr_scan.py <blocklist> <dir> [<dir>...]"""
import sys, re, os
from rapidocr_onnxruntime import RapidOCR
from PIL import Image
import numpy as np

bl, dirs = sys.argv[1], sys.argv[2:]
terms = []; tier = 'hard'
for line in open(bl, encoding='utf8'):
    t = line.strip()
    if not t: continue
    m = re.match(r'#\s*tier:\s*(\w+)', t)
    if m: tier = m.group(1); continue
    if t.startswith('#'): continue
    terms.append((tier, re.sub(r'[^a-z0-9]', '', t.lower())))
ocr = RapidOCR()
hits = 0; scanned = 0
for d in dirs:
    for root, _, files in os.walk(d):
        for f in sorted(files):
            if not f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')): continue
            p = os.path.join(root, f)
            try:
                im = Image.open(p).convert('RGB')
            except Exception: continue
            # scan the full image and a 2x upscale of any small one
            variants = [im] + ([im.resize((im.width * 2, im.height * 2))] if im.width < 1300 else [])
            text = ''
            for v in variants:
                res, _ = ocr(np.array(v))
                text += ' ' + ' '.join(r[1] for r in (res or []))
            flat = re.sub(r'[^a-z0-9]', '', text.lower())
            found = [(t, k) for t, k in terms if k and k in flat]
            scanned += 1
            if found:
                hits += 1
                print(f"HIT {p}: " + ', '.join(f"{t}x{flat.count(k)}" for t, k in found))
print(f"scanned {scanned} images, {hits} with hits")

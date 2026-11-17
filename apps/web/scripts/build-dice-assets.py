#!/usr/bin/env python3
"""Give Kenney's CC0 dice silhouettes a dimensional tabletop treatment.

The PNG silhouettes are source masks from Kenney Board Game Icons, CC0 1.0.
All output is local (no network access needed at build time).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np

ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'public'/'art'/'dice'
OUT.mkdir(parents=True,exist_ok=True)
S=256
for number in range(1,7):
    src=Image.open(ROOT/'kenney-dice'/f'dice_{number}.png').convert('RGBA')
    mask=src.getchannel('A').resize((194,194),Image.Resampling.LANCZOS)
    x=y=28
    base=Image.new('RGBA',(S,S))
    outline=Image.new('L',(S,S))
    dr=ImageDraw.Draw(outline)
    dr.rounded_rectangle((25,24,224,224),radius=29,fill=255)
    shadow=Image.new('RGBA',(S,S))
    shadow.putalpha(outline.filter(ImageFilter.GaussianBlur(7)))
    dark=Image.new('RGBA',(S,S),(23,30,29,42))
    base.alpha_composite(Image.composite(dark,Image.new('RGBA',(S,S)),shadow.getchannel('A')).transform((S,S),Image.Transform.AFFINE,(1,0,-2,0,1,-4)))
    # Border and exposed clay at the edge; the source mask defines the pips.
    dr=ImageDraw.Draw(base)
    dr.rounded_rectangle((25,24,224,224),radius=29,fill='#a9a08c',outline='#7d705b',width=2)
    dr.rounded_rectangle((28,26,221,218),radius=27,fill='#423c32')
    cream=Image.new('RGBA',(194,194))
    pix=cream.load()
    for j in range(194):
        for i in range(194):
            shine= 13*(1-i/194)+10*(1-j/194)
            glow= max(0,1-((i-49)**2+(j-35)**2)/19000)*7
            v=shine+glow
            pix[i,j]=(int(min(255,230+v)),int(min(255,221+v)),int(min(255,198+v)),255)
    cream.putalpha(mask)
    base.alpha_composite(cream,(x,y))
    dr=ImageDraw.Draw(base)
    dr.arc((31,29,218,218), 201,319,fill=(255,255,248,150),width=3)
    dr.arc((31,29,218,218), 22,137,fill=(89,74,56,40),width=3)
    base.save(OUT/f'die-{number}.png',optimize=True)
print('Generated',len(list(OUT.glob('die-*.png'))),'dimensional dice faces')

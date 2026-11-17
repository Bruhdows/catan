#!/usr/bin/env python3
"""Compose a coherent raster tabletop tile set from original project illustrations.
Requires the temporary SVG output from render-board-asset-svg.tsx and librsvg.
Generated WebP files live in public/art/ so the runtime does not require SVG scenes.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import subprocess
import hashlib
import math
import random

BASE=Path('/tmp/catan-illustrations')
ROOT=Path(__file__).resolve().parents[1]/'public'/'art'
W,H=500,576
CX,CY=W//2,H//2
R=288
COLORS={
 'forest':(77,134,91), 'pasture':(157,190,105), 'fields':(213,164,70),
 'hills':(188,111,76), 'mountains':(119,140,156), 'desert':(211,183,126),
}

def svg_png(filename,width=512,height=512):
  out=Path('/tmp/catan-illustrations')/(filename+'.png')
  subprocess.run(['rsvg-convert','-w',str(width),'-h',str(height),'-o',str(out),str(BASE/(filename+'.svg'))],check=True)
  return Image.open(out).convert('RGBA')

def poly(radius):
  return [(CX+radius*math.cos(math.radians(30+i*60)),CY+radius*math.sin(math.radians(30+i*60))) for i in range(6)]

def texture(name,index):
  seed=int(hashlib.md5(f'{name}-{index}'.encode()).hexdigest()[:8],16)
  rng=np.random.default_rng(seed)
  base=np.array(COLORS[name],dtype=float)
  soft=Image.fromarray(rng.integers(0,256,size=(38,35),dtype=np.uint8)).resize((W,H),Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(14))
  softnoise=(np.asarray(soft,dtype=float)-127)/128
  grain=rng.normal(0,1.0,size=(H,W))
  yy,xx=np.mgrid[:H,:W]
  top=(0.51-(yy/H))*14
  light=(0.56-(xx/W))*7
  rx=(xx-CX)/(0.866*R);ry=(yy-CY)/R
  vignette=np.clip((rx**2+ry**2-.35)*7,0,10)
  noise=grain*2.4+softnoise*13 +top+light-vignette
  if name=='forest':base+=np.array((0,6,2))
  if name=='desert':base+=np.array((0,4,9))
  arr=np.clip(base+noise[:,:,None]*np.array((1.0,.85,.62))[None,None,:],0,255).astype(np.uint8)
  return Image.fromarray(arr,'RGB').convert('RGBA')

for name in COLORS:
  for index in range(3):
    mask=Image.new('L',(W,H));d=ImageDraw.Draw(mask)
    d.polygon(poly(R-4),fill=255)
    canvas=Image.new('RGBA',(W,H),(0,0,0,0))
    shadow=Image.new('RGBA',(W,H));shadowdraw=ImageDraw.Draw(shadow)
    shadowdraw.polygon(poly(R-4),fill=(50,45,31,255))
    canvas.alpha_composite(shadow)
    # Warm carved edge inside hex. No oversized gold shelf around the island.
    frame=Image.new('RGBA',(W,H));dr=ImageDraw.Draw(frame)
    dr.polygon(poly(R-8),fill=(227,215,180,255))
    dr.line(poly(R-11)+poly(R-11)[:1],fill=(251,244,215,220),width=4,joint='curve')
    innerMask=Image.new('L',(W,H));ImageDraw.Draw(innerMask).polygon(poly(R-21),fill=255)
    sceneBase=texture(name,index)
    frame.paste(sceneBase,(0,0),innerMask)
    # Light inset stroke and shadow emphasizes tile geometry without fake 3D blocks.
    dr=ImageDraw.Draw(frame)
    dr.line(poly(R-22)+poly(R-22)[:1],fill=(70,52,35,75),width=3,joint='curve')
    dr.line(poly(R-30)+poly(R-30)[:1],fill=(255,255,255,55),width=2,joint='curve')
    canvas.alpha_composite(frame)
    scene=svg_png(f'{name}-{index}',495,495)
    scene=scene.resize((485,485),Image.Resampling.LANCZOS)
    detail=Image.new('RGBA',(W,H));detail.alpha_composite(scene,((W-485)//2,(H-485)//2))
    # Do not let decorative details spill over the frame into neighboring tiles.
    inner=np.asarray(innerMask)
    alpha=detail.getchannel('A')
    import PIL.ImageChops
    alpha=PIL.ImageChops.multiply(alpha,innerMask)
    detail.putalpha(alpha)
    canvas.alpha_composite(detail)
    canvas.putalpha(mask)
    path=ROOT/'terrain'/f'{name}-{index}.webp'
    canvas.save(path,'WEBP',quality=94,method=6)
    print(path.name,path.stat().st_size)

for name in ['brick','lumber','wool','grain','ore']:
  icon=svg_png(name,360,360)
  crop=icon.getbbox()
  if crop:icon=icon.crop(crop)
  card=Image.new('RGBA',(300,300))
  scale=230/max(icon.size);icon=icon.resize((round(icon.width*scale),round(icon.height*scale)),Image.Resampling.LANCZOS)
  card.alpha_composite(icon,((300-icon.width)//2,(300-icon.height)//2))
  card.save(ROOT/'resources'/f'{name}.webp','WEBP',quality=96,method=6)

# Settlements and cities retain the hand-drawn colorful board style, but are now
# reusable high-resolution images rather than path-filled runtime SVG nodes.
for player in ['crimson','azure','amber','ivory','emerald','violet','teal','rose','neutral']:
  for kind in ['settlement','city']:
    image=svg_png(f'{kind}-{player}',300,300)
    box=image.getbbox()
    if box:image=image.crop(box)
    out=Image.new('RGBA',(300,300));size=225/max(image.size)
    image=image.resize((round(image.width*size),round(image.height*size)),Image.Resampling.LANCZOS)
    out.alpha_composite(image,((300-image.width)//2,(300-image.height)//2))
    out.save(ROOT/'pieces'/f'{kind}-{player}.webp','WEBP',quality=95,method=6)
  rgb={ 'crimson':(210,75,64),'azure':(47,127,201),'amber':(221,146,43),'ivory':(239,230,208),'emerald':(57,148,110),'violet':(145,98,200),'teal':(19,167,178),'rose':(219,98,148),'neutral':(179,133,91)}[player]
  road=Image.new('RGBA',(320,38));rd=ImageDraw.Draw(road)
  rd.rounded_rectangle((4,5,316,32),radius=11,fill=(58,42,29,255))
  rd.rounded_rectangle((8,8,312,28),radius=8,fill=tuple(max(0,int(ch*.77)) for ch in rgb)+(255,))
  rd.rounded_rectangle((12,9,308,22),radius=6,fill=rgb+(255,))
  rd.line(((24,11),(297,11)),fill=(255,255,255,85),width=2)
  road.save(ROOT/'pieces'/f'road-{player}.webp','WEBP',quality=95,method=6)

# Remove now-unused assets from the mismatched CC0 sample set.
for leftover in [* (ROOT/'resources').glob('*'),* (ROOT/'ui').glob('*.png')]:
  if leftover.parent.name=='resources' and leftover.stem in {'brick','lumber','wool','grain','ore'}: continue
  if leftover.parent.name=='ui': continue
  if leftover.is_file():leftover.unlink()
print('wrote',len(list((ROOT/'terrain').glob('*.webp'))),'tile images')

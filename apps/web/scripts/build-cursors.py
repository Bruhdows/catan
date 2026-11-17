#!/usr/bin/env python3
"""Render browser cursor PNGs from a small, vendored CC0 Kenney sprite subset.

Source: https://kenney.nl/assets/cursor-pack (1.1, CC0).
No network or runtime JavaScript required. The cropped/retinted output is 40px
with browser-friendly, declared CSS hotspots.
"""
from pathlib import Path
from PIL import Image
import numpy as np

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'kenney-cursors'
DEST = HERE.parent / 'public' / 'art' / 'cursors'
DEST.mkdir(parents=True, exist_ok=True)

# Keep all exports within the safe CSS cursor dimension supported by browsers.
SPRITES = {
    'default': ('pointer_c_shaded', 33, (2, 2)),
    'select': ('hand_point', 34, (15, 3)),
    'grab': ('hand_small_open', 34, (19, 18)),
    'grabbing': ('hand_small_closed', 34, (19, 19)),
    'place': ('target_a', 34, (20, 20)),
    'build': ('tool_hammer', 33, (7, 6)),
    'disabled': ('cursor_disabled', 34, (3, 3)),
}

for output, (stem, maximum, _hotspot) in SPRITES.items():
    original = Image.open(SOURCE / (stem + '.png')).convert('RGBA')
    box = original.getchannel('A').getbbox()
    if box is None:
        raise ValueError('Empty cursor sprite: ' + stem)
    original = original.crop(box)
    factor = min(maximum / original.width, maximum / original.height)
    art = original.resize((round(original.width * factor), round(original.height * factor)), Image.Resampling.LANCZOS)
    arr = np.asarray(art, dtype=np.float32).copy()
    luminance = (arr[:, :, 0] * .299 + arr[:, :, 1] * .587 + arr[:, :, 2] * .114) / 255.
    dark = np.array([66., 54., 41.], dtype=np.float32)
    light = np.array([250., 244., 227.], dtype=np.float32)
    arr[:, :, :3] = dark[None, None, :] * (1 - luminance[:, :, None]) + light[None, None, :] * luminance[:, :, None]
    tinted = Image.fromarray(np.clip(arr, 0, 255).astype('uint8'), 'RGBA')
    out = Image.new('RGBA', (40, 40))
    # Position the arrow and index-finger near their declared hotspots;
    # the open/closed hand uses a centered grip point.
    x = 2 if output in ('default','select','build','disabled') else (40 - tinted.width) // 2
    y = 2 if output in ('default','select','build','disabled') else (40 - tinted.height) // 2
    out.alpha_composite(tinted, (x, y))
    out.save(DEST / (output + '.png'), optimize=True)
    print(output, 'content', tinted.size, 'hotspot', _hotspot)

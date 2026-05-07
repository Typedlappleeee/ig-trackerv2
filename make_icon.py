"""
Génère icon.ico pour IG Tracker (utilisé par BUILD_EXE.bat).
Nécessite Pillow. Lance-le une fois avant de compiler.
"""
from PIL import Image, ImageDraw, ImageFont
import os

def make_icon(output="icon.ico"):
    sizes = [256, 128, 64, 48, 32, 16]
    imgs = []
    for sz in sizes:
        img = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        r = int(sz * 0.12)
        # Background rounded rect
        d.rounded_rectangle([0, 0, sz-1, sz-1], radius=r,
                             fill=(14, 18, 32, 255))
        # Accent bar top
        bar_h = max(3, sz // 18)
        d.rounded_rectangle([0, 0, sz-1, bar_h], radius=r,
                             fill=(200, 240, 60, 255))
        # "IG" text
        fs = max(8, int(sz * 0.38))
        try:
            font = ImageFont.truetype("arialbd.ttf", fs)
        except:
            try:
                font = ImageFont.truetype("arial.ttf", fs)
            except:
                font = ImageFont.load_default()
        txt = "IG"
        bb = d.textbbox((0, 0), txt, font=font)
        tw, th = bb[2]-bb[0], bb[3]-bb[1]
        tx = (sz - tw) // 2 - bb[0]
        ty = (sz - th) // 2 - bb[1] + bar_h // 2
        d.text((tx, ty), txt, font=font, fill=(200, 240, 60, 255))
        # Small dot
        dot = max(3, sz // 14)
        ox = sz - dot * 2 - 3
        oy = sz - dot * 2 - 3
        d.ellipse([ox, oy, ox+dot*2, oy+dot*2], fill=(200, 240, 60, 255))
        imgs.append(img)
    imgs[0].save(output, format="ICO", sizes=[(s,s) for s in sizes],
                 append_images=imgs[1:])
    print(f"[OK] {output} généré ({len(sizes)} tailles)")

if __name__ == "__main__":
    make_icon()

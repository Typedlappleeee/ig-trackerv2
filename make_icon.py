"""
Génère icon.ico depuis logo.png pour IG Tracker.
Lance-le une fois avant de compiler avec BUILD_EXE.bat.
"""
from PIL import Image
from pathlib import Path

def make_icon(src="logo.png", output="icon.ico"):
    src_path = Path(src)
    if not src_path.exists():
        print(f"[ERREUR] {src} introuvable — icône non générée")
        return False

    img = Image.open(str(src_path)).convert("RGBA")
    sizes = [256, 128, 64, 48, 32, 16]
    imgs = [img.resize((s, s), Image.LANCZOS) for s in sizes]
    imgs[0].save(output, format="ICO",
                 sizes=[(s, s) for s in sizes],
                 append_images=imgs[1:])
    print(f"[OK] {output} généré depuis {src} ({len(sizes)} tailles)")
    return True

if __name__ == "__main__":
    make_icon()

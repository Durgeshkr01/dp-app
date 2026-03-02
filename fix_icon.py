from PIL import Image, ImageDraw
import numpy as np

src = r"D:\my personal aap\WhatsApp Image 2026-03-02 at 4.14.17 PM.jpeg"
img = Image.open(src).convert("RGBA")

# --- Remove black/dark background ---
data = np.array(img)
r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
# Pixels that are dark (black background)
black_mask = (r < 40) & (g < 40) & (b < 40)
data[black_mask, 3] = 0
img_no_bg = Image.fromarray(data, 'RGBA')

# --- Auto-crop to visible content ---
bbox = img_no_bg.getbbox()
if bbox:
    img_cropped = img_no_bg.crop(bbox)
else:
    img_cropped = img_no_bg

for icon_size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (64, "favicon.png")]:
    # Create background with app's primary color
    bg = Image.new("RGBA", (icon_size, icon_size), (108, 99, 255, 255))

    # Fit logo into square with padding
    pad = int(icon_size * 0.1)
    max_inner = icon_size - pad * 2
    img_copy = img_cropped.copy()
    img_copy.thumbnail((max_inner, max_inner), Image.LANCZOS)
    iw, ih = img_copy.size
    x = (icon_size - iw) // 2
    y = (icon_size - ih) // 2
    bg.paste(img_copy, (x, y), img_copy)

    # Rounded corners mask
    mask = Image.new("L", (icon_size, icon_size), 0)
    draw = ImageDraw.Draw(mask)
    radius = icon_size // 5
    draw.rounded_rectangle([0, 0, icon_size, icon_size], radius=radius, fill=255)
    bg.putalpha(mask)

    bg.save(f"D:/my personal aap/app/{name}", format="PNG")
    print(f"Saved {name} ({icon_size}x{icon_size})")

print("Done!")

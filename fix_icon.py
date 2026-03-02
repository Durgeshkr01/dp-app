from PIL import Image, ImageDraw

src = r"D:\my personal aap\WhatsApp Image 2026-03-02 at 4.14.17 PM.jpeg"
img = Image.open(src).convert("RGB")

# --- Center-crop to square ---
w, h = img.size
min_dim = min(w, h)
left = (w - min_dim) // 2
top = (h - min_dim) // 2
img_cropped = img.crop((left, top, left + min_dim, top + min_dim))

for icon_size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (64, "favicon.png")]:
    # Resize to target size
    resized = img_cropped.resize((icon_size, icon_size), Image.LANCZOS)

    # Apply rounded corners mask
    mask = Image.new("L", (icon_size, icon_size), 0)
    draw = ImageDraw.Draw(mask)
    radius = icon_size // 5
    draw.rounded_rectangle([0, 0, icon_size, icon_size], radius=radius, fill=255)

    output = resized.convert("RGBA")
    output.putalpha(mask)
    output.save(f"D:/my personal aap/app/{name}", format="PNG")
    print(f"Saved {name} ({icon_size}x{icon_size})")

print("Done!")

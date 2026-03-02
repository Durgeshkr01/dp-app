from PIL import Image, ImageDraw

src = r"D:\my personal aap\WhatsApp Image 2026-03-02 at 4.14.17 PM.jpeg"
img = Image.open(src).convert("RGBA")

for icon_size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (64, "favicon.png")]:
    # Create background with app's primary color
    bg = Image.new("RGBA", (icon_size, icon_size), (108, 99, 255, 255))

    # Fit original image into square with padding (letterbox)
    pad = int(icon_size * 0.08)
    max_inner = icon_size - pad * 2
    img_copy = img.copy()
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

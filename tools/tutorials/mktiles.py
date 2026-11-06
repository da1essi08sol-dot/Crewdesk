# Mock aerial imagery for the tutorial recordings only (the sandbox can't reach real imagery).
import math, os, random
from PIL import Image, ImageDraw, ImageFilter
random.seed(4)
LAT, LNG = 54.7762, -1.5849
def world(lat, lng, z):
    s = math.sin(math.radians(lat)); n = 256 * 2 ** z
    return ((lng + 180) / 360 * n, (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n)
Z = 20; cx, cy = world(LAT, LNG, Z); S = 6144
img = Image.new('RGB', (S, S), (86, 112, 68)); d = ImageDraw.Draw(img)
# grass texture
for _ in range(60000):
    x, y = random.randrange(S), random.randrange(S); c = random.randint(-14, 14); d.point((x, y), fill=(86 + c, 112 + c, 68 + c // 2))
img = img.filter(ImageFilter.GaussianBlur(1.2)); d = ImageDraw.Draw(img)
road = (74, 76, 78); pave = (150, 148, 140)
def rd(x1, y1, x2, y2, w=140):
    d.line((x1, y1, x2, y2), fill=pave, width=w + 60); d.line((x1, y1, x2, y2), fill=road, width=w)
    # centre dashes
    L = math.hypot(x2 - x1, y2 - y1); n = int(L // 90)
    for i in range(n):
        if i % 2: continue
        a, b = i / n, (i + 0.5) / n; d.line((x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b), fill=(225, 225, 215), width=6)
rd(0, 3000, S, 3150); rd(2900, 0, 3050, S); rd(3050, 1500, S, 1300, 110); rd(0, 4700, 3000, 4500, 110)
# houses with gardens along roads
def house(x, y, w, h, roof):
    d.rectangle((x - 18, y - 18, x + w + 18, y + h + 18), fill=(98, 128, 76)); d.rectangle((x, y, x + w, y + h), fill=roof)
    d.line((x, y + h / 2, x + w, y + h / 2), fill=tuple(max(0, c - 30) for c in roof), width=5)
roofs = [(150, 82, 66), (120, 70, 60), (90, 92, 98), (160, 100, 80), (110, 112, 118)]
for i in range(14):
    house(300 + i * 330, 2550, 230, 300, random.choice(roofs)); house(300 + i * 330, 3500, 230, 300, random.choice(roofs))
for i in range(9):
    house(2400, 300 + i * 300, 330, 210, random.choice(roofs)); house(3350, 300 + i * 300, 330, 210, random.choice(roofs))
# car park and a big building
d.rectangle((3500, 3500, 5600, 4700), fill=(96, 98, 100))
for r in range(6):
    for c in range(16): d.rectangle((3560 + c * 125, 3560 + r * 190, 3565 + c * 125, 3700 + r * 190), fill=(220, 220, 210))
for _ in range(45):
    r, c = random.randrange(6), random.randrange(15); col = random.choice([(200, 30, 30), (230, 230, 230), (30, 40, 60), (120, 120, 130), (20, 20, 20)])
    d.rounded_rectangle((3580 + c * 125, 3580 + r * 190, 3670 + c * 125, 3690 + r * 190), 12, fill=col)
d.rectangle((3600, 1700, 5400, 2800), fill=(176, 178, 182)); d.rectangle((3600, 1700, 5400, 1760), fill=(140, 142, 146))
# trees
for _ in range(220):
    x, y = random.randrange(S), random.randrange(S); r = random.randint(40, 90)
    px = img.getpixel((min(S - 1, x), min(S - 1, y)))
    if abs(px[1] - 112) < 30 and px[1] > px[0]: d.ellipse((x - r, y - r, x + r, y + r), fill=(52 + random.randint(-8, 8), 82 + random.randint(-10, 10), 44))
img = img.filter(ImageFilter.GaussianBlur(0.8))
ox, oy = cx - S / 2, cy - S / 2
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.work', 'tiles')
for z in range(15, 21):
    k = 2 ** (Z - z); small = img.resize((max(1, S // k), max(1, S // k)), Image.LANCZOS) if k > 1 else img
    zx, zy = ox / k, oy / k
    for tx in range(int(zx // 256), int((zx + S / k) // 256) + 1):
        for ty in range(int(zy // 256), int((zy + S / k) // 256) + 1):
            tile = Image.new('RGB', (256, 256), (86, 112, 68)); tile.paste(small, (int(round(zx - tx * 256)), int(round(zy - ty * 256))))
            p = os.path.join(out, str(z), str(tx)); os.makedirs(p, exist_ok=True); tile.save(os.path.join(p, f'{ty}.jpg'), quality=80)
Image.new('RGB', (256, 256), (86, 112, 68)).save(os.path.join(out, 'grass.jpg')); Image.new('RGBA', (256, 256), (0, 0, 0, 0)).save(os.path.join(out, 'clear.png'))
print('tiles done')

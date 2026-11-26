# ruler.py <imagen> <x0,y0,x1,y1> <zoom> <salida>  — recorte ampliado con regla de píxeles (coordenadas originales)
import sys
from PIL import Image, ImageDraw
im = Image.open(sys.argv[1]).convert('RGB')
x0, y0, x1, y1 = map(int, sys.argv[2].split(','))
z = float(sys.argv[3])
c = im.crop((x0, y0, x1, y1)).resize((int((x1 - x0) * z), int((y1 - y0) * z)), Image.LANCZOS)
d = ImageDraw.Draw(c)
for x in range((x0 // 10 + 1) * 10, x1, 10):
    X = (x - x0) * z
    big = x % 50 == 0
    d.line([(X, 0), (X, 14 if big else 6)], fill=(255, 255, 0) if big else (255, 120, 0), width=1)
    if big:
        d.line([(X, 14), (X, c.height)], fill=(255, 255, 0, 60), width=1)
        d.text((X + 2, 15), str(x), fill=(255, 255, 0))
for y in range((y0 // 10 + 1) * 10, y1, 10):
    Y = (y - y0) * z
    big = y % 50 == 0
    d.line([(0, Y), (14 if big else 6, Y)], fill=(0, 255, 255) if big else (0, 140, 255), width=1)
    if big:
        d.line([(14, Y), (c.width, Y)], fill=(0, 255, 255), width=1)
        d.text((16, Y + 1), str(y), fill=(0, 255, 255))
c.save(sys.argv[4])

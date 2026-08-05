"""Bake every procedural sprite into a single atlas PNG + JSON index."""
import json, os, sys, math
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image
from artlib import Img, C, shash
import gen_terrain as GT
import gen_props as GP
import gen_chars as GC
import gen_items as GI
import gen_ui as UI

OUT = os.path.join(os.path.dirname(__file__), '..', 'game')
os.makedirs(OUT, exist_ok=True)

entries = []   # (name, Img)


def add(name, img):
    entries.append((name, img))


# ---------------- terrain ----------------
TERRAINS = ['grass', 'meadow', 'forest', 'swamp']
for t in TERRAINS:
    for v in range(4):
        add(f'tile_{t}_{v}', GT.grass_tile(shash(t) % 1000, v, t))
for v in range(4):
    add(f'tile_sand_{v}', GT.sand_tile(11, v))
    add(f'tile_dirt_{v}', GT.dirt_tile(12, v))
    add(f'tile_rock_{v}', GT.rock_tile(13, v, 'rock'))
    add(f'tile_snow_{v}', GT.snow_tile(14, v))
    add(f'tile_ash_{v}', GT.rock_tile(15, v, 'ash'))
WATER_VARIANTS = 3
for v in range(WATER_VARIANTS):
    for i, f in enumerate(GT.water_tiles(21, variant=v)):
        add(f'tile_water_{v}_{i}', f)
    for i, f in enumerate(GT.water_tiles(22, deep=True, variant=v)):
        add(f'tile_deep_{v}_{i}', f)
WATER_FRAMES = 6
FOAM_FRAMES = 4

# transition overlays: for each terrain, masked edge/corner pieces
M = GT.masks()
OVER = {'grass': GT.grass_tile(shash('grass') % 1000, 0, 'grass'),
        'meadow': GT.grass_tile(shash('meadow') % 1000, 0, 'meadow'),
        'forest': GT.grass_tile(shash('forest') % 1000, 0, 'forest'),
        'swamp': GT.grass_tile(shash('swamp') % 1000, 0, 'swamp'),
        'sand': GT.sand_tile(11, 0), 'dirt': GT.dirt_tile(12, 0),
        'rock': GT.rock_tile(13, 0, 'rock'), 'snow': GT.snow_tile(14, 0),
        'ash': GT.rock_tile(15, 0, 'ash')}
for name, tex in OVER.items():
    for mk, mm in M.items():
        add(f'edge_{name}_{mk}', GT.mask_to_img(mm, tex))

# shoreline foam: animated surge frames  ->  edge_foam_<dir>_<frame>
for name, im in GT.foam_frames(M, FOAM_FRAMES).items():
    add(f'edge_foam_{name}', im)

# ---------------- props ----------------
# Tres tallas por árbol, con semilla distinta cada una: no son el mismo árbol
# escalado, la copa se arma de nuevo. 24 siluetas x espejado en runtime = 48.
for i, k in enumerate(['oak', 'oak', 'autumn', 'pine', 'pine', 'jungle', 'dead', 'cherry']):
    sz = 1.0 + (i % 3) * 0.12
    add(f'tree_{k}_{i}', GP.tree(100 + i * 13, k, sz))
    add(f'tree_{k}_{i}_s', GP.tree(100 + i * 13 + 3, k, sz * 0.74))
    add(f'tree_{k}_{i}_l', GP.tree(100 + i * 13 + 7, k, sz * 1.24))
for i in range(3):
    add(f'rock_s_{i}', GP.rock(200 + i))
    add(f'rock_b_{i}', GP.rock(210 + i, big=True))
add('rock_snow_0', GP.rock(220, big=True, kind='snow'))
add('rock_ash_0', GP.rock(221, big=True, kind='ash'))
for ore in ['iron', 'gold', 'crystal', 'coal']:
    add(f'ore_{ore}', GP.ore_rock(300 + shash(ore) % 100, ore))
add('bush_0', GP.bush(400, 'oak'))
add('bush_1', GP.bush(401, 'jungle'))
add('bush_berry', GP.bush(402, 'oak', berries='#c8434f'))
add('bush_snow', GP.bush(403, 'dead'))
for i, col in enumerate(['#e4707f', '#e8d36a', '#c68fd8', '#ffffff', '#e89a4e', '#7fb8e8']):
    add(f'flower_{i}', GP.flower(500 + i, col))
add('mush_red', GP.mushroom(600, '#c0453f'))
add('mush_brown', GP.mushroom(601, '#9a7248'))
add('mush_blue', GP.mushroom(602, '#4f7fc0'))
add('stump_0', GP.stump(700))
add('pillar_0', GP.ruin_pillar(800))
add('pillar_1', GP.ruin_pillar(801))
add('shrine_0', GP.shrine(900))
add('chest_0', GP.chest(1000))
add('bedroll_0', GP.bedroll(1500))
add('wall_0', GP.wall_wood(1600))
add('wall_post', GP.wall_wood(1601, post=True))
for i in range(3):
    add(f'cliff_top_{i}', GP.cliff_top(1800 + i))
    add(f'cliff_face_{i}', GP.cliff_face(1810 + i))

add('door_closed', GP.door_wood(1700))
add('door_open', GP.door_wood(1701, open_=True))
for i, f in enumerate(GP.campfire(1100)):
    add(f'campfire_{i}', f)
for i in range(3):
    add(f'tuft_{i}', GP.grass_tuft(1200 + i))
add('cattail_0', GP.cattail(1300))
add('cactus_0', GP.cactus(1400))

# ---------------- characters ----------------
DIRS = ['s', 'w', 'n', 'e']
for hs in range(GC.HAIR_STYLES):
    ps = GC.player_sheet(hs)
    for (act, d), frames in ps.items():
        for i, f in enumerate(frames):
            add(f'player{hs}_{act}_{DIRS[d]}_{i}', f)
for kind in ['rabbit', 'deer', 'slime', 'bird', 'wolf']:
    cs = GC.critter_sheet(kind)
    for (act, d), frames in cs.items():
        for i, f in enumerate(frames):
            add(f'{kind}_{act}_{DIRS[d]}_{i}', f)
for i in range(4):
    add(f'firefly_{i}', GC.critter('firefly', 0, i))

# ---------------- item icons ----------------
for name, im in GI.all_icons().items():
    add(name, im)

# ---------------- UI chrome ----------------
FONT_IMG, FONT_META = UI.font_sheet()
add('ui_font', FONT_IMG)
add('ui_panel', UI.wood_panel(48, 48))
add('ui_parch', UI.parchment_panel(48, 48))
for st in ('idle', 'hover', 'press'):
    add(f'ui_btn_{st}', UI.button_panel(96, 26, st))
for st in ('idle', 'hover'):
    add(f'ui_slot_{st}', UI.slot_panel(26, st))
add('ui_bar', UI.bar_frame(80, 10))
add('ui_logo', UI.logo_mark())

# ---------------- pack ----------------
PAD = 1
entries.sort(key=lambda e: -e[1].h)
AW = 512
x = y = rowh = 0
placed = []
for name, img in entries:
    if x + img.w + PAD > AW:
        x = 0
        y += rowh + PAD
        rowh = 0
    placed.append((name, img, x, y))
    x += img.w + PAD
    rowh = max(rowh, img.h)
AH = y + rowh + PAD
AH = 2 ** math.ceil(math.log2(max(AH, 1)))

atlas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
index = {}
for name, img, px, py in placed:
    atlas.paste(img.im, (px, py))
    index[name] = [px, py, img.w, img.h]

atlas.save(os.path.join(OUT, 'atlas.png'))
with open(os.path.join(OUT, 'atlas.json'), 'w') as fh:
    json.dump(index, fh, separators=(',', ':'))
with open(os.path.join(OUT, 'font.json'), 'w') as fh:
    json.dump({'glyphs': FONT_META, 'w': UI.FW, 'h': UI.FH}, fh, separators=(',', ':'))
with open(os.path.join(OUT, 'pal.json'), 'w') as fh:
    json.dump(GC.palette_map(), fh, separators=(',', ':'))
print(f'atlas {AW}x{AH}, {len(index)} sprites')

# ---------------- contact sheet (for review) ----------------
SC = 3
cols = 14
cell = 56
rows = math.ceil(len(entries) / cols)
sheet = Image.new('RGBA', (cols * cell, rows * cell), (30, 28, 38, 255))
for i, (name, img) in enumerate(sorted(entries, key=lambda e: e[0])):
    cx = (i % cols) * cell
    cy = (i // cols) * cell
    s = img.im.resize((img.w * SC, img.h * SC), Image.NEAREST)
    ox = cx + (cell - s.width) // 2
    oy = cy + (cell - s.height) // 2
    sheet.alpha_composite(s, (max(cx, ox), max(cy, oy)))
sheet.save(os.path.join(os.path.dirname(__file__), '..', 'assets_raw', 'contact.png'))
print('contact sheet done', sheet.size)

import sys
import os

# 1. Update gen_props.py
with open("pixel-explorer/pixel-explorer/tools/gen_props.py", "r") as f:
    content = f.read()

if "def cliff_top(seed):" not in content:
    cliff_funcs = """

def cliff_top(seed):
    rnd = random.Random(seed)
    img = Img(16, 8)
    dk, lt = C('#5f5c56'), C('#8d8a82')
    img.rect(0, 0, 16, 8, lt)
    for _ in range(5):
        x, y = rnd.randrange(16), rnd.randrange(8)
        img.set(x, y, dk)
    return img

def cliff_face(seed):
    rnd = random.Random(seed)
    img = Img(16, 16)
    dk, md = C('#3f3c36'), C('#5f5c56')
    img.rect(0, 0, 16, 16, dk)
    for _ in range(8):
        x, y = rnd.randrange(16), rnd.randrange(16)
        img.set(x, y, md)
        img.hline(max(0, x-1), y, rnd.randrange(2, 5), md)
    return img
"""
    content += cliff_funcs
    with open("pixel-explorer/pixel-explorer/tools/gen_props.py", "w") as f:
        f.write(content)

# 2. Update bake.py
with open("pixel-explorer/pixel-explorer/tools/bake.py", "r") as f:
    bake_content = f.read()

if "'cliff_top_'" not in bake_content:
    insert_str = """
for i in range(3):
    add(f'cliff_top_{i}', GP.cliff_top(1800 + i))
    add(f'cliff_face_{i}', GP.cliff_face(1810 + i))
"""
    bake_content = bake_content.replace("add('wall_post', GP.wall_wood(1601, post=True))", "add('wall_post', GP.wall_wood(1601, post=True))" + insert_str)
    with open("pixel-explorer/pixel-explorer/tools/bake.py", "w") as f:
        f.write(bake_content)

print("Props and bake updated.")

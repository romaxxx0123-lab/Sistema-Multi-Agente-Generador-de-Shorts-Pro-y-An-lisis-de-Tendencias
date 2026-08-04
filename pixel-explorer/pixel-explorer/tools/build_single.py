"""Bundle the game into ONE self-contained .html (no network needed)."""
import base64, json, os, re

ROOT = os.path.join(os.path.dirname(__file__), '..')
G = os.path.join(ROOT, 'game')

html = open(os.path.join(G, 'index.html'), encoding='utf-8').read()
world = open(os.path.join(G, 'js/world.js'), encoding='utf-8').read()
render = open(os.path.join(G, 'js/render.js'), encoding='utf-8').read()
ui = open(os.path.join(G, 'js/ui.js'), encoding='utf-8').read()
menu = open(os.path.join(G, 'js/menu.js'), encoding='utf-8').read()
cc = open(os.path.join(G, 'js/charcustom.js'), encoding='utf-8').read()
creator = open(os.path.join(G, 'js/creator.js'), encoding='utf-8').read()
quests = open(os.path.join(G, 'js/quests.js'), encoding='utf-8').read()
audio = open(os.path.join(G, 'js/audio.js'), encoding='utf-8').read()
crafting = open(os.path.join(G, 'js/crafting.js'), encoding='utf-8').read()
craftui = open(os.path.join(G, 'js/craftui.js'), encoding='utf-8').read()
persist = open(os.path.join(G, 'js/persist.js'), encoding='utf-8').read()
legacy = open(os.path.join(G, 'js/legacy.js'), encoding='utf-8').read()
seasons = open(os.path.join(G, 'js/seasons.js'), encoding='utf-8').read()
game = open(os.path.join(G, 'js/game.js'), encoding='utf-8').read()

atlas_png = base64.b64encode(open(os.path.join(G, 'atlas.png'), 'rb').read()).decode()
atlas_json = open(os.path.join(G, 'atlas.json'), encoding='utf-8').read()
font_json = open(os.path.join(G, 'font.json'), encoding='utf-8').read()
pal_json = open(os.path.join(G, 'pal.json'), encoding='utf-8').read()


def strip_imports(src):
    # handles both single-line and multi-line `import { a, b } from '...'`
    src = re.sub(r"^\s*import\s+[\s\S]*?from\s+['\"][^'\"]+['\"];?\s*$",
                 '', src, flags=re.M)
    src = re.sub(r"^\s*import\s+['\"][^'\"]+['\"];?\s*$", '', src, flags=re.M)
    return src


def strip_exports(src):
    src = re.sub(r'^\s*export\s+(?=(const|let|var|function|class)\b)', '', src, flags=re.M)
    src = re.sub(r'^\s*export\s+\{[^}]*\};?\s*$', '', src, flags=re.M)
    return src


_parts = [strip_exports(strip_imports(s)) for s in
          (world, render, ui, cc, quests, audio, crafting, craftui, persist, legacy, seasons)]
# `import * as Persist` becomes a plain namespace object in the flat bundle
_ns = ('\nconst Persist = { SCHEMA, readRaw, writeRaw, migrate, load,'
       ' snapshotRun, saveRun, clearRun, recordResult, saveSettings, saveLook };\n')
_rest = [strip_exports(strip_imports(s)) for s in (menu, creator, game)]
bundle = '\n'.join(_parts) + _ns + '\n'.join(_rest)

# swap the network loads for embedded data
bundle = bundle.replace(
    """  const [img, idx, fmeta, pmeta] = await Promise.all([
    loadImg('atlas.png'),
    fetch('atlas.json').then(r => r.json()),
    fetch('font.json').then(r => r.json()),
    fetch('pal.json').then(r => r.json()),
  ]);""",
    """  const [img, idx, fmeta, pmeta] = [await loadImg(ATLAS_PNG), ATLAS_JSON, FONT_JSON, PAL_JSON];""")

header = (f'const ATLAS_PNG = "data:image/png;base64,{atlas_png}";\n'
          f'const ATLAS_JSON = {atlas_json};\n'
          f'const FONT_JSON = {font_json};\n'
          f'const PAL_JSON = {pal_json};\n')

html = html.replace('<script type="module" src="js/game.js"></script>',
                    '<script type="module">\n' + header + bundle + '\n</script>')

out = os.path.join(ROOT, 'Vagabundo-de-Ellswyr.html')
open(out, 'w', encoding='utf-8').write(html)
print('wrote', out, round(os.path.getsize(out) / 1024, 1), 'KB')

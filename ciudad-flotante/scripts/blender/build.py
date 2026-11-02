"""
Genera los modelos del juego con Blender: ejecuta cada `models/<archivo>.py` (su `build()`) en una
escena vacía y lo exporta a `src/assets/models/<archivo>.glb`. Escribe además
`src/assets/models/manifest.json` (triángulos y caja envolvente de cada modelo, en coordenadas
del juego) para los tests.

Uso (mejor con `npm run models`, que prepara la paleta y busca el Python con bpy):
    python scripts/blender/build.py [archivo ...]
"""
import importlib.util
import json
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'src', 'assets', 'models')
MODELS = os.path.join(HERE, 'models')
sys.path.insert(0, HERE)

import cf  # noqa: E402

# Límite de triángulos por modelo: el barco fusiona cientos de piezas en pocas mallas.
MAX_TRIS = {'default': 2500}


def load(name):
    spec = importlib.util.spec_from_file_location(f'models.{name}', os.path.join(MODELS, name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def game_bounds(ob):
    lo, hi = cf.bounds(ob)
    # Blender (x, y, z) → juego (x, z, −y)
    return [round(lo[0], 4), round(lo[2], 4), round(-hi[1], 4)], [round(hi[0], 4), round(hi[2], 4), round(-lo[1], 4)]


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    names = args or sorted(f[:-3] for f in os.listdir(MODELS) if f.endswith('.py') and not f.startswith('_'))
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, 'manifest.json')
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding='utf-8') as f:
            manifest = json.load(f)
    seen = {m: f for f, entry in manifest.items() if f not in names for m in entry['models']}
    failed = []
    for name in names:
        try:
            cf.reset()
            mod = load(name)
            mod.build()
            entry = {'models': {}, 'animations': bool(getattr(mod, 'ANIMATIONS', False))}
            limit = getattr(mod, 'MAX_TRIS', MAX_TRIS['default'])
            for ob in cf.roots():
                if ob.name in seen:
                    raise ValueError(f'modelo «{ob.name}» repetido (ya está en {seen[ob.name]}.glb)')
                seen[ob.name] = name
                tris = sum(cf.triangles(o) for o in [ob, *ob.children_recursive])
                if tris > limit:
                    raise ValueError(f'«{ob.name}» tiene {tris} triángulos (máx. {limit})')
                lo, hi = game_bounds(ob) if ob.type == 'MESH' else ([0, 0, 0], [0, 0, 0])
                entry['models'][ob.name] = {'tris': tris, 'min': lo, 'max': hi}
            cf.export_glb(os.path.join(OUT, name + '.glb'), animations=entry['animations'])
            manifest[name] = entry
            print(f'✓ {name}.glb: ' + ', '.join(f'{k} ({v["tris"]} tri)' for k, v in entry['models'].items()))
        except Exception:
            failed.append(name)
            print(f'✗ {name}:', file=sys.stderr)
            traceback.print_exc()
    # Vuelve a leer el manifiesto justo antes de escribirlo: otro proceso puede haber añadido lo suyo.
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding='utf-8') as f:
            fresh = json.load(f)
        manifest = {**fresh, **{k: v for k, v in manifest.items() if k in names}}
    for gone in [k for k in manifest if not os.path.exists(os.path.join(MODELS, k + '.py'))]:
        del manifest[gone]
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(manifest.items())), f, indent=2, ensure_ascii=False)
        f.write('\n')
    if failed:
        sys.exit(f'Fallaron: {", ".join(failed)}')


if __name__ == '__main__':
    main()

#!/usr/bin/env bash
# Instala Blender como módulo de Python (bpy, sin interfaz) en un entorno virtual propio.
# Solo hace falta para regenerar los modelos (npm run models); el juego usa los .glb ya generados.
set -euo pipefail
VENV="${BLENDER_VENV:-$HOME/.cache/ciudad-flotante/blender}"
BPY_VERSION="${BPY_VERSION:-5.2.3}"
PY="$(command -v python3.13 || command -v python3)"
if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 13) else 1)'; then
  echo "bpy $BPY_VERSION necesita Python 3.13 (encontrado: $("$PY" --version))" >&2
  exit 1
fi
if [ -x "$VENV/bin/python" ] && "$VENV/bin/python" -c 'import bpy' 2>/dev/null; then
  echo "Blender ya está instalado en $VENV"
  exit 0
fi
mkdir -p "$(dirname "$VENV")"
if command -v uv >/dev/null; then
  uv venv -q --python "$PY" "$VENV"
  uv pip install -q --python "$VENV/bin/python" "bpy==$BPY_VERSION"
else
  "$PY" -m venv "$VENV"
  "$VENV/bin/pip" install -q "bpy==$BPY_VERSION"
fi
"$VENV/bin/python" -c 'import bpy; print("Blender", bpy.app.version_string, "listo en '"$VENV"'")'

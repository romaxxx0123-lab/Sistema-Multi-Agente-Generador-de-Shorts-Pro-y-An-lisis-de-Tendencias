#!/usr/bin/env bash
# Baja los datos que usa BrickMatch. No se versionan (pesan unos 600 MB).
#   1. Piezas en 3D: librería oficial LDraw (CC BY 4.0)
#   2. Sets e inventarios: base de Rebrickable, empaquetada como SQLite por el proyecto rb.db
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/rebrickable

if [ ! -d data/ldraw/parts ] && [ ! -d data/ldraw-extract/usr/share/ldraw/parts ]; then
  if command -v apt-get >/dev/null 2>&1 && apt-cache show ldraw-parts >/dev/null 2>&1; then
    echo "Bajando la librería LDraw (paquete ldraw-parts)…"
    mkdir -p data/ldraw-deb
    (cd data/ldraw-deb && apt-get download ldraw-parts)
    dpkg-deb -x data/ldraw-deb/ldraw-parts_*.deb data/ldraw-extract
  else
    echo "Bajando la librería LDraw (library.ldraw.org)…"
    curl -fL -o data/complete.zip https://library.ldraw.org/library/updates/complete.zip
    unzip -q data/complete.zip -d data
  fi
fi

echo "Bajando la base de sets (Rebrickable vía rb.db)…"
curl -fL -o data/rebrickable/rb.db.xz https://github.com/ojuuji/rb.db/releases/latest/download/rb.db.xz
xz -df data/rebrickable/rb.db.xz

npm run index

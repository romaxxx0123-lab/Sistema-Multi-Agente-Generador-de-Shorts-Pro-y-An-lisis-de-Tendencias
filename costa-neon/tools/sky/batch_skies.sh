#!/bin/bash
# Descarga (4k) y prepara los cielos del juego. Uso: batch_skies.sh <carpeta descargas> <carpeta salida>
DL=$1; OUT=$2; mkdir -p $DL $OUT
H=$(cd "$(dirname "$0")" && pwd)
while read -r src id weather elov; do
  [ -z "$src" ] && continue
  f=${src}_puresky_4k.hdr
  [ -s $DL/$f ] || curl -s -m 600 -o $DL/$f "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/$f" || { echo "FALLO descarga $src"; continue; }
  python3 $H/make_sky.py $DL/$f $id $OUT $weather $elov > /dev/null || echo "FALLO $id"
  echo "listo $id"
done <<'LIST'
qwantani_dawn alba 1.0 -2
qwantani_sunrise salida 1.0
kloppenheim_06 dorado 1.0
evening_road_01 tarde_baja 1.0
kloofendal_38d_partly_cloudy manana 1.0
kloofendal_48d_partly_cloudy cumulos_48 1.0
kloppenheim_05 mediodia 1.0
sunflowers cumulos_43 1.0
qwantani_late_afternoon tarde 1.0
industrial_sunset ocaso 1.0
belfast_sunset puesta 1.0
qwantani_dusk_2 crepusculo 1.0 -2
kloppenheim_03 nublado 0.7
overcast_soil lluvia 0.3
kloofendal_28d_misty niebla 0.6
LIST

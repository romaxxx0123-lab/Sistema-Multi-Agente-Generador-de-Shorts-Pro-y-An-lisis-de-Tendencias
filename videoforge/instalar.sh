#!/usr/bin/env bash
# Instala VideoForge en esta maquina y comprueba que puede montar un video.
#
# No hace nada fuera de esta carpeta: el entorno virtual, el cache y los
# modelos viven aqui dentro o en ~/.cache/videoforge. Se puede volver a
# ejecutar cuantas veces quieras; lo que ya este hecho lo salta.
#
#   ./instalar.sh            instala lo que hace falta y comprueba
#   ./instalar.sh --cpu      fuerza la version de CPU aunque haya GPU
#   ./instalar.sh --probar   ademas monta una guia de ejemplo al final

set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$AQUI/backend"
VENV="$BACKEND/.venv"

FORZAR_CPU=0
PROBAR=0
for arg in "$@"; do
    case "$arg" in
        --cpu) FORZAR_CPU=1 ;;
        --probar) PROBAR=1 ;;
        -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' \
                       "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "No conozco la opcion '$arg'. Prueba --help."; exit 2 ;;
    esac
done

paso()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
bien()  { printf '    \033[32mOK\033[0m %s\n' "$1"; }
aviso() { printf '    \033[33m!\033[0m  %s\n' "$1"; }
malo()  { printf '    \033[31mX\033[0m  %s\n' "$1"; }

# -- 1. lo que tiene que traer el sistema ------------------------------------

paso "Comprobando lo que hace falta del sistema"

# Lo unico imprescindible es Python. **ffmpeg no se exige**: el paquete
# `imageio-ffmpeg`, que es dependencia del proyecto, trae su propio ffmpeg 7.0.2,
# y `forge` lo busca en este orden: la ruta que le des en FORGE_FFMPEG, su cache,
# el PATH del sistema, y por ultimo ese binario del paquete. Asi que esto se
# instala **sin tocar el gestor de paquetes**.
#
# La primera version de este script abortaba si no encontraba ffmpeg en el PATH,
# y estaba mal: al probarlo en una maquina sin ffmpeg del sistema fallaba en un
# sitio donde la app funcionaba perfectamente.
if ! command -v python3 >/dev/null; then
    malo "falta python3"
    if command -v pacman >/dev/null; then
        echo "      sudo pacman -S python"
    elif command -v apt >/dev/null; then
        echo "      sudo apt install python3 python3-venv"
    fi
    exit 1
fi

if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    malo "hace falta Python 3.10 o superior (tienes $(python3 --version 2>&1 | cut -d" " -f2))"
    exit 1
fi
bien "python $(python3 --version 2>&1 | cut -d' ' -f2)"

if command -v ffmpeg >/dev/null; then
    bien "ffmpeg del sistema $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3)"
else
    aviso "sin ffmpeg del sistema: se usara el que trae el paquete de Python"
    # Ese paquete trae ffmpeg pero **no ffprobe**, y sin ffprobe los metadatos
    # del video se sondean con ffmpeg, que da menos detalle (lo dice el
    # diagnostico). Funciona, pero el del sistema es mejor.
    if command -v pacman >/dev/null; then
        echo "       Para tener tambien ffprobe: sudo pacman -S ffmpeg"
    fi
fi

# -- 2. GPU: decide que variante de onnxruntime se instala -------------------

paso "Buscando GPU NVIDIA"

EXTRA_VISION="vision"
if [ "$FORZAR_CPU" = "1" ]; then
    aviso "--cpu: se instala la version de CPU"
elif command -v nvidia-smi >/dev/null && nvidia-smi >/dev/null 2>&1; then
    tarjeta="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)"
    bien "${tarjeta:-NVIDIA}"
    EXTRA_VISION="vision-gpu"
else
    aviso "sin GPU NVIDIA: todo en CPU (funciona igual, mas lento)"
fi

# -- 3. el entorno virtual ---------------------------------------------------

paso "Preparando el entorno de Python"

if [ ! -d "$VENV" ]; then
    python3 -m venv "$VENV"
    bien "entorno creado en backend/.venv"
else
    bien "el entorno ya existia"
fi

PY="$VENV/bin/python"
"$PY" -m pip install --quiet --upgrade pip

paso "Instalando VideoForge y sus extras (esto tarda unos minutos)"
echo "    speech + audio + $EXTRA_VISION + ocr + fonts + api"
"$PY" -m pip install --quiet -e "$BACKEND[speech,audio,$EXTRA_VISION,ocr,fonts,api]"
bien "instalado"

FORGE="$VENV/bin/forge"
if [ ! -x "$FORGE" ]; then
    malo "no se creo el comando 'forge' en backend/.venv/bin/"
    exit 1
fi

# -- 4. las fuentes de los rotulos ------------------------------------------

paso "Copiando las fuentes de los rotulos"
"$FORGE" fonts

# -- 5. el diagnostico, que es lo que de verdad dice si va -------------------

paso "Diagnostico"
# `forge doctor` es la unica autoridad sobre si esta maquina puede montar un
# video: resuelve el ffmpeg que se va a usar de verdad, comprueba los cinco
# filtros que hacen falta, mira la GPU y dice el perfil elegido. Si algo no esta,
# lo dice el, con su ruta y su motivo -- no hace falta adivinarlo antes.
if ! "$FORGE" doctor; then
    echo
    malo "el diagnostico ha fallado"
    if command -v pacman >/dev/null; then
        echo "    Si se queja de ffmpeg o de los filtros, instala el del sistema:"
        echo "      sudo pacman -S ffmpeg"
    fi
    exit 1
fi

# -- 6. y si lo pides, un montaje de ejemplo --------------------------------

if [ "$PROBAR" = "1" ]; then
    paso "Montando una guia de ejemplo (2 minutos de video)"
    "$FORGE" demo -m 2 -s palworld -o "$AQUI/prueba"
    echo
    bien "mira $AQUI/prueba/ : estan el original y el montaje, para comparar"
fi

# -- 7. como se usa ---------------------------------------------------------

cat <<AYUDA

$(printf '\033[1m')Listo.$(printf '\033[0m') El comando vive en backend/.venv/bin/forge. Para tenerlo a mano:

    source $VENV/bin/activate

Y entonces, con un video tuyo:

    forge identify  ~/videos/mi-guia.mkv
    forge render    ~/videos/mi-guia.mkv -s palworld --preview --balance --broll
    forge render    ~/videos/mi-guia.mkv -s palworld --balance --broll -o ~/editado.mp4

--preview saca 540p rapido para revisar el montaje; quitalo para el bueno.
Estilos: palworld, tutorial, cinematic, documentary, vlog, clean-corporate,
gaming-hype.  Mas detalle en README.md.
AYUDA

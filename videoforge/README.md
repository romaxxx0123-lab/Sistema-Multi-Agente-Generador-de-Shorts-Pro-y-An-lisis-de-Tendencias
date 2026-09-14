# VideoForge

Subes un video, lo entiende, lo **monta de verdad** y **mide que no quede sobresaturado**.

No es un generador de plantillas: analiza el material real (planos, movimiento, voz,
texto en pantalla), decide un montaje explicable y lo renderiza con FFmpeg a un MP4
que puedes subir tal cual.

Todo el analisis corre **en local y con modelos libres**. Sin APIs de pago.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| F0 | Scaffold, toolchain, cache, CLI | hecho |
| F1 | Ingesta y analisis (planos, movimiento, audio, transcripcion) | en curso |
| F2 | EDL, estilos y planner | pendiente |
| F3 | Renderer FFmpeg | pendiente |
| F4 | Motor de saturacion y auto-balanceador | pendiente |
| F5 | Comprension de contenido y b-roll | pendiente |
| F6 | API y UI web | pendiente |

## Requisitos

- Python 3.10 o superior
- FFmpeg 6+ con los filtros `zoompan`, `overlay`, `ass`, `loudnorm` y `sidechaincompress`
- Opcional: GPU NVIDIA con driver 570+ y CUDA 12.8+ para acelerar transcripcion y render

## Instalacion

### CachyOS / Arch (recomendado)

```bash
sudo pacman -S ffmpeg python
cd videoforge/backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
```

### Windows

Instala FFmpeg (`winget install Gyan.FFmpeg`) y luego:

```powershell
cd videoforge\backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -e .
```

Si FFmpeg no esta en el PATH, indica su ruta con `FORGE_FFMPEG` y `FORGE_FFPROBE`.

### Extras opcionales

```bash
pip install -e ".[speech,audio,vision,ocr]"   # analisis completo en CPU
pip install -e ".[speech,audio,vision-gpu]"   # con aceleracion NVIDIA
pip install -e ".[dev]"                       # tests
```

## Uso

```bash
forge doctor                 # comprueba entorno, filtros, GPU y perfil elegido
forge probe video.mp4        # metadatos del video
forge make-fixture t.mp4     # genera un video de pruebas sin descargar nada
forge cache info video.mp4   # que hay cacheado de ese video
forge cache clear video.mp4  # lo borra
```

Empieza siempre por `forge doctor`: detecta la GPU, verifica que tu build de FFmpeg
trae los filtros necesarios y te dice con que perfil va a trabajar. Si la GPU no es
utilizable lo avisa y sigue en CPU, nunca se cae.

## Configuracion

Todo se ajusta por variables de entorno:

| Variable | Para que sirve |
|---|---|
| `FORGE_DEVICE` | `auto` (por defecto), `cuda` o `cpu` |
| `FORGE_TIER` | `light`, `balanced` (por defecto) o `max` |
| `FORGE_CACHE_DIR` | Donde se guarda el analisis. Por defecto `~/.cache/videoforge` |
| `FORGE_FFMPEG` / `FORGE_FFPROBE` | Rutas explicitas a los binarios |
| `FORGE_THREADS` | Hilos de FFmpeg; `0` deja que decida el |
| `FORGE_FULL_HASH` | `1` para hashear el fichero entero en vez de muestrear |

El **perfil** (`FORGE_TIER`) decide solo el tamano de los modelos, cada cuanto se
muestrean fotogramas y la resolucion de analisis. En `max` con GPU usa Whisper
large-v3; en `light` en CPU usa Whisper base. El render final siempre parte del
video original a resolucion completa, sea cual sea el perfil.

## Desarrollo

```bash
cd videoforge/backend
.venv/bin/python -m pytest -q
```

Los tests generan su propio video de prueba con FFmpeg, asi que no dependen de
ningun fichero externo ni de la red.

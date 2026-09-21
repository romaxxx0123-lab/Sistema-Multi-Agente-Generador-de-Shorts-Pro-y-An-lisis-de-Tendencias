# Instala VideoForge en esta maquina (Windows) y comprueba que puede montar un video.
#
# Es el equivalente de `instalar.sh` para PowerShell. No hace nada fuera de esta
# carpeta: el entorno virtual vive en backend\.venv y el cache en
# %LOCALAPPDATA%\videoforge. Se puede repetir; lo que ya este hecho lo salta.
#
#   .\instalar.ps1            instala lo que hace falta y comprueba
#   .\instalar.ps1 -Cpu       fuerza la version de CPU aunque haya GPU
#   .\instalar.ps1 -Probar    ademas monta una guia de ejemplo al final
#
# Si PowerShell se niega a ejecutarlo por la politica de scripts:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

[CmdletBinding()]
param(
    [switch]$Cpu,
    [switch]$Probar
)

$ErrorActionPreference = 'Stop'

$Aqui    = $PSScriptRoot
$Backend = Join-Path $Aqui 'backend'
$Venv    = Join-Path $Backend '.venv'

function Paso($t)  { Write-Host "`n==> $t" -ForegroundColor White }
function Bien($t)  { Write-Host "    OK " -ForegroundColor Green -NoNewline; Write-Host $t }
function Aviso($t) { Write-Host "    !  " -ForegroundColor Yellow -NoNewline; Write-Host $t }
function Malo($t)  { Write-Host "    X  " -ForegroundColor Red -NoNewline; Write-Host $t }

# -- 1. Python ---------------------------------------------------------------

Paso 'Comprobando lo que hace falta del sistema'

# En Windows `python` puede ser el alias de la Microsoft Store que no instala
# nada y abre la tienda, asi que se comprueba que responda de verdad.
$python = $null
foreach ($candidato in @('python', 'python3', 'py')) {
    $cmd = Get-Command $candidato -ErrorAction SilentlyContinue
    if (-not $cmd) { continue }
    try {
        $v = & $candidato -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>$null
        if ($LASTEXITCODE -eq 0 -and $v) { $python = $candidato; $version = $v.Trim(); break }
    } catch { }
}

if (-not $python) {
    Malo 'no encuentro un Python que funcione'
    Write-Host '    Instalalo con:  winget install Python.Python.3.12'
    Write-Host '    (o desde python.org; marca "Add python.exe to PATH")'
    exit 1
}

$partes = $version.Split('.')
if ([int]$partes[0] -lt 3 -or ([int]$partes[0] -eq 3 -and [int]$partes[1] -lt 10)) {
    Malo "hace falta Python 3.10 o superior (tienes $version)"
    exit 1
}
Bien "python $version ($python)"

# ffmpeg NO se exige: `imageio-ffmpeg` es dependencia del proyecto y trae su
# propio ffmpeg.exe. `forge` lo busca en orden: FORGE_FFMPEG, su cache, el PATH,
# y por ultimo ese. Lo unico que ese paquete no trae es ffprobe.
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    Bien 'ffmpeg del sistema encontrado'
} else {
    Aviso 'sin ffmpeg del sistema: se usara el que trae el paquete de Python'
    Write-Host '       Para tener tambien ffprobe (sondeo mas preciso):'
    Write-Host '         winget install Gyan.FFmpeg'
}

# -- 2. GPU ------------------------------------------------------------------

Paso 'Buscando GPU NVIDIA'

$extraVision = 'vision'
if ($Cpu) {
    Aviso '-Cpu: se instala la version de CPU'
} elseif (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    $tarjeta = (& nvidia-smi --query-gpu=name --format=csv,noheader 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE -eq 0 -and $tarjeta) {
        Bien $tarjeta.Trim()
        $extraVision = 'vision-gpu'
    } else {
        Aviso 'nvidia-smi esta pero no responde: se instala la version de CPU'
    }
} else {
    Aviso 'sin GPU NVIDIA: todo en CPU (funciona igual, mas lento)'
}

# -- 3. el entorno -----------------------------------------------------------

Paso 'Preparando el entorno de Python'

if (-not (Test-Path $Venv)) {
    & $python -m venv $Venv
    if ($LASTEXITCODE -ne 0) { Malo 'no pude crear el entorno'; exit 1 }
    Bien 'entorno creado en backend\.venv'
} else {
    Bien 'el entorno ya existia'
}

$Bin = Join-Path $Venv 'Scripts'
$Py  = Join-Path $Bin 'python.exe'
if (-not (Test-Path $Py)) {
    # Por si se ejecuta sobre un entorno creado desde WSL o Git Bash.
    $Bin = Join-Path $Venv 'bin'
    $Py  = Join-Path $Bin 'python'
}
if (-not (Test-Path $Py)) { Malo 'el entorno no tiene python'; exit 1 }

& $Py -m pip install --quiet --upgrade pip

Paso 'Instalando VideoForge y sus extras (esto tarda unos minutos)'
Write-Host "    speech + audio + $extraVision + ocr + fonts + api"
& $Py -m pip install --quiet -e "$Backend[speech,audio,$extraVision,ocr,fonts,api]"
if ($LASTEXITCODE -ne 0) { Malo 'fallo la instalacion de los paquetes'; exit 1 }
Bien 'instalado'

$Forge = Join-Path $Bin 'forge.exe'
if (-not (Test-Path $Forge)) { $Forge = Join-Path $Bin 'forge' }
if (-not (Test-Path $Forge)) { Malo "no se creo el comando 'forge' en $Bin"; exit 1 }

# -- 4. fuentes --------------------------------------------------------------

Paso 'Copiando las fuentes de los rotulos'
& $Forge fonts

# -- 5. diagnostico ----------------------------------------------------------

Paso 'Diagnostico'
# `forge doctor` es la unica autoridad sobre si esta maquina puede montar un
# video: resuelve el ffmpeg que se va a usar, comprueba los cinco filtros que
# hacen falta, mira la GPU y dice el perfil elegido.
& $Forge doctor
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Malo 'el diagnostico ha fallado'
    Write-Host '    Si se queja de ffmpeg o de los filtros:  winget install Gyan.FFmpeg'
    exit 1
}

# -- 6. un montaje de ejemplo ------------------------------------------------

if ($Probar) {
    Paso 'Montando una guia de ejemplo (2 minutos de video)'
    & $Forge demo -m 2 -s palworld -o (Join-Path $Aqui 'prueba')
    Write-Host ''
    Bien "mira $(Join-Path $Aqui 'prueba') : estan el original y el montaje, para comparar"
}

# -- 7. como se usa ----------------------------------------------------------

$activar = Join-Path $Bin 'Activate.ps1'
Write-Host ''
Write-Host 'Listo.' -ForegroundColor White -NoNewline
Write-Host " El comando vive en $Forge. Para tenerlo a mano:"
Write-Host ''
Write-Host "    $activar"
Write-Host ''
Write-Host 'Y entonces, con un video tuyo:'
Write-Host ''
Write-Host '    forge identify  $HOME\videos\mi-guia.mkv'
Write-Host '    forge render    $HOME\videos\mi-guia.mkv -s palworld --preview --balance --broll'
Write-Host '    forge render    $HOME\videos\mi-guia.mkv -s palworld --balance --broll -o $HOME\editado.mp4'
Write-Host ''
Write-Host '--preview saca 540p rapido para revisar el montaje; quitalo para el bueno.'
Write-Host 'Estilos: palworld, tutorial, cinematic, documentary, vlog, clean-corporate,'
Write-Host 'gaming-hype.  Mas detalle en README.md.'

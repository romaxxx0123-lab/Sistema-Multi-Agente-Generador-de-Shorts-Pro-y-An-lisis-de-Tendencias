"""Genera una guia falsa pero realista, para comprobar que el montaje sirve.

El fixture de barras de color sirve para probar la *mecanica* (que los cortes se
apliquen, que el zoom encuadre). No sirve para juzgar si el montaje **queda
bien**, que es otra cosa.

Este modulo construye algo mucho mas parecido a lo que se sube de verdad:

- una **grabacion de pantalla** de una aplicacion, con barra superior, menu
  lateral, panel de contenido y un cursor que se mueve y se para donde toca;
- **audio con estructura de habla**: palabras como rafagas, pausas de duracion
  variable entre frases, y ruido de sala en los silencios;
- una **transcripcion que encaja al milisegundo** con ese audio, de modo que se
  puede probar todo el montaje aunque no haya modelo de voz instalado.

El objetivo no es engañar a nadie: es tener material con la *forma* de una guia
real (ritmo de habla, pausas, cambios de pantalla, zonas quietas y zonas con
movimiento) para poder mirar el resultado y juzgarlo.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .config import Settings
from .tools import ffmpeg_bin, run

SAMPLE_RATE = 48000
WIDTH = 1280
HEIGHT = 720
FPS = 30

#: Paleta de la aplicacion falsa. Oscura, como casi cualquier app moderna.
FONDO = (18, 20, 24)
PANEL = (28, 31, 37)
LINEA = (45, 50, 58)
TEXTO = (225, 230, 238)
TENUE = (130, 140, 155)
ACENTO = (255, 163, 78)  # BGR: azul acento
VERDE = (120, 200, 130)


@dataclass
class Beat:
    """Una frase de la guia con lo que pasa en pantalla mientras se dice."""

    text: str
    #: pausa despues de la frase, en segundos
    pause: float
    #: pantalla que se muestra: cambia => cambio de plano
    screen: str
    #: elemento del menu resaltado (indice), o None
    highlight: int | None = None
    #: destino del cursor en coordenadas normalizadas
    cursor: tuple[float, float] = (0.5, 0.5)
    #: palabra que se dice mas alto, si alguna. El habla real acentua: una
    #: silaba tonica esta entre 4 y 10 dB por encima del resto de la frase.
    #: Sin esto, la voz sintetica tenia **cero** dinamica entre palabras (medido:
    #: la mas alta quedaba 0,6 dB sobre la media) y no habia forma de comprobar
    #: que la deteccion de enfasis sirviera para nada.
    stress: str = ""


#: Guion de la guia. Las pausas son deliberadamente variadas: las cortas son el
#: ritmo natural del habla y no deben recortarse; las largas son tiempo muerto y
#: si, y ademas marcan el cambio de tema para los capitulos.
GUIDE_SCRIPT: tuple[Beat, ...] = (
    Beat("hola, en este video vamos a configurar el panel de ajustes", 0.5, "inicio", None, (0.5, 0.45), stress="ajustes"),
    Beat("lo primero es abrir la aplicacion", 0.35, "inicio", None, (0.5, 0.5)),
    Beat("eh, y buscar el menu lateral", 1.9, "inicio", 0, (0.12, 0.35), stress="lateral"),

    Beat("aqui en el menu pulsamos sobre ajustes", 0.4, "menu", 2, (0.12, 0.52)),
    Beat("fijate bien en este boton de la izquierda", 0.35, "menu", 2, (0.12, 0.52), stress="izquierda"),
    Beat("osea, el que pone configuracion avanzada", 2.4, "menu", 3, (0.12, 0.62)),

    Beat("ahora se abre el panel de la derecha", 0.4, "ajustes", 3, (0.62, 0.4)),
    Beat("y activamos esta casilla de aqui", 0.3, "ajustes", 3, (0.72, 0.46)),
    Beat("esto es lo importante, sin esto no funciona", 2.2, "ajustes", 3, (0.72, 0.46), stress="importante"),

    Beat("bueno, tambien conviene revisar el limite de memoria", 0.4, "avanzado", 4, (0.62, 0.58)),
    Beat("yo lo dejo en el valor por defecto", 0.35, "avanzado", 4, (0.72, 0.58)),
    Beat("pero si tu equipo va justo, bajalo", 2.6, "avanzado", 4, (0.72, 0.58), stress="bajalo"),

    Beat("por ultimo guardamos los cambios", 0.4, "guardar", 5, (0.82, 0.86)),
    Beat("y ya esta, con esto queda configurado", 0.3, "guardar", 5, (0.82, 0.86), stress="configurado"),
    Beat("nos vemos en el siguiente video", 1.2, "guardar", None, (0.5, 0.5)),
)

#: Variantes de frase para alargar el guion sin que se repita palabra por
#: palabra. Un guion repetido literalmente falsea el analisis: el TF-IDF del
#: b-roll, los capitulos y la deteccion de planos veian exactamente el mismo
#: patron una y otra vez.
_VARIANTES: tuple[tuple[str, float, str, int | None, tuple[float, float]], ...] = (
    ("vamos con la siguiente parte de la configuracion", 0.4, "menu", 2, (0.12, 0.52)),
    ("mira, esta opcion es la que mas gente se salta", 0.35, "ajustes", 3, (0.66, 0.42)),
    ("eh, aqui hay que tener cuidado con el orden", 0.4, "ajustes", 3, (0.72, 0.46)),
    ("si lo pones al reves no te va a funcionar", 2.3, "ajustes", 3, (0.72, 0.46)),
    ("ahora abrimos el apartado de memoria", 0.4, "avanzado", 4, (0.62, 0.58)),
    ("este valor depende mucho de tu equipo", 0.35, "avanzado", 4, (0.68, 0.6)),
    ("yo en mi caso lo tengo bastante bajo", 0.3, "avanzado", 4, (0.72, 0.58)),
    ("mmm, y con eso ya deberia arrancar bien", 2.5, "avanzado", 4, (0.72, 0.58)),
    ("vale, siguiente punto, los proyectos", 0.4, "inicio", 1, (0.12, 0.42)),
    ("cada proyecto guarda su propia configuracion", 0.35, "inicio", 1, (0.4, 0.5)),
    ("eso es util si trabajas con varios a la vez", 0.3, "inicio", 1, (0.4, 0.55)),
    ("pero ojo, no se sincroniza solo", 2.4, "inicio", 1, (0.4, 0.55)),
    ("por aqui esta el boton de guardar", 0.4, "guardar", 5, (0.82, 0.86)),
    ("acuerdate de darle antes de cerrar", 0.35, "guardar", 5, (0.82, 0.86)),
    ("que si no pierdes todo lo que has tocado", 2.6, "guardar", 5, (0.82, 0.86)),
)


def long_guide_script(minutes: float) -> tuple[Beat, ...]:
    """Un guion de la duracion que se pida, con la misma forma que el corto.

    Sirve para probar el caso de uso real (guias de ~20 minutos) en vez de
    extrapolar desde un minuto. Mantiene la proporcion de pausas cortas y
    largas, los cambios de pantalla y las muletillas, y va rotando las frases
    para que el contenido no sea identico cada vuelta.
    """
    objetivo = minutes * 60.0
    guion: list[Beat] = list(GUIDE_SCRIPT)
    i = 0
    while build_timing(tuple(guion)).duration < objetivo:
        texto, pausa, pantalla, resalte, cursor = _VARIANTES[i % len(_VARIANTES)]
        # Cada vuelta cambia un poco el numero para que no salgan dos frases
        # exactamente iguales en todo el video.
        vuelta = i // len(_VARIANTES)
        if vuelta:
            texto = f"{texto} del apartado {vuelta + 1}"
        guion.append(Beat(texto, pausa, pantalla, resalte, cursor))
        i += 1
    return tuple(guion)


#: Elementos del menu lateral de la aplicacion falsa.
MENU = ("Inicio", "Proyectos", "Ajustes", "Configuracion avanzada", "Memoria", "Guardar")

#: Titulo de cada pantalla.
PANTALLAS = {
    "inicio": "Panel principal",
    "menu": "Ajustes",
    "ajustes": "Ajustes / General",
    "avanzado": "Ajustes / Avanzado",
    "guardar": "Ajustes / Guardar cambios",
}


# ---------------------------------------------------------------------------
# Tiempos
# ---------------------------------------------------------------------------


@dataclass
class TimedWord:
    text: str
    start: float
    end: float


@dataclass
class Timing:
    """Cuando se dice cada palabra y cuando esta en pantalla cada cosa."""

    words: list[TimedWord] = field(default_factory=list)
    #: (inicio, fin, beat) de cada frase
    phrases: list[tuple[float, float, Beat]] = field(default_factory=list)
    duration: float = 0.0


#: Duracion de una silaba. El habla real ronda las 4-6 por segundo.
SYLLABLE_SECONDS = 0.19
#: Separacion entre palabras dentro de una frase.
WORD_GAP = 0.055


def _syllables(word: str) -> int:
    """Cuenta silabas aproximadas contando grupos de vocales."""
    vocales = "aeiouáéíóúü"
    grupos = 0
    anterior_vocal = False
    for c in word.lower():
        es_vocal = c in vocales
        if es_vocal and not anterior_vocal:
            grupos += 1
        anterior_vocal = es_vocal
    return max(1, grupos)


def build_timing(script: tuple[Beat, ...] = GUIDE_SCRIPT) -> Timing:
    """Reparte el guion en el tiempo, palabra a palabra."""
    timing = Timing()
    t = 0.6  # un respiro antes de empezar a hablar

    for beat in script:
        inicio_frase = t
        for palabra in beat.text.replace(",", "").split():
            duracion = _syllables(palabra) * SYLLABLE_SECONDS
            timing.words.append(TimedWord(palabra, round(t, 3), round(t + duracion, 3)))
            t += duracion + WORD_GAP
        t -= WORD_GAP
        timing.phrases.append((round(inicio_frase, 3), round(t, 3), beat))
        t += beat.pause

    timing.duration = round(t + 0.8, 3)
    return timing


# ---------------------------------------------------------------------------
# Audio
# ---------------------------------------------------------------------------

#: Frecuencia fundamental de la voz sintetica.
F0 = 118.0
#: Formantes aproximados de una vocal neutra.
FORMANTES = ((620.0, 1.0), (1180.0, 0.55), (2600.0, 0.22))
#: Cuanto se levanta una palabra acentuada, en dB. Seis es un acento claro de
#: habla normal: se oye sin que parezca un grito.
STRESS_DB = 6.0
STRESS_GAIN = 10.0 ** (STRESS_DB / 20.0)

#: Nivel del ruido de sala en los silencios. Bajo pero no cero: en una grabacion
#: real nunca hay silencio digital, y el detector tiene que distinguirlo igual.
ROOM_TONE = 0.0018

# Lo de abajo es lo que separa un audio sintetico de uno creible, y sin ello los
# problemas de calidad no se pueden ni medir: un tono limpio no tiene retumbe
# que filtrar, no tiene sibilancia que domar y no cambia de nivel.

#: Retumbe de sala: aire acondicionado, trafico, la mesa. Vive por debajo de los
#: 80 Hz, no aporta nada a la voz y es lo primero que quita cualquier editor.
#: El nivel esta puesto para quedar unos 25 dB por debajo de la voz, que es lo
#: tipico de una grabacion casera decente. Subirlo mas no es "mas realista":
#: es una grabacion mala, y entonces ya no se distingue el silencio del habla.
RUMBLE_LEVEL = 0.006
#: Corte del filtrado del retumbe. Es ruido de banda baja, no tonos: tres
#: sinusoides de frecuencia entera se realinean una vez por segundo y producen
#: un pico periodico que no existe en ninguna sala real.
RUMBLE_CUTOFF_HZ = 90.0
#: Zumbido de red electrica, que se cuela por cables mal apantallados.
HUM_HZ = 50.0
HUM_LEVEL = 0.002
#: Cuanto varia el nivel entre frases, en dB. Una persona se acerca y se aleja
#: del microfono sin darse cuenta.
LEVEL_DRIFT_DB = 5.0
#: Sibilancia: el golpe de aire de las eses, centrado en 6-8 kHz. Es lo que
#: molesta en unos auriculares y lo que quita un de-esser.
SIBILANCE_LEVEL = 0.05
#: Respiracion antes de arrancar a hablar.
BREATH_LEVEL = 0.02
BREATH_SECONDS = 0.22


def _rumble(n: int, sample_rate: int, rng) -> np.ndarray:
    """Retumbe de sala y zumbido de red: todo por debajo de la voz.

    Es ruido pasado por un paso-bajo, no una suma de tonos: el aire
    acondicionado y el trafico son ruido de banda ancha con la energia abajo.
    """
    # Media movil larga = paso-bajo de primer orden. Con esta ventana el corte
    # cae cerca de RUMBLE_CUTOFF_HZ.
    ventana = max(3, int(sample_rate / RUMBLE_CUTOFF_HZ))
    ruido = rng.standard_normal(n + ventana).astype(np.float32)
    grave = np.convolve(ruido, np.ones(ventana, np.float32) / ventana, "same")[:n]

    # Se normaliza porque promediar reduce mucho la amplitud del ruido.
    pico = float(np.abs(grave).max()) or 1.0
    senal = (grave / pico * RUMBLE_LEVEL).astype(np.float32)

    t = np.arange(n, dtype=np.float32) / sample_rate
    senal += HUM_LEVEL * np.sin(2 * np.pi * HUM_HZ * t)
    return senal.astype(np.float32)


#: Ancho de la media movil que define el paso-alto de la sibilancia. Con 5
#: muestras a 48 kHz el corte queda cerca de los 5 kHz.
_SIBILANCE_TAPS = 5


def _sibilance(n: int, sample_rate: int, rng) -> np.ndarray:
    """Ruido agudo de una "s", solo por encima de ~5 kHz.

    Se obtiene restandole al ruido blanco su propia media movil, que es un
    paso-alto de primer orden. Modular el ruido con una sinusoide no vale:
    reparte energia por todo el espectro y lo que sale es siseo de banda ancha,
    no sibilancia.
    """
    ruido = rng.standard_normal(n + _SIBILANCE_TAPS).astype(np.float32)
    suave = np.convolve(ruido, np.ones(_SIBILANCE_TAPS, np.float32) / _SIBILANCE_TAPS, "same")
    return (ruido - suave)[:n].astype(np.float32)


def _stressed_words(timing: Timing) -> list:
    """Las palabras que el guion marca como acentuadas, ya situadas en el tiempo.

    Es la **verdad conocida** del generador: aqui sabemos exactamente que
    palabras se dijeron mas altas, asi que se puede comprobar que la deteccion
    de enfasis encuentra esas y no otras.
    """
    salida = []
    for inicio, fin, beat in timing.phrases:
        if not beat.stress:
            continue
        objetivo = beat.stress.lower()
        for w in timing.words:
            if inicio <= w.start <= fin and w.text.lower().strip(",.") == objetivo:
                salida.append(w)
                break
    return salida


def demo_stressed_words(timing: Timing) -> list[tuple[str, float, float]]:
    """(palabra, inicio, fin) de lo que el guion dice mas alto."""
    return [(w.text, w.start, w.end) for w in _stressed_words(timing)]


def synth_speech(timing: Timing, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Sintetiza audio con la forma **y los defectos** del habla grabada.

    No pretende sonar a persona. Pretende tener la misma estructura temporal que
    una voz real (donde hay energia, donde no, cuanto duran las pausas) **y sus
    problemas tipicos**: retumbe de sala, zumbido de red, sibilancia en las eses,
    respiraciones y un nivel que sube y baja entre frases.

    Esa segunda parte no es decorativa. Sin ella no se puede comprobar que el
    filtrado de graves, el de-esser o la compresion sirvan de algo: sobre un
    tono limpio no hay nada que arreglar.
    """
    n = int(timing.duration * sample_rate)
    rng = np.random.default_rng(11)
    senal = rng.standard_normal(n).astype(np.float32) * ROOM_TONE
    senal += _rumble(n, sample_rate, rng)

    # Nivel por frase: la persona se acerca y se aleja del microfono.
    ganancia_frase: dict[int, float] = {}
    for indice, (inicio, fin, _beat) in enumerate(timing.phrases):
        db = rng.uniform(-LEVEL_DRIFT_DB, LEVEL_DRIFT_DB)
        ganancia_frase[indice] = float(10.0 ** (db / 20.0))

        # Respiracion justo antes de arrancar.
        a = max(0, int((inicio - BREATH_SECONDS) * sample_rate))
        b = int(inicio * sample_rate)
        if b > a:
            largo = b - a
            aire = rng.standard_normal(largo).astype(np.float32)
            forma = np.sin(np.linspace(0, np.pi, largo, dtype=np.float32))
            senal[a:b] += aire * forma * BREATH_LEVEL

    def _gain_at(t: float) -> float:
        for indice, (inicio, fin, _b) in enumerate(timing.phrases):
            if inicio <= t <= fin:
                return ganancia_frase[indice]
        return 1.0

    acentuadas = {id(w) for w in _stressed_words(timing)}

    def _stress_at(palabra) -> float:
        return STRESS_GAIN if id(palabra) in acentuadas else 1.0

    for i, palabra in enumerate(timing.words):
        a = int(palabra.start * sample_rate)
        b = min(n, int(palabra.end * sample_rate))
        if b <= a:
            continue

        largo = b - a
        t = np.arange(largo, dtype=np.float32) / sample_rate

        # La entonacion baja un poco a lo largo de la palabra, como en el habla.
        f0 = F0 * (1.0 + 0.10 * np.exp(-t * 6.0)) * (0.94 + 0.12 * ((i * 37) % 7) / 7)
        fase = 2 * np.pi * np.cumsum(f0) / sample_rate

        onda = np.zeros(largo, dtype=np.float32)
        for armonico in range(1, 26):
            frecuencia = f0 * armonico
            # Se pondera cada armonico por lo cerca que esta de un formante.
            ganancia = 0.0
            for centro, peso in FORMANTES:
                ganancia += peso / (1.0 + ((frecuencia - centro) / 190.0) ** 2)
            onda += (ganancia / armonico) * np.sin(fase * armonico)

        # Envolvente por silabas: sube y baja dentro de la palabra.
        silabas = _syllables(palabra.text)
        ciclo = np.sin(np.pi * np.clip(t / (palabra.end - palabra.start) * silabas % 1.0, 0, 1))
        ataque = np.clip(t / 0.02, 0, 1)
        caida = np.clip(((palabra.end - palabra.start) - t) / 0.03, 0, 1)
        envolvente = (0.35 + 0.65 * ciclo) * ataque * caida

        ganancia = _gain_at(palabra.start) * _stress_at(palabra)
        senal[a:b] += (onda * envolvente * 0.09 * ganancia).astype(np.float32)

        # Sibilancia en las palabras con "s" o "c/z": justo donde molesta.
        if any(c in palabra.text.lower() for c in "sczx"):
            sib = _sibilance(largo, sample_rate, rng)
            # Se concentra al final de la palabra, como una "s" de cierre.
            perfil = np.clip((t / (palabra.end - palabra.start) - 0.55) / 0.45, 0, 1)
            senal[a:b] += (sib * perfil * SIBILANCE_LEVEL * ganancia).astype(np.float32)

    pico = float(np.max(np.abs(senal)))
    if pico > 0:
        senal = (senal / pico * 0.72).astype(np.float32)
    return senal


def write_wav(signal: np.ndarray, path: Path, sample_rate: int = SAMPLE_RATE) -> Path:
    import struct
    import wave

    path.parent.mkdir(parents=True, exist_ok=True)
    enteros = (np.clip(signal, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(sample_rate)
        fh.writeframes(struct.pack(f"<{len(enteros)}h", *enteros.tolist()))
    return path


# ---------------------------------------------------------------------------
# Video
# ---------------------------------------------------------------------------


def _beat_at(timing: Timing, t: float) -> Beat:
    """Que frase esta sonando (o acaba de sonar) en el instante t."""
    actual = timing.phrases[0][2]
    for inicio, _fin, beat in timing.phrases:
        if t >= inicio:
            actual = beat
        else:
            break
    return actual


def _ease(a: float, b: float, k: float) -> float:
    """Interpolacion suave: el cursor no salta, se desplaza."""
    return a + (b - a) * k


def _draw_frame(canvas, beat: Beat, cursor: tuple[float, float], t: float) -> None:
    """Dibuja un fotograma de la aplicacion falsa."""
    import cv2

    canvas[:] = FONDO

    # Barra superior con el titulo de la pantalla.
    cv2.rectangle(canvas, (0, 0), (WIDTH, 56), PANEL, -1)
    cv2.line(canvas, (0, 56), (WIDTH, 56), LINEA, 1)
    cv2.putText(canvas, PANTALLAS.get(beat.screen, ""), (28, 36),
                cv2.FONT_HERSHEY_SIMPLEX, 0.62, TEXTO, 1, cv2.LINE_AA)

    # Menu lateral.
    cv2.rectangle(canvas, (0, 56), (250, HEIGHT), PANEL, -1)
    cv2.line(canvas, (250, 56), (250, HEIGHT), LINEA, 1)
    for i, etiqueta in enumerate(MENU):
        y = 110 + i * 46
        resaltado = beat.highlight == i
        if resaltado:
            cv2.rectangle(canvas, (12, y - 24), (238, y + 12), (52, 60, 72), -1)
            cv2.rectangle(canvas, (12, y - 24), (16, y + 12), ACENTO, -1)
        cv2.putText(canvas, etiqueta[:22], (30, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.46,
                    TEXTO if resaltado else TENUE, 1, cv2.LINE_AA)

    # Panel de contenido, distinto en cada pantalla.
    x0, y0, x1, y1 = 286, 92, WIDTH - 40, HEIGHT - 40
    cv2.rectangle(canvas, (x0, y0), (x1, y1), PANEL, -1)
    cv2.rectangle(canvas, (x0, y0), (x1, y1), LINEA, 1)

    if beat.screen == "inicio":
        cv2.putText(canvas, "Bienvenido", (x0 + 32, y0 + 62),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, TEXTO, 2, cv2.LINE_AA)
        for i in range(3):
            cy = y0 + 130 + i * 92
            cv2.rectangle(canvas, (x0 + 32, cy), (x0 + 300, cy + 66), (38, 43, 51), -1)
            cv2.putText(canvas, f"Proyecto {i + 1}", (x0 + 48, cy + 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, TENUE, 1, cv2.LINE_AA)

    elif beat.screen == "menu":
        cv2.putText(canvas, "Elige una seccion", (x0 + 32, y0 + 56),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, TEXTO, 1, cv2.LINE_AA)
        for i, nombre in enumerate(("General", "Avanzado", "Memoria")):
            cy = y0 + 110 + i * 74
            cv2.rectangle(canvas, (x0 + 32, cy), (x1 - 40, cy + 54), (38, 43, 51), -1)
            cv2.putText(canvas, nombre, (x0 + 54, cy + 36),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, TENUE, 1, cv2.LINE_AA)

    elif beat.screen in ("ajustes", "avanzado"):
        titulo = "Opciones generales" if beat.screen == "ajustes" else "Opciones avanzadas"
        cv2.putText(canvas, titulo, (x0 + 32, y0 + 56),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, TEXTO, 1, cv2.LINE_AA)
        opciones = (
            ("Arranque automatico", True),
            ("Sincronizar en la nube", beat.screen == "ajustes"),
            ("Modo compatibilidad", False),
            ("Limite de memoria", beat.screen == "avanzado"),
        )
        for i, (nombre, activo) in enumerate(opciones):
            cy = y0 + 118 + i * 72
            cv2.putText(canvas, nombre, (x0 + 40, cy + 22),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, TENUE, 1, cv2.LINE_AA)
            # Interruptor.
            sx = x1 - 130
            cv2.rectangle(canvas, (sx, cy), (sx + 62, cy + 30),
                          ACENTO if activo else (60, 66, 76), -1)
            cv2.circle(canvas, (sx + (46 if activo else 16), cy + 15), 11, (245, 248, 252), -1)

    else:  # guardar
        cv2.putText(canvas, "Guardar cambios", (x0 + 32, y0 + 56),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, TEXTO, 1, cv2.LINE_AA)
        cv2.putText(canvas, "Se aplicaran 3 cambios", (x0 + 32, y0 + 104),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, TENUE, 1, cv2.LINE_AA)
        bx, by = x1 - 190, y1 - 78
        cv2.rectangle(canvas, (bx, by), (bx + 150, by + 46), VERDE, -1)
        cv2.putText(canvas, "Guardar", (bx + 34, by + 31),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (20, 24, 28), 1, cv2.LINE_AA)

    # Cursor: puntero con sombra, para que se distinga del fondo.
    cx, cy = int(cursor[0] * WIDTH), int(cursor[1] * HEIGHT)
    puntero = np.array([[cx, cy], [cx, cy + 20], [cx + 6, cy + 15],
                        [cx + 11, cy + 24], [cx + 15, cy + 22],
                        [cx + 10, cy + 13], [cx + 17, cy + 12]], np.int32)
    cv2.fillPoly(canvas, [puntero + 2], (0, 0, 0))
    cv2.fillPoly(canvas, [puntero], (250, 250, 250))


def render_screen_recording(
    timing: Timing, out: Path, settings: Settings, *, fps: int = FPS
) -> Path:
    """Genera el video de la aplicacion falsa, sin audio."""
    import cv2

    out.parent.mkdir(parents=True, exist_ok=True)
    total = int(timing.duration * fps)

    cmd = [
        str(ffmpeg_bin(settings)), "-hide_banner", "-loglevel", "error", "-y", "-nostdin",
        "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{WIDTH}x{HEIGHT}", "-r", str(fps), "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", str(out),
    ]
    proceso = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proceso.stdin is not None

    canvas = np.zeros((HEIGHT, WIDTH, 3), np.uint8)
    cursor = [0.5, 0.5]

    try:
        for i in range(total):
            t = i / fps
            beat = _beat_at(timing, t)
            # El cursor persigue su objetivo con suavizado: da movimiento real
            # sin saltos, que es lo que distingue una grabacion de una diapositiva.
            cursor[0] = _ease(cursor[0], beat.cursor[0], 0.06)
            cursor[1] = _ease(cursor[1], beat.cursor[1], 0.06)
            _draw_frame(canvas, beat, (cursor[0], cursor[1]), t)
            proceso.stdin.write(canvas.tobytes())
    finally:
        proceso.stdin.close()
        proceso.wait()

    return out


def build_demo_video(
    out: Path, settings: Settings | None = None, *, minutes: float | None = None
) -> tuple[Path, Timing]:
    """Genera la guia completa con imagen y sonido.

    Con `minutes` produce una guia de esa duracion, para probar el formato largo
    de verdad en vez de extrapolar desde un minuto.
    """
    settings = settings or Settings.load()
    out = Path(out).expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)

    timing = build_timing(long_guide_script(minutes) if minutes else GUIDE_SCRIPT)
    temporal = out.parent / f".{out.stem}-tmp"
    temporal.mkdir(exist_ok=True)

    video = render_screen_recording(timing, temporal / "video.mp4", settings)
    audio = write_wav(synth_speech(timing), temporal / "audio.wav")

    run([
        ffmpeg_bin(settings), "-hide_banner", "-loglevel", "error", "-y", "-nostdin",
        "-i", video, "-i", audio,
        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", out,
    ], timeout=600)

    for f in temporal.iterdir():
        f.unlink()
    temporal.rmdir()
    return out, timing


def demo_transcript(timing: Timing):
    """La transcripcion exacta del guion.

    Permite probar todo el montaje sin modelo de voz instalado, y ademas da un
    listón: si con la transcripcion perfecta el montaje no queda bien, el
    problema no es el reconocimiento de voz.
    """
    from .analysis.types import Transcript, TranscriptSegment, Word

    segmentos = []
    for inicio, fin, beat in timing.phrases:
        palabras = [
            Word(start=w.start, end=w.end, text=w.text)
            for w in timing.words
            if inicio <= w.start <= fin
        ]
        if palabras:
            segmentos.append(
                TranscriptSegment(start=inicio, end=fin, text=beat.text, words=palabras)
            )
    return Transcript(language="es", segments=segmentos, model="guion-de-la-demo")


#: Cada cuanto se "leeria" la pantalla, igual que hace el OCR de verdad.
OCR_SAMPLE_SECONDS = 3.0
#: Alto aproximado de una linea de texto del menu, en pixeles.
_MENU_LINE_HEIGHT = 18
#: Ancho aproximado por caracter con la fuente y escala que usa `_draw_frame`.
_MENU_CHAR_WIDTH = 9.2


def demo_screen_text(timing: Timing):
    """Lo que un OCR leeria en el menu lateral, con su posicion.

    Es la verdad conocida del generador, no una lectura: aqui sabemos
    exactamente que texto se dibujo y donde. Sirve para ejercitar de punta a
    punta lo que depende del OCR (los recuadros que senalan lo que se nombra)
    sin necesidad de tener Tesseract instalado, y para que al comparar con una
    lectura real se vea cuanto pierde el OCR y no cuanto pierde el montaje.

    Las cajas salen de las mismas constantes con las que `_draw_frame` pinta el
    menu, asi que si se mueve el menu, se mueven con el.
    """
    from .analysis.ocr import ScreenText, WordBox

    lecturas = []
    t = OCR_SAMPLE_SECONDS / 2
    while t < timing.duration:
        cajas: list[WordBox] = []
        for i, etiqueta in enumerate(MENU):
            linea = etiqueta[:22]
            base_y = 110 + i * 46
            x = 30.0
            for palabra in linea.split():
                ancho = len(palabra) * _MENU_CHAR_WIDTH
                cajas.append(
                    WordBox(
                        text=palabra,
                        x=round(x / WIDTH, 4),
                        y=round((base_y - _MENU_LINE_HEIGHT + 4) / HEIGHT, 4),
                        w=round(ancho / WIDTH, 4),
                        h=round(_MENU_LINE_HEIGHT / HEIGHT, 4),
                    )
                )
                x += ancho + _MENU_CHAR_WIDTH
        lecturas.append(
            ScreenText(at=round(t, 3), words=[c.text for c in cajas], boxes=cajas)
        )
        t += OCR_SAMPLE_SECONDS
    return lecturas

"""Una guia de Palworld, con el contenido de guias de verdad.

Todo lo que se prueba aqui se probaba sobre una **grabacion de pantalla de una
aplicacion**: fondo oscuro y quieto, menu lateral, texto plano, un cursor. Una
captura de gameplay no se parece en nada a eso:

- la camara **no para de moverse**, asi que la regla de "no hagas zoom si la
  imagen ya se mueve" pasa de no dispararse nunca a dispararse siempre;
- no hay cursor, hay una **retícula** en el centro;
- el texto no es texto plano sobre gris: es un **HUD** con contorno sobre un
  fondo que cambia;
- y el vocabulario es otro, que es lo que decide si el analisis entiende de que
  va el video.

El guion sale de guias publicadas de Palworld, no de mi cabeza: los nombres de
los objetos, los edificios, los materiales, las rutas y los numeros son los del
juego. Eso importa porque lo que se mide es si el analisis **reconoce de que se
habla**, y un vocabulario inventado no prueba nada.

Terminos y datos tomados de las guias consultadas: la Estacion de Expediciones
pide nivel 15 del arbol de tecnologia y 20 de madera, 20 de piedra y 5
fragmentos de paldium; sus rutas son Bosque (30 min), Desierto (45 min),
Sakurajima, Feybreak, Sky Island y World Tree, y cada una pide elementos
(fuego, agua, planta, electrico); la recompensa estrella es el melocoton de
afinidad. La Caja de Pals define el radio de trabajo de la base y admite cinco
companeros activos. Las Esferas de Pal se desbloquean en el menu de Tecnologia y
se fabrican en el Banco de Trabajo Primitivo con fragmentos de paldium, que
salen de las rocas azules picandolas con un pico. Y hay que cuidar la cordura de
los Pals para que la base no se pare.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .config import Settings
from .demo import HEIGHT, WIDTH, Beat, Guide, build_demo_video

# ---------------------------------------------------------------------------
# El guion
# ---------------------------------------------------------------------------

#: Tres temas, como una guia de verdad: montar la base, las expediciones y
#: capturar. Con sus muletillas, un aviso, una espera anunciada --- una
#: expedicion tarda media hora, y eso en el video es tiempo muerto --- y una
#: vuelta atras ("como vimos antes"), que son las cuatro cosas que el analisis
#: tiene que reconocer en lo que se dice.
PALWORLD_SCRIPT: tuple[Beat, ...] = (
    # -- la base ----------------------------------------------------------
    Beat("hola, en este video montamos la base de cero", 0.5, "base", None, (0.5, 0.5), stress="base", section="base"),
    Beat("lo primero de todo es colocar la caja de pals", 0.4, "base", 0, (0.34, 0.52), section="base"),
    Beat("eh, la caja de pals define el radio de trabajo de tus criaturas", 0.4, "base", 0, (0.34, 0.52), stress="radio", section="base"),
    Beat("ojo con esto, si la pones en una cuesta no te cabe nada", 1.9, "base", None, (0.5, 0.55), stress="cuesta", section="base"),
    Beat("aqui arriba a la derecha tienes el nivel de la base", 0.4, "base", None, (0.86, 0.12), section="base"),
    Beat("y ahora construimos el banco de trabajo primitivo", 0.4, "banco", 1, (0.28, 0.6), section="base"),
    Beat("con el banco desbloqueas la esfera de pal en el menu de tecnologia", 2.3, "banco", 1, (0.28, 0.6), stress="tecnologia", section="base"),

    # -- las expediciones -------------------------------------------------
    Beat("vamos con la estacion de expediciones, que es lo que nadie explica", 0.5, "expediciones", 2, (0.3, 0.3), stress="expediciones", section="expediciones"),
    Beat("necesitas nivel quince en el arbol de tecnologia para desbloquearla", 0.4, "expediciones", 2, (0.3, 0.3), section="expediciones"),
    Beat("cuesta veinte de madera, veinte de piedra y cinco fragmentos de paldium", 0.4, "expediciones", 2, (0.3, 0.38), stress="paldium", section="expediciones"),
    Beat("pulsa en la estacion y se abre el menu de rutas", 0.4, "rutas", 3, (0.62, 0.34), section="expediciones"),
    Beat("cada ruta pide elementos distintos, fuego agua planta o electrico", 0.4, "rutas", 3, (0.62, 0.42), section="expediciones"),
    Beat("mmm, y ojo, los pals de expedicion no trabajan en la base", 1.8, "rutas", 3, (0.62, 0.42), stress="trabajan", section="expediciones"),
    Beat("la ruta del bosque tarda treinta minutos asi que espera", 40.0, "espera", None, (0.5, 0.5), stress="treinta", section="expediciones"),
    Beat("ya volvio el escuadron con el melocoton de afinidad", 2.2, "rutas", 3, (0.62, 0.5), section="expediciones"),

    # -- capturar ---------------------------------------------------------
    Beat("por ultimo capturar pals, que es como se sube de nivel", 0.5, "captura", 4, (0.5, 0.45), stress="capturar", section="capturas"),
    Beat("capturar un pal da mas experiencia que derrotarlo", 0.4, "captura", 4, (0.5, 0.45), stress="experiencia", section="capturas"),
    Beat("como vimos antes, las esferas se fabrican con fragmentos de paldium", 0.4, "captura", 4, (0.5, 0.5), section="capturas"),
    Beat("al apuntar con la esfera te sale aqui la probabilidad de captura", 0.4, "captura", 4, (0.56, 0.6), stress="probabilidad", section="capturas"),
    Beat("y con eso terminamos la guia, nos vemos en el siguiente", 1.2, "captura", None, (0.5, 0.5), section="capturas"),
)

#: Frases para alargar cada tema **por dentro**. Llevan su seccion detras, que
#: es lo que permite que una guia de veinte minutos siga teniendo tres temas de
#: seis minutos en vez de dos minutos y un tema de dieciocho.
PALWORLD_VARIANTS = (
    ("la cordura de los pals baja si no descansan", 0.4, "base", 0, (0.34, 0.5), "base"),
    ("por eso conviene ponerles una cama cerca del taller", 0.4, "base", 1, (0.3, 0.58), "base"),
    ("y colocar la base cerca de un rio para el agua", 2.0, "base", None, (0.6, 0.6), "base"),
    ("las rocas azules de paldium salen junto a los lagos", 0.4, "banco", 1, (0.4, 0.62), "base"),
    ("se pican con el pico que craftas en la mesa primitiva", 2.1, "banco", 1, (0.28, 0.6), "base"),
    ("puedes llevar cinco companeros activos y el resto a la caja", 2.0, "base", 0, (0.34, 0.52), "base"),
    ("las rutas largas dan mas oro pero tardan una hora", 0.4, "rutas", 3, (0.62, 0.4), "expediciones"),
    ("la de sakurajima y la de world tree son de las mejores", 0.4, "rutas", 3, (0.62, 0.46), "expediciones"),
    ("asigna de cuatro a seis pals a cada escuadron", 2.2, "rutas", 3, (0.62, 0.5), "expediciones"),
    ("la de desierto tarda cuarenta y cinco minutos", 0.4, "expediciones", 2, (0.3, 0.34), "expediciones"),
    ("y saca a esos pals de la automatizacion de la base", 2.0, "expediciones", 2, (0.3, 0.42), "expediciones"),
    ("el melocoton de afinidad sirve para la crianza", 2.1, "rutas", 3, (0.62, 0.5), "expediciones"),
    ("las doce primeras capturas de cada especie dan bonus", 0.4, "captura", 4, (0.5, 0.48), "capturas"),
    ("si le bajas la vida primero la probabilidad sube", 0.4, "captura", 4, (0.56, 0.58), "capturas"),
    ("y tambien se pueden capturar humanos, aunque no deberias", 2.2, "captura", 4, (0.5, 0.52), "capturas"),
)

# ---------------------------------------------------------------------------
# Lo que se ve
# ---------------------------------------------------------------------------

#: Cielo y suelo de cada zona, en BGR. Un gameplay no es gris: cada sitio tiene
#: su paleta, y eso es lo que hace que el detector de planos vea los cambios.
ZONAS = {
    "base":          ((188, 150, 96), (74, 116, 62)),
    "banco":         ((188, 150, 96), (74, 116, 62)),
    "expediciones":  ((150, 132, 120), (70, 96, 74)),
    "rutas":         ((150, 132, 120), (70, 96, 74)),
    "espera":        ((120, 112, 130), (58, 78, 66)),
    "captura":       ((210, 178, 130), (62, 104, 58)),
}

#: El HUD: (x, y, texto, tamano, color). Son las mismas coordenadas con las que
#: se pinta, asi que la "verdad" del OCR no puede desviarse del dibujo.
HUD_FIJO = (
    (28, 34, "Nivel 22", 0.52, (240, 244, 248)),
    (28, 62, "Salud 340", 0.44, (210, 230, 240)),
    (28, 86, "Hambre 78", 0.44, (210, 230, 240)),
    (1060, 34, "Base nivel 12", 0.48, (240, 244, 248)),
    (1060, 60, "Pals 18 de 20", 0.44, (210, 230, 240)),
)

#: Y el panel de cada pantalla, que es donde esta el contenido del que se habla.
HUD_PANTALLA = {
    "base": (
        (380, 330, "Caja de Pals", 0.66, (255, 236, 190)),
        (380, 368, "Radio de trabajo", 0.48, (226, 232, 240)),
        (380, 398, "Cordura media 72", 0.46, (226, 232, 240)),
    ),
    "banco": (
        (300, 400, "Banco de Trabajo Primitivo", 0.6, (255, 236, 190)),
        (300, 436, "Esfera de Pal", 0.5, (226, 232, 240)),
        (300, 464, "Fragmentos de paldium 24", 0.46, (226, 232, 240)),
    ),
    "expediciones": (
        (300, 210, "Estacion de Expediciones", 0.62, (255, 236, 190)),
        (300, 248, "Nivel 15 de tecnologia", 0.48, (226, 232, 240)),
        (300, 278, "Madera 20  Piedra 20", 0.46, (226, 232, 240)),
        (300, 306, "Fragmentos de paldium 5", 0.46, (226, 232, 240)),
    ),
    "rutas": (
        (700, 250, "Rutas de expedicion", 0.6, (255, 236, 190)),
        (700, 290, "Bosque 30 min  Planta", 0.46, (226, 232, 240)),
        (700, 318, "Desierto 45 min  Fuego", 0.46, (226, 232, 240)),
        (700, 346, "Sakurajima 1 h  Agua", 0.46, (226, 232, 240)),
        (700, 374, "World Tree 1 h  Electrico", 0.46, (226, 232, 240)),
        (700, 410, "Melocoton de afinidad", 0.48, (190, 240, 210)),
    ),
    "espera": (
        (520, 340, "Expedicion en curso", 0.6, (255, 236, 190)),
        (520, 378, "Bosque  quedan 28 min", 0.48, (226, 232, 240)),
    ),
    "captura": (
        (600, 400, "Probabilidad de captura", 0.56, (255, 236, 190)),
        (600, 436, "62 por ciento", 0.5, (190, 240, 210)),
        (600, 464, "Esferas de Pal 9", 0.46, (226, 232, 240)),
    ),
}

#: Barra de objetos de abajo, que en un gameplay esta siempre.
BARRA = ("Esfera de Pal", "Pico", "Hacha", "Arco", "Pan")

#: Ancho aproximado por caracter por unidad de escala de fuente, con la fuente
#: de OpenCV. Sale de la misma constante con la que se pinta.
CHAR_W = 17.6
LINE_H = 22.0


def _texto(canvas, x, y, texto, escala, color) -> None:
    """Texto con contorno, como un HUD de juego. El contorno es el motivo de
    que leer un HUD sea mas dificil que leer texto plano."""
    import cv2

    cv2.putText(canvas, texto, (x, y), cv2.FONT_HERSHEY_SIMPLEX, escala,
                (12, 14, 18), 4, cv2.LINE_AA)
    cv2.putText(canvas, texto, (x, y), cv2.FONT_HERSHEY_SIMPLEX, escala,
                color, 1, cv2.LINE_AA)


def paint_palworld(canvas, beat: Beat, cursor: tuple[float, float], t: float) -> None:
    """Un fotograma de gameplay: mundo que se mueve, pals y HUD."""
    import cv2

    cielo, suelo = ZONAS.get(beat.screen, ZONAS["base"])

    # Cielo en degradado.
    alto_cielo = int(HEIGHT * 0.52)
    grad = np.linspace(0.75, 1.15, alto_cielo).reshape(-1, 1, 1)
    canvas[:alto_cielo] = np.clip(np.array(cielo, np.float32) * grad, 0, 255).astype(np.uint8)
    canvas[alto_cielo:] = suelo

    # La camara se mueve: es lo que distingue un gameplay de una diapositiva, y
    # lo que hace que la regla de "no zoom sobre movimiento" tenga sentido.
    paneo = int(np.sin(t / 3.5) * 90)

    # Colinas al fondo y arboles, que dan flujo optico de verdad.
    for i, (dx, alto, tono) in enumerate(((0, 70, 0.82), (420, 110, 0.9), (880, 85, 0.86))):
        cx = (dx - paneo * (1 + i * 0.4)) % (WIDTH + 400) - 200
        color = tuple(int(c * tono) for c in suelo)
        cv2.ellipse(canvas, (int(cx), alto_cielo), (260, alto), 0, 180, 360, color, -1)
    for i in range(9):
        cx = int((i * 150 - paneo * 1.8) % (WIDTH + 200) - 100)
        cy = alto_cielo + 40 + (i % 3) * 55
        cv2.rectangle(canvas, (cx, cy), (cx + 10, cy + 46), (38, 52, 40), -1)
        cv2.circle(canvas, (cx + 5, cy), 26, (44, 84, 48), -1)

    # Pals dando vueltas por la base.
    for i, color in enumerate(((120, 200, 250), (140, 250, 190), (230, 170, 250))):
        px = int(WIDTH * (0.3 + 0.2 * i) + np.sin(t / 2.0 + i) * 70) - paneo
        py = int(alto_cielo + 120 + np.cos(t / 2.4 + i) * 30)
        cv2.circle(canvas, (px, py), 26, color, -1)
        cv2.circle(canvas, (px - 9, py - 8), 4, (20, 20, 24), -1)
        cv2.circle(canvas, (px + 9, py - 8), 4, (20, 20, 24), -1)

    # Panel del sitio del que se habla, con su fondo translucido.
    lineas = HUD_PANTALLA.get(beat.screen, ())
    if lineas:
        xs = [x for x, _y, _txt, _e, _c in lineas]
        ys = [y for _x, y, _txt, _e, _c in lineas]
        anchos = [len(txt) * CHAR_W * e for _x, _y, txt, e, _c in lineas]
        x0, y0 = min(xs) - 22, min(ys) - 40
        x1, y1 = int(max(x + w for x, w in zip(xs, anchos))) + 22, max(ys) + 22
        recorte = canvas[max(0, y0):y1, max(0, x0):x1]
        if recorte.size:
            recorte[:] = (recorte * 0.35).astype(np.uint8)
        cv2.rectangle(canvas, (x0, y0), (x1, y1), (120, 150, 180), 1)
        for x, y, txt, escala, color in lineas:
            _texto(canvas, x, y, txt, escala, color)

    # HUD fijo.
    for x, y, txt, escala, color in HUD_FIJO:
        _texto(canvas, x, y, txt, escala, color)

    # Barra de objetos, con el hueco elegido resaltado.
    for i, nombre in enumerate(BARRA):
        bx = 300 + i * 140
        by = HEIGHT - 66
        elegido = beat.highlight == i
        cv2.rectangle(canvas, (bx, by), (bx + 128, by + 46),
                      (40, 46, 56) if not elegido else (70, 130, 200), -1)
        cv2.rectangle(canvas, (bx, by), (bx + 128, by + 46), (150, 170, 190), 1)
        _texto(canvas, bx + 8, by + 30, nombre[:13], 0.4, (235, 240, 246))

    # Minimapa arriba a la derecha.
    cv2.rectangle(canvas, (WIDTH - 170, 90), (WIDTH - 20, 240), (28, 34, 42), -1)
    cv2.rectangle(canvas, (WIDTH - 170, 90), (WIDTH - 20, 240), (150, 170, 190), 1)
    cv2.circle(canvas, (WIDTH - 95, 165), 5, (120, 220, 255), -1)

    # Reticula en el centro: en un juego no hay puntero del raton.
    cx, cy = WIDTH // 2, HEIGHT // 2
    cv2.line(canvas, (cx - 12, cy), (cx - 4, cy), (240, 244, 250), 2)
    cv2.line(canvas, (cx + 4, cy), (cx + 12, cy), (240, 244, 250), 2)
    cv2.line(canvas, (cx, cy - 12), (cx, cy - 4), (240, 244, 250), 2)
    cv2.line(canvas, (cx, cy + 4), (cx, cy + 12), (240, 244, 250), 2)


def palworld_hud(beat: Beat) -> list:
    """El texto que hay en pantalla en ese momento, con su caja.

    Sale de las mismas constantes con las que se pinta, palabra a palabra: es la
    verdad conocida, no una lectura. Sirve para probar de punta a punta lo que
    depende del OCR (los recuadros sobre lo que nombras, senalar por nombre)
    sobre vocabulario de Palworld de verdad.
    """
    from .analysis.ocr import WordBox

    cajas: list[WordBox] = []
    fuentes = list(HUD_FIJO) + list(HUD_PANTALLA.get(beat.screen, ()))
    for x, y, texto, escala, _color in fuentes:
        px = float(x)
        alto = LINE_H * escala / 0.5
        for palabra in texto.split():
            ancho = len(palabra) * CHAR_W * escala
            cajas.append(WordBox(
                text=palabra,
                x=round(px / WIDTH, 4),
                y=round((y - alto) / HEIGHT, 4),
                w=round(ancho / WIDTH, 4),
                h=round(alto / HEIGHT, 4),
            ))
            px += ancho + CHAR_W * escala

    for i, nombre in enumerate(BARRA):
        px = 300.0 + i * 140 + 8
        y = HEIGHT - 66 + 30
        for palabra in nombre[:13].split():
            ancho = len(palabra) * CHAR_W * 0.4
            cajas.append(WordBox(
                text=palabra,
                x=round(px / WIDTH, 4),
                y=round((y - LINE_H * 0.8) / HEIGHT, 4),
                w=round(ancho / WIDTH, 4),
                h=round(LINE_H * 0.8 / HEIGHT, 4),
            ))
            px += ancho + CHAR_W * 0.4

    return cajas


#: La guia de Palworld, lista para `build_demo_video(..., guide=PALWORLD_GUIDE)`.
PALWORLD_GUIDE = Guide(
    name="palworld",
    script=PALWORLD_SCRIPT,
    variants=PALWORLD_VARIANTS,
    paint=paint_palworld,
    hud=palworld_hud,
    # No hay puntero del raton en un gameplay: hay una reticula, y la pinta el
    # propio fotograma. Esto tambien deja el analisis del cursor sin senal, que
    # es lo que va a pasar con una captura de verdad.
    pointer=False,
)


def build_palworld_guide(
    out: Path | str, settings: Settings | None = None, *, minutes: float | None = None
):
    """Genera la guia de Palworld completa, con imagen y sonido."""
    return build_demo_video(out, settings, minutes=minutes, guide=PALWORLD_GUIDE)

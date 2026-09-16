"""Cajas de color con texto: las dos que el montaje necesita decir.

Aqui viven dos cosas de la misma familia -- una caja con texto colocada donde no
estorbe -- pero que contestan preguntas distintas:

- **el rotulo de seccion**, que dice *donde estas*;
- **el marcador de velocidad**, que dice *por que el video va de pronto a ocho
  veces la velocidad*.

El segundo no lo pidio nadie, y es el que mas falta hacia. El montaje acelera
las esperas que tu mismo anuncias -- dices "esto tarda un rato" y el minuto de
instalacion pasa a 8x, para que se vea la barra avanzar -- y **no lo decia en
ninguna parte**. Un video que se acelera sin avisar no se lee como una decision
de montaje, se lee como un fallo de reproduccion.

---

El rotulo que dice donde estas: caja de color con el nombre de la seccion.

La idea es la de television: un rectangulo con texto que te situa. Aqui el
texto no es una plantilla ni lo escribe nadie a mano -- sale de lo que el video
**esta tratando** en ese tramo.

Y ahi estaba el fallo de la primera version: usaba el titulo del capitulo tal
cual, que es una **frase**. Salian rotulos como "El siguiente paso es el
importante" o "Importante fijate boton", y un rotulo asi no situa a nadie: un
rotulo es un **nombre**. El ejemplo que hay que imitar tiene dos palabras
("Expediciones Palworld"), no cinco.

Un titulo de capitulo puede permitirse ser una frase porque se lee una vez, en
una lista, con su minuto delante. Un rotulo se lee de reojo mientras hablas.
Asi que el texto sale de `understand/topics.py::label`, que contesta "¿de que va
esto?" con los terminos que ese tramo usa y los demas no, en la forma en que los
dijiste -- y se corta a dos palabras.

Lo dificil de esto no es dibujarlo, es **no ponerlo**. Un rotulo mal puesto es
peor que ninguno, y hay tres formas facilisimas de ponerlo mal:

1. **Decir dos veces lo mismo.** Al empezar un capitulo ya sale su tarjeta con
   el titulo. Un rotulo ahi mismo diciendo lo mismo no informa, decora. Por eso
   el rotulo **no acompana al cambio, acompana a la seccion**: sale despues,
   cuando la tarjeta ya se ha ido, para quien llega a mitad y no sabe de que se
   esta hablando.
2. **Ponerlo donde no hace falta.** En una seccion de cuarenta segundos la
   tarjeta del principio basta y sobra: nadie se ha perdido todavia. El rotulo
   solo tiene sentido en secciones largas.
3. **Ponerlo encima de lo que estas ensenando.** La posicion no es fija: se
   elige como la de la ventanita de material (`plan/placement.py`), apartandose
   de lo que senalas, del puntero, de los subtitulos y de la zona llena.

Y por encima de todo eso pasa el mismo filtro que el resto del montaje: un
rotulo tiene que **justificarse** (`plan/restraint.py`). Un capitulo largo con
un titulo concreto lo justifica; uno que se llama "Parte 3" no.
"""

from __future__ import annotations

import re

from ..understand.meaning import stem as _stem
from ..understand.topics import label as topic_label
from .edl import EDL, LowerThirdEffect, Rect
from .placement import ScreenUse, corners, place

#: Verbos de accion que en una guia se dicen constantemente. Como **titulo de
#: capitulo** un verbo informa ("Guardamos los cambios"); como **rotulo** no:
#: un rotulo contesta "donde estas", y donde estas es un sitio, no algo que se
#: hace. Salian rotulos como "Abrimos ajustes" y "Casilla marcar", cuando lo
#: que situa es "Ajustes" y "Casilla".
#:
#: Es una lista escrita a mano a proposito: distinguir verbo de sustantivo por
#: la terminacion no se puede en castellano sin equivocarse mucho ("ajustes" y
#: "abrimos" acaban las dos en -es/-os, y "lugar" acaba en -ar sin ser verbo).
_ACCIONES = frozenset({
    "abre", "abrimos", "abrir", "abro", "activa", "activamos", "activar",
    "anade", "anadimos", "anadir", "busca", "buscamos", "buscar", "cambia",
    "cambiamos", "cambiar", "cierra", "cerramos", "cerrar", "comprueba",
    "comprobamos", "comprobar", "configura", "configuramos", "configurar",
    "copia", "copiamos", "copiar", "crea", "creamos", "crear", "dale", "damos",
    "elige", "elegimos", "elegir", "empezamos", "empezar", "escribe",
    "escribimos", "escribir", "guarda", "guardamos", "guardar", "hace",
    "hacemos", "hacer", "instala", "instalamos", "instalar", "marca",
    "marcamos", "marcar", "mira", "miramos", "mirar", "pon", "ponemos",
    "poner", "pulsa", "pulsamos", "pulsar", "quita", "quitamos", "quitar",
    "revisa", "revisamos", "revisar", "selecciona", "seleccionamos",
    "seleccionar", "termina", "terminamos", "terminar", "usa", "usamos",
    "usar", "vamos", "veamos", "vemos", "ver", "volvemos", "volver",
})

#: Cuantas palabras puede tener un rotulo. Es un nombre, no una frase: con dos
#: se lee de reojo, con cinco hay que pararse a leerlo y entonces ya no estas
#: mirando el video.
LABEL_WORDS = 2

#: Alto de la caja y ancho **por caracter**, en fracciones del fotograma. El
#: ancho no puede ser fijo: reservarle a "Firewall" el mismo hueco que a
#: "Expediciones Palworld" hace que la decision de donde ponerlo se tome con un
#: tamano que no es el suyo.
LABEL_HEIGHT = 0.075
LABEL_CHAR_WIDTH = 0.0165
LABEL_PADDING = 0.03
LABEL_MAX_WIDTH = 0.45

#: Que fraccion del montaje puede ocupar un capitulo y seguir siendo "una
#: seccion". Un rotulo de seccion contesta **en cual de ellas estas**; si solo
#: hay una, no contesta nada -- y encima el nombre sale mal, porque se calcula
#: contrastando lo que se dice ahi con lo que se dice en el resto, y no hay
#: resto: en una prueba de 12 minutos con un unico capitulo salia "Chrome base",
#: dos palabras de dos temas distintos.
MAX_PARTE_DEL_VIDEO = 0.7

#: Un titulo que es un numero de parte no orienta a nadie, y es lo que
#: `chapters.py` pone cuando no consigue sacar un nombre de lo que dices.
_NUMERADO = re.compile(r"\(\d+\)\s*$")
#: Una palabra de dos letras o menos no nombra nada ("de", "la", "ok").
MIN_LETRAS = 3
#: Con dos palabras por rotulo, compartir una es compartir la mitad, y dos
#: rotulos como "Paso importante" y "Siguiente paso" no anuncian dos cosas
#: distintas. Por eso el limite es "la mitad o mas", no "mas de la mitad".
#: Dos rotulos que comparten esta fraccion de palabras estan diciendo lo mismo
#: con otras palabras ("Seccion terminamos" y "Terminamos seccion"), y el
#: segundo no informa de ningun cambio. Se compara con **todos** los anteriores
#: y no solo con el ultimo: un rotulo repetido a los diez minutos sigue siendo
#: un rotulo repetido.
MAX_PARECIDO = 0.5


def _es_concreto(texto: str) -> bool:
    """Si eso nombra algo o es relleno.

    Se aplica al **nombre que se va a ver**, no al titulo del capitulo, y esa
    distincion importaba: el capitulo "De la impresora" no pasaba el filtro
    (una sola palabra de mas de dos letras) y su rotulo habria sido "Impresora
    bandeja", que esta perfectamente bien. Se estaba juzgando un texto y
    ensenando otro.
    """
    limpio = texto.strip()
    if not limpio or _NUMERADO.search(limpio):
        return False
    fuera = _muletillas_forma()
    return any(
        len(p) > MIN_LETRAS and _stem(p) not in fuera for p in limpio.split()
    )


def _muletillas_forma() -> frozenset[str]:
    """Las muletillas, en raiz. `topics.label` ya las quita por su cuenta; el
    respaldo por titulo tambien tiene que hacerlo o salen rotulos que ponen
    "Vale" o "Bueno"."""
    from ..understand.topics import _muletillas

    return _muletillas()


def _caja(texto: str) -> tuple[float, float]:
    """El hueco que ocupa ese texto, para decidir donde cabe."""
    ancho = min(LABEL_MAX_WIDTH, LABEL_PADDING + len(texto) * LABEL_CHAR_WIDTH)
    return round(ancho, 4), LABEL_HEIGHT


def _nombre(capitulo, inicio: float, fin: float, transcript, edl=None) -> str:
    """Como se llama esa seccion, en dos palabras.

    De lo que se dice **ahi** frente a lo que se dice en el resto del video: la
    palabra que solo sale aqui es el asunto de aqui. Si no se puede sacar (sin
    transcripcion, o un tramo sin nada distintivo), se cae al titulo del
    capitulo, que es lo que habia antes.

    Ojo con los dos relojes, que aqui ya mordio: los capitulos van en tiempo de
    **montaje** y las palabras de la transcripcion en tiempo del **original**.
    Compararlos directamente parece que funciona -- el primer capitulo empieza
    en cero en los dos -- y se estropea segun avanza el video, porque el
    montaje ha quitado por el camino un tercio del original. El sintoma era un
    rotulo con palabras de otra seccion: en una prueba, el capitulo de la
    impresora se titulaba "Imprime bloquea", y "bloquea" es del firewall.
    """
    if transcript is not None:
        def dentro(w) -> bool:
            t = edl.source_to_timeline(w.start) if edl is not None else w.start
            return t is not None and inicio <= t < fin

        propias = [w.text for w in transcript.words if dentro(w)]
        ajenas = [w.text for w in transcript.words if not dentro(w)]
        if propias:
            # Se piden mas de las que caben para poder tirar las acciones y que
            # aun queden nombres con los que titular.
            nombre = topic_label(
                [" ".join(propias)], [" ".join(ajenas)], LABEL_WORDS + 2
            )
            nombre = _solo_nombres(nombre)
            if nombre:
                return nombre[:1].upper() + nombre[1:]

    # Respaldo: el titulo del capitulo, recortado. Con dos guardas, porque
    # recortar pierde justo lo que delata un titulo malo: "Parte 3 (2)" se
    # queda en "Parte 3" y el marcador de repetido desaparece.
    if _NUMERADO.search(capitulo.title):
        return ""
    # Y se tiran las palabras que no nombran nada -- las muletillas y las de
    # tres letras o menos -- **antes** de recortar, o "De la impresora" se
    # queda en "De la".
    fuera = _muletillas_forma()
    palabras = [
        p for p in capitulo.title.split()
        if len(p) > MIN_LETRAS and _stem(p) not in fuera
    ]
    corto = " ".join(palabras[:LABEL_WORDS])
    return corto[:1].upper() + corto[1:] if corto else ""


def _solo_nombres(nombre: str) -> str:
    """Quita las acciones y deja lo que nombra algo.

    Si al quitarlas no queda nada, se devuelve lo que habia: mas vale un rotulo
    con un verbo que ningun rotulo, y hay secciones que de verdad van de hacer
    algo.
    """
    palabras = nombre.split()
    limpias = [p for p in palabras if p.lower() not in _ACCIONES][:LABEL_WORDS]
    return " ".join(limpias or palabras[:LABEL_WORDS])


def _se_parecen(a: str, b: str) -> bool:
    """Si dos rotulos dicen lo mismo con otras palabras."""
    from ..assets.coherence import tag_stems

    uno, otro = tag_stems(a.split()), tag_stems(b.split())
    if not uno or not otro:
        return False
    return len(uno & otro) / min(len(uno), len(otro)) >= MAX_PARECIDO


def _esquina_fija(nombre: str, ancho: float, alto: float) -> Rect | None:
    """La esquina que pide el estilo, si pide alguna.

    Cuando el estilo la fija, el rotulo **no se mueve**: que salga cada vez en
    un rincon distinto es lo que impide reconocerlo sin leerlo. Se pierde la
    posibilidad de esquivar lo que haya debajo, y esa es la decision.
    """
    nombre = (nombre or "").strip().lower()
    if not nombre:
        return None
    for etiqueta, rect in corners(ancho, alto):
        if etiqueta == nombre:
            return rect
    return None


def plan_labels(
    edl: EDL, style, screen: ScreenUse | None = None, transcript=None
) -> list[LowerThirdEffect]:
    """Un rotulo por seccion que lo merezca, y ninguno mas."""
    rules = style.labels
    if not rules.enabled or edl.duration <= 0:
        return []
    # Con un solo capitulo no hay secciones entre las que situarse.
    if len(edl.chapters) < 2:
        return []

    inicios = [c.start for c in edl.chapters] + [edl.duration]
    salida: list[LowerThirdEffect] = []

    for i, capitulo in enumerate(edl.chapters):
        largo = inicios[i + 1] - capitulo.start
        if largo < rules.min_chapter_seconds:
            continue
        if largo > edl.duration * MAX_PARTE_DEL_VIDEO:
            continue
        # El nombre sale de lo que se dice ahi, no del titulo del capitulo, y
        # es **el nombre** lo que tiene que nombrar algo: es lo que se ve.
        nombre = _nombre(capitulo, capitulo.start, inicios[i + 1], transcript, edl)
        if not _es_concreto(nombre):
            continue
        # Y no se repite nada de lo ya dicho, ni con otras palabras ni en otro
        # orden: un rotulo que no anuncia un cambio no hace falta.
        if any(_se_parecen(puesto.title, nombre) for puesto in salida):
            continue

        # Despues de la tarjeta, no encima: la tarjeta anuncia el cambio y el
        # rotulo recuerda donde estas.
        inicio = capitulo.start + style.chapters.card_seconds + rules.after_card
        fin = inicio + rules.seconds
        if fin > capitulo.start + largo - 1.0 or fin > edl.duration:
            continue

        ancho, alto = _caja(nombre)
        fija = _esquina_fija(getattr(rules, "corner", ""), ancho, alto)
        base = fija or Rect(x=0.05, y=0.08, w=ancho, h=alto)
        movida = ""
        if fija is None and screen is not None:
            origen_inicio = edl.timeline_to_source(inicio)
            origen_fin = edl.timeline_to_source(fin)
            # Lo que senalas no suprime el rotulo, lo aparta: en una guia
            # senalas constantemente, y el rotulo cabe en otra esquina. `busy`
            # ya trae esa caja, asi que `place` la esquiva sola.
            if origen_inicio is not None:
                base, movida = place(
                    base,
                    screen.busy(
                        origen_inicio, origen_fin or origen_inicio,
                        timeline=(inicio, fin),
                    ),
                    screen.grid(origen_inicio),
                )

        # Lo que aporta: cuanto mas larga la seccion, mas se agradece saber en
        # cual estas. Media hora de video sin una sola referencia se hace larga;
        # un capitulo de minuto y medio casi no la necesita.
        valor = min(0.72, 0.34 + largo / 600.0)

        salida.append(
            LowerThirdEffect(
                id=f"label{i:03d}",
                start=round(inicio, 3),
                end=round(fin, 3),
                title=nombre,
                rect=base,
                color=rules.color,
                value_score=round(valor, 3),
                cost_weight=0.30,
                rationale=(
                    f'rotulo "{nombre}" en {inicio:.0f}s: llevas '
                    f"{largo / 60:.0f} min hablando de eso"
                    + (f" · movido {movida} para no taparlo" if movida else "")
                ),
            )
        )

    return salida


# ---------------------------------------------------------------------------
# El marcador de velocidad
# ---------------------------------------------------------------------------

#: Tamano del marcador. Es una etiqueta de dos o tres caracteres ("x8"), asi
#: que no necesita mas.
SPEED_WIDTH = 0.09
SPEED_HEIGHT = 0.065
#: Por debajo de esto no es un avance rapido, es un ajuste de ritmo que no hay
#: que explicarle a nadie.
MIN_SPEED = 1.5
#: Y un tramo acelerado que dura un parpadeo tampoco necesita cartel.
MIN_SPEED_SECONDS = 0.8


def fast_ranges(edl: EDL) -> list[tuple[float, float, float]]:
    """Tramos del **montaje** que van acelerados, con su velocidad."""
    salida: list[tuple[float, float, float]] = []
    cursor = 0.0
    for clip in edl.timeline:
        if clip.speed >= MIN_SPEED and clip.duration >= MIN_SPEED_SECONDS:
            salida.append((cursor, cursor + clip.duration, clip.speed))
        cursor += clip.duration
    return salida


def plan_speed_tags(
    edl: EDL, style, screen: ScreenUse | None = None
) -> list[LowerThirdEffect]:
    """Un "x8" mientras el video va acelerado, y nada mas.

    Va **fijado** (`locked`) a proposito: no es un adorno que compita con los
    demas por el presupuesto del montaje, es la explicacion de algo que el
    montaje ya ha hecho. Quitarlo por carga dejaria el video acelerandose en
    silencio otra vez, que es justo el fallo que arregla.
    """
    salida: list[LowerThirdEffect] = []
    for i, (inicio, fin, velocidad) in enumerate(fast_ranges(edl)):
        # "x24.5" no dice nada que no diga "x24", y el decimal solo estorba.
        # Por debajo de 3x si distingue: 1.5x y 2x no se ven igual.
        texto = f"x{velocidad:.0f}" if velocidad >= 3 else f"x{velocidad:.1f}".rstrip("0").rstrip(".")

        base = Rect(x=0.86, y=0.08, w=SPEED_WIDTH, h=SPEED_HEIGHT)
        movida = ""
        if screen is not None:
            origen = edl.timeline_to_source(inicio)
            if origen is not None:
                base, movida = place(
                    base,
                    screen.busy(origen, origen + (fin - inicio), timeline=(inicio, fin)),
                    screen.grid(origen),
                )

        salida.append(
            LowerThirdEffect(
                id=f"speed{i:03d}",
                start=round(inicio, 3),
                end=round(fin, 3),
                title=texto,
                rect=base,
                color=style.labels.color,
                locked=True,
                value_score=0.9,
                cost_weight=0.15,
                rationale=(
                    f"marcador {texto}: ese tramo va acelerado porque anunciaste "
                    "la espera" + (f" · movido {movida}" if movida else "")
                ),
            )
        )
    return salida

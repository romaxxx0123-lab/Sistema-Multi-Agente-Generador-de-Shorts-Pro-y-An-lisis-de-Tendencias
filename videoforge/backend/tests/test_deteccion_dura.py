"""El examen dificil: frases escritas a proposito para enganar al detector.

El conjunto de `test_cobertura_habla.py` mide si reconoce lo que dirias. Este
mide algo distinto y mas incomodo: si reconoce **solo** lo que quieres decir.

Sus negativas no son frases neutras, son **trampas**: llevan dentro las mismas
palabras que los patrones, usadas en un sentido inocente. "Cuidado es el nombre
de la carpeta" lleva "cuidado" y no avisa de nada. "Hasta aqui llega el menu
lateral" lleva "hasta aqui" y no despide nada. Y sus positivas son parafrasis
que no se parecen a ninguna formula del diccionario: "y ale a mirar la barrita
subir" es una espera y no dice ni "tarda" ni "esperar".

La primera vez que se paso, de veinte trampas se colaban **catorce**, y de las
positivas dificiles reconocia **tres de veintiuna**. Las dos cifras importan a
la vez: la de trampas sola se aprueba no detectando nada, y la de positivas sola
se aprueba detectando todo. Por eso van juntas en el mismo fichero.

Un falso positivo aqui no es cosmetico: acelera ocho veces un tramo que no era
una espera, o borra del montaje un trozo que no sobraba.
"""

from __future__ import annotations

import pytest

from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.understand.segments import SegmentRole, detect_segments
from forge.understand.speech_cues import find_skips, find_waits

#: Llevan las palabras de los patrones en contexto inocente.
TRAMPAS = [
    # "tardar / esperar / lento", pero sin anunciar una espera AHORA
    "esta aplicacion tarda mucho en general por eso uso la otra",
    "el ordenador va lento desde que le puse el antivirus",
    "yo esperaba que fuera mas facil la verdad",
    "no te preocupes que esto no tarda nada",
    "antes tardaba siglos pero ya lo arreglaron",
    # "saltar / cortar / resumir" en sentido literal
    "me salto una linea en el editor para que se lea mejor",
    "corto y pego el texto en el otro campo",
    "aqui el menu se corta si la ventana es pequena",
    "en resumen el programa hace tres cosas",
    # palabras de aviso que no avisan: ahi son sustantivos
    "lo importante de este programa es que es gratis",
    "cuidado es el nombre de la carpeta de ejemplo",
    "la tecla de atencion no existe en este teclado",
    "esto es clave de registro no clave de acceso",
    # marcas de paso que no cambian de paso
    "seguimos con la misma pantalla de antes",
    "ahora te cuento una anecdota de cuando empece",
    "despues de todo esto sigue igual que estaba",
    # marcas de cierre que no cierran nada
    "hasta aqui llega el menu lateral",
    "un saludo de mi parte al que pregunto en comentarios",
    "gracias por el consejo que me disteis el otro dia",
    "espero que este valor sea el correcto",
]

#: Parafrasis que no se parecen a ninguna formula del diccionario.
DIFICILES: dict[str, list[str]] = {
    "espera": [
        "le doy y me voy a por un cafe",
        "esto no va a acabar en la vida",
        "aprovecho para contaros algo mientras",
        "y ale a mirar la barrita subir",
        "bueno pues nada a esperar",
    ],
    "salto": [
        "esta parte no tiene interes ninguno asi que fuera",
        "os pongo directamente el resultado",
        "pasamos directos al final de esto",
        "ni me molesto en ensenaroslo",
    ],
    "aviso": [
        "que no se os olvide este paso",
        "aqui mucha gente mete la pata",
        "esto hay que hacerlo si o si",
        "como te lo saltes no va a tirar",
        "vigila bien lo que pones aqui",
    ],
    "paso": [
        "bien pues vamos al lio con la configuracion",
        "toca ahora la parte de los permisos",
        "acabado esto nos metemos en los ajustes",
        "cerramos esto y abrimos lo otro",
    ],
    "cierre": [
        "y esto ha sido todo por hoy",
        "nada mas por mi parte",
        "lo dejamos aqui que ya es largo",
    ],
}

#: De las dificiles se exige casi todo, pero no el pleno: dejar margen es lo
#: que evita que el siguiente que toque un patron lo "arregle" metiendo la
#: frase literal en el diccionario.
MIN_DURAS = 0.9


def _transcript(texto: str, inicio: float = 10.0) -> Transcript:
    palabras, t = [], inicio
    for p in texto.split():
        palabras.append(Word(start=round(t, 2), end=round(t + 0.28, 2), text=p))
        t += 0.34
    relleno = TranscriptSegment(
        start=0.0, end=5.0, text="movemos cosas por la pantalla",
        words=[Word(start=0.0, end=4.0, text="movemos")],
    )
    return Transcript(language="es", segments=[
        relleno,
        TranscriptSegment(start=inicio, end=round(t, 2), text=texto, words=palabras),
    ])


def _tramo(frase: str, en: float):
    segs = detect_segments(_transcript(frase, en), 30.0)
    return next((s for s in segs if s.start <= en + 0.5 < s.end), segs[-1])


def _papel(frase: str) -> SegmentRole:
    return _tramo(frase, 10.0).role


def _cierre_dicho(frase: str) -> bool:
    """Cierre reconocido por lo que se DICE, no por caer al final.

    Un cierre se dice al final, y el sistema usa eso: lo ultimo que se habla
    suele ser la despedida. Pero midiendo asi, cualquier frase colocada al
    final aprueba. Se exige ademas que haya reconocido una formula (`cue`).
    """
    t = _tramo(frase, 27.0)
    return t.role is SegmentRole.OUTRO and bool(t.cue)


PRUEBA = {
    "espera": lambda f: bool(find_waits(_transcript(f))),
    "salto": lambda f: bool(find_skips(_transcript(f))),
    "aviso": lambda f: _papel(f) is SegmentRole.WARNING,
    "paso": lambda f: _papel(f) is SegmentRole.STEP,
    "cierre": _cierre_dicho,
}


@pytest.mark.parametrize("frase", TRAMPAS)
def test_las_trampas_no_disparan_nada(frase: str) -> None:
    disparos = [nombre for nombre, prueba in PRUEBA.items() if prueba(frase)]
    assert not disparos, f"{frase!r} se leyo como {disparos}"


@pytest.mark.parametrize("tipo,frases", sorted(DIFICILES.items()))
def test_las_parafrasis_dificiles_se_reconocen(tipo: str, frases: list[str]) -> None:
    fallan = [f for f in frases if not PRUEBA[tipo](f)]
    acierto = 1 - len(fallan) / len(frases)
    assert acierto >= MIN_DURAS, f"{tipo}: {acierto:.0%}, no reconoce {fallan}"


def test_el_examen_dificil_entero() -> None:
    ok = total = 0
    fallan = []
    for tipo, frases in DIFICILES.items():
        for f in frases:
            total += 1
            if PRUEBA[tipo](f):
                ok += 1
            else:
                fallan.append(f)
    assert ok / total >= MIN_DURAS, f"{ok}/{total}. No reconoce: {fallan}"


def test_las_trampas_llevan_de_verdad_las_palabras_del_detector() -> None:
    """Si las trampas dejan de ser trampas, este fichero ya no mide nada.

    Comprueba que siguen conteniendo el vocabulario que dispara los patrones:
    una trampa que no lleva ninguna palabra sospechosa es una frase neutra, y
    esas ya se prueban en `test_cobertura_habla.py`.
    """
    import re

    sospechosas = re.compile(
        r"tard|esper|lent|salt|cort|resum|cuidad|atenci|important|clave"
        r"|seguimos|ahora|despues|hasta aqui|saludo|gracias"
    )
    sin_trampa = [f for f in TRAMPAS if not sospechosas.search(f)]
    assert not sin_trampa, f"ya no son trampas: {sin_trampa}"

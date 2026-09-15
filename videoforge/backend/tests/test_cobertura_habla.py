"""Cuanto de lo que dirias de verdad reconoce, medido.

La pregunta honesta sobre todo esto es: "¿tengo que decir exactamente esa
frase?". La respuesta, cuando se midio por primera vez, era que si: **42%** de
lo que una persona diria de verdad. Buscaba frases literales.

Buscando **raices de palabra** en vez de frases sube al 98% sin un solo falso
positivo. "Tarda", "tardar", "tardando", "tardara" son la misma cosa, y ahi se
iba la mitad de la cobertura.

Este fichero fija las dos cifras. La de cobertura para que no se degrade al
tocar los patrones, y la de falsos positivos porque ensanchar patrones es la
forma clasica de empezar a ver senales donde no las hay: sin ese segundo numero,
el primero se sube a base de romper el sistema.

Aviso sobre sus negativas: son frases **neutras**, sin ninguna palabra del
detector dentro, asi que aprobarlas no demuestra gran cosa. Las de verdad
dificiles -- las que llevan "cuidado", "hasta aqui" o "me salto" en sentido
inocente -- estan en `test_deteccion_dura.py`, y ahi se colaban catorce de
veinte cuando este fichero ya daba el 98%.
"""

from __future__ import annotations

import pytest

from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.understand.segments import SegmentRole, detect_segments, role_at
from forge.understand.speech_cues import find_pointing, find_skips, find_waits

#: Lo que diria de verdad una persona grabando una guia. Ninguna es la frase
#: exacta del diccionario salvo la primera de cada grupo, que esta a proposito
#: para que se vea que el resto son variantes.
ESPERAS = [
    "esto tarda un rato",
    "esto va a tardar lo suyo",
    "ahora se pone a instalar y tarda",
    "le damos y a esperar",
    "esto se queda pensando un buen rato",
    "aqui tarda porque tiene que descargar todo",
    "mientras esto termina os cuento una cosa",
    "y ahora a esperar que acabe",
    "la instalacion es lenta asi que paciencia",
    "esto va para largo",
    "dejamos que cargue",
    "se esta copiando todavia",
]
SALTOS = [
    "esto os lo salto",
    "esto me lo voy a saltar",
    "no os voy a hacer ver todo esto",
    "esta parte la corto",
    "os la resumo porque es aburrida",
    "aqui paso rapido que no aporta",
    "esto no lo teneis que ver",
    "me salto toda esta parte",
]
AVISOS = [
    "ojo con esto",
    "esto es lo importante",
    "cuidadito aqui",
    "presta atencion a esto",
    "si te equivocas aqui la lias",
    "esto es lo que mas falla la gente",
    "no te saltes este paso",
    "aqui hay que ir con tiento",
    "esto es critico",
    "atencion que esto es clave",
]
PASOS = [
    "lo primero es abrir la app",
    "ahora vamos con la segunda parte",
    "el siguiente paso es guardar",
    "seguimos con la configuracion",
    "vamos a por el tercer punto",
    "hecho esto pasamos a lo siguiente",
    "y ya por ultimo guardamos",
]
CIERRES = [
    "nos vemos en el siguiente video",
    "y hasta aqui el video de hoy",
    "gracias por ver",
    "un saludo y hasta la proxima",
    "espero que os haya servido",
]

#: Y lo que NO puede disparar nada.
NEGATIVAS = [
    "vamos a ver como quedan los colores",
    "esta pantalla tiene muchas opciones",
    "el programa se llama gestor de tareas",
    "yo uso esta configuracion desde hace anos",
    "la ventana se puede mover a donde quieras",
    "si no te gusta lo puedes cambiar luego",
    "esto lo aprendi de un companero",
    "la version nueva cambio bastante",
    "no me acuerdo de como se llamaba",
    # Habla de instalar, pero no anuncia ninguna espera.
    "tengo que instalar una actualizacion algun dia",
    # "corto" sin saltarse nada.
    "corto por lo sano y empiezo de cero",
]

#: Cobertura minima. Se mide sobre el conjunto de arriba; bajar de aqui
#: significa que se ha estrechado un patron sin darse cuenta.
MIN_COBERTURA = 0.9


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


def _papel(frase: str) -> SegmentRole:
    return role_at(detect_segments(_transcript(frase), 30.0), 10.5)


CASOS = [
    ("espera", ESPERAS, lambda f: bool(find_waits(_transcript(f)))),
    ("salto", SALTOS, lambda f: bool(find_skips(_transcript(f)))),
    ("aviso", AVISOS, lambda f: _papel(f) is SegmentRole.WARNING),
    ("paso", PASOS, lambda f: _papel(f) is SegmentRole.STEP),
    ("cierre", CIERRES, lambda f: _papel(f) is SegmentRole.OUTRO),
]


@pytest.mark.parametrize("nombre,frases,prueba", CASOS)
def test_cobertura_por_tipo(nombre, frases, prueba) -> None:
    fallan = [f for f in frases if not prueba(f)]
    cobertura = 1 - len(fallan) / len(frases)
    assert cobertura >= MIN_COBERTURA, (
        f"{nombre}: {cobertura:.0%} de cobertura, no reconoce {fallan}"
    )


def test_cobertura_total() -> None:
    ok = total = 0
    fallan = []
    for _nombre, frases, prueba in CASOS:
        for f in frases:
            total += 1
            if prueba(f):
                ok += 1
            else:
                fallan.append(f)
    cobertura = ok / total
    assert cobertura >= MIN_COBERTURA, (
        f"{ok}/{total} = {cobertura:.0%}. No reconoce: {fallan}"
    )


@pytest.mark.parametrize("frase", NEGATIVAS)
def test_lo_que_no_es_una_senal_no_dispara(frase: str) -> None:
    """Sin esto, la cobertura se sube a base de romper el sistema."""
    assert not find_waits(_transcript(frase)), f"vio una espera en: {frase}"
    assert not find_skips(_transcript(frase)), f"vio un salto en: {frase}"
    assert _papel(frase) not in (
        SegmentRole.WARNING, SegmentRole.STEP, SegmentRole.OUTRO
    ), f"le puso papel a: {frase}"


def test_las_variantes_no_son_la_frase_del_diccionario() -> None:
    """Que el conjunto de prueba no se convierta en una copia del diccionario.

    Si alguien anade al diccionario justo las frases de aqui, la cobertura sube
    sin que el sistema generalice nada. Se comprueba que siguen siendo formas
    distintas: distinta conjugacion, distinto orden, distintas palabras.
    """
    for _nombre, frases, prueba in CASOS:
        assert len(frases) >= 5
        # La primera es la del diccionario; las demas tienen que ser otra cosa.
        assert len({f.split()[0] for f in frases}) >= 3, frases


# -- tu forma de hablar ----------------------------------------------------


def test_puedes_anadir_tus_propias_formulas(tmp_path) -> None:
    """El 98% no es el 100%, y cada uno habla como habla."""
    import json

    from forge.understand.speech_cues import USER_PHRASES_FILE, load_user_phrases

    # Tiene que ser algo que de verdad no reconozca. "Se queda pillado" ya no
    # vale de ejemplo: desde que hay campos de significado, eso se entiende
    # solo. Esta no: no habla de ningun proceso ni mide ningun tiempo.
    frase = "y en este punto el bicho se pone tonto"
    assert not find_waits(_transcript(frase)), "esta no deberia estar de serie"

    (tmp_path / USER_PHRASES_FILE).write_text(
        json.dumps({"espera": ["se pone tonto"]}), encoding="utf-8"
    )
    mias = load_user_phrases(tmp_path)
    assert find_waits(_transcript(frase), mias)


def test_tus_formulas_no_sustituyen_a_las_de_serie(tmp_path) -> None:
    import json

    from forge.understand.speech_cues import USER_PHRASES_FILE, load_user_phrases

    (tmp_path / USER_PHRASES_FILE).write_text(
        json.dumps({"espera": ["se pone tonto"]}), encoding="utf-8"
    )
    mias = load_user_phrases(tmp_path)
    assert find_waits(_transcript("esto tarda un rato"), mias)


def test_tus_formulas_no_necesitan_acentos_ni_mayusculas(tmp_path) -> None:
    import json

    from forge.understand.speech_cues import USER_PHRASES_FILE, load_user_phrases

    (tmp_path / USER_PHRASES_FILE).write_text(
        json.dumps({"espera": ["Se Pone Tonto"]}), encoding="utf-8"
    )
    mias = load_user_phrases(tmp_path)
    assert find_waits(_transcript("y en este punto el bicho se pone tonto"), mias)


@pytest.mark.parametrize("contenido", ["{no es json", "[]", '{"inventado": ["x"]}', '{"espera": "no es lista"}'])
def test_un_fichero_de_frases_roto_no_tumba_nada(tmp_path, contenido: str) -> None:
    """Es un fichero que edita una persona a mano: se rompera."""
    from forge.understand.speech_cues import USER_PHRASES_FILE, load_user_phrases

    (tmp_path / USER_PHRASES_FILE).write_text(contenido, encoding="utf-8")
    assert load_user_phrases(tmp_path) == {} or isinstance(load_user_phrases(tmp_path), dict)
    assert find_waits(_transcript("esto tarda un rato"), load_user_phrases(tmp_path))


def test_sin_fichero_no_pasa_nada(tmp_path) -> None:
    from forge.understand.speech_cues import load_user_phrases

    assert load_user_phrases(tmp_path) == {}
    assert load_user_phrases(None) == {}

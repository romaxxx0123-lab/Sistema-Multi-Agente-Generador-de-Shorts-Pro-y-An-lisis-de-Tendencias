"""Reconocer de **que** se habla, no con que palabras se dice.

Los patrones reconocen formulas. Funcionan de maravilla con las formas de
decirlo que estan escritas y **no existen** para las demas, que es la queja de
siempre: "¿tengo que decir exactamente eso?".

Para medirlo de verdad hay que medir sobre frases que no hayan influido en los
patrones, asi que se escribieron tres conjuntos de frases nuevas, a ciegas, y se
midio antes de tocar nada:

    conjunto A   37%        conjunto B   38%        conjunto C   14%

De cada tres cosas que dirias, dos no las veia. `meaning.py` no arregla eso
escribiendo mas frases -- las formas de decir algo no se acaban nunca -- sino
cambiando la pregunta: de "¿encaja esta frase?" a "¿de que campos habla y con
que construcciones?".

Este fichero fija lo que se gano, y sobre todo que no se gano rompiendo nada:
las trampas de `test_deteccion_dura.py` siguen todas cerradas.
"""

from __future__ import annotations

import pytest

from forge.understand.meaning import infer, read, stem

# -- morfologia: una familia de formas, una sola raiz ---------------------

FAMILIAS = [
    # (lo que dices, la palabra del campo)
    ("descargando", "descargar"),
    ("instalacion", "instalar"),
    ("asegurate", "asegurar"),      # pronombre pegado detras
    ("fijaos", "fijarse"),
    ("miralo", "mirar"),
    ("ensenaroslo", "ensenar"),
    ("ratito", "rato"),             # diminutivo
    ("cuidadin", "cuidado"),
]


@pytest.mark.parametrize("dicho,campo", FAMILIAS)
def test_la_misma_palabra_dicha_de_otra_forma_es_la_misma(dicho, campo) -> None:
    assert stem(dicho) == stem(campo)


#: "Casilla" no esta aqui a proposito: SI es un diminutivo (de "casa"), asi que
#: se queda en la misma raiz que "casa". No molesta, porque ningun campo habla
#: de casas, y lo que importa es que los dos lados se midan igual.
PALABRAS_QUE_NO_LLEVAN_PRONOMBRE = ["pantalla", "vigila", "estrella", "ventana"]


@pytest.mark.parametrize("palabra", PALABRAS_QUE_NO_LLEVAN_PRONOMBRE)
def test_no_se_le_quita_a_lo_que_solo_acaba_igual(palabra: str) -> None:
    """"Vigila" no es "vigi" + "la": el pronombre solo se pega a un verbo.

    Sin esta condicion, "pantalla" se quedaba en "pantal" y "vigila" en "vigi",
    y entonces "vigila lo que tocas" dejaba de ser un aviso.
    """
    assert len(stem(palabra)) >= len(palabra) - 3


# -- lo que separa una senal de una palabra suelta ------------------------


def test_un_campo_suelto_no_es_una_senal() -> None:
    """"Comprimido" aparece igual cuando se comprime que cuando se describe."""
    assert not infer("el archivo comprimido ocupa la mitad")
    assert infer("se esta comprimiendo el archivo, esto va a su ritmo")


def test_la_construccion_vale_para_verbos_que_no_estan_en_ningun_campo() -> None:
    """Aqui esta la diferencia con una lista de frases.

    "Se esta <gerundio>" dice que algo esta en marcha ahora, y lo dice igual
    con un verbo que no conoce nadie. Ninguna lista puede cubrir eso.
    """
    senales = infer("esto se esta chorizando entero, dale tiempo")
    assert any(s.intent == "espera" for s in senales)


def test_explica_por_que_lo_dice() -> None:
    """Sin explicacion no se puede revisar, y esto se equivoca a veces."""
    senal = next(s for s in infer("le doy y me piro a fumar mientras instala"))
    assert senal.why and len(senal.why) > 5


# -- las frases nuevas, que es de lo que iba todo esto --------------------

NUEVAS = {
    "espera": [
        "se esta comprimiendo el archivo, esto va a su ritmo",
        "lo dejo trabajando y vuelvo en un rato",
        "ya veis que el porcentaje no se mueve",
        "esto se queda asi un ratito largo",
        "va despacito el pobre",
        "el cacharro esta a lo suyo",
        "esta el disco a tope trabajando",
        "le he dado a actualizar y ya vemos",
    ],
    "salto": [
        "esta parte es un rollo, os la resumo en dos palabras",
        "me salto el rollo teorico",
        "voy al grano que si no no acabamos",
        "de aqui hasta el final es mas de lo mismo",
        "esto os lo cuento y listo",
    ],
    "aviso": [
        "esto es lo que rompe todo si lo pones mal",
        "aqui es donde la gente se estrella",
        "no le des a borrar sin mirar",
        "aqui casi todo el mundo la caga",
        "un descuido aqui y a empezar otra vez",
    ],
    "paso": [
        "venga, nos metemos ya en la configuracion",
        "guardo esto y me paso al navegador",
        "empezamos por lo mas sencillo de todo",
    ],
    "cierre": [
        "me despido hasta la semana que viene",
        "nos leemos en los comentarios",
        "si te ha molado ya sabes",
    ],
}

#: Ninguna de estas influyo en los campos ni en las construcciones cuando se
#: escribieron. Bajar de aqui significa que se ha estrechado algo sin querer.
MIN_NUEVAS = 0.9


@pytest.mark.parametrize("intent,frases", sorted(NUEVAS.items()))
def test_reconoce_formas_de_decirlo_que_no_estan_escritas(intent, frases) -> None:
    fallan = [f for f in frases if not any(s.intent == intent for s in infer(f))]
    acierto = 1 - len(fallan) / len(frases)
    assert acierto >= MIN_NUEVAS, f"{intent}: {acierto:.0%}, no reconoce {fallan}"


# -- y sigue sin ver lo que no hay --------------------------------------

NO_SON_SENAL = [
    "el archivo comprimido ocupa la mitad",
    "la sincronizacion es una funcion que tiene desde siempre",
    "yo antes fumaba mientras programaba",
    "la paciencia es lo que le falta a mucha gente",
    "el resumen automatico lo hace solo",
    "me estrelle con el coche el ano pasado",
    "aqui el menu se corta si la ventana es pequena",
    "el boton de borrar esta escondido",
    "el ultimo bloque de codigo es el mas corto",
    "me despido de la version antigua sin pena",
    "esto no es delicado, se puede tocar sin miedo",
    "el disco duro lo cambie el ano pasado",
    "la parte practica del curso dura dos meses",
    "un abrazo es lo que le hacia falta",
    "el proceso de instalacion viene explicado en la web",
]


@pytest.mark.parametrize("frase", NO_SON_SENAL)
def test_lo_que_solo_lleva_las_palabras_no_dispara(frase: str) -> None:
    """Ensanchar la cobertura es facil; ensancharla sin esto es inutil."""
    assert not infer(frase), f"{frase!r} -> {infer(frase)}"


# -- dos errores que encontraron estas frases y que ya estaban ahi --------


def test_ahi_no_es_un_saludo_en_ingles() -> None:
    """El "hi" de "ahi": la formula inglesa no llevaba \\b por delante.

    Cualquier frase con un "ahi" dentro se clasificaba como intro, y una intro
    se edita distinto que un aviso.
    """
    from forge.understand.segments import SegmentRole, _match

    encaje = _match("cuidadin con lo que tocas ahi", 0.3)
    assert encaje is not None and encaje[0] is SegmentRole.WARNING


@pytest.mark.parametrize("frase", [
    "esto acaba en un minuto",
    "graba la pantalla entera",
    "voy al grano que si no no acabamos",
])
def test_acaba_y_graba_no_son_imperfecto(frase: str) -> None:
    """La terminacion -aba pillaba presentes muy corrientes.

    Y dar una frase por "habitual" la desactiva entera: se hablaba de siempre,
    asi que no pide nada al montaje. En una guia se dice "graba" cada dos
    frases.
    """
    from forge.understand.text import is_habitual

    assert not is_habitual(frase)


def test_estaba_si_es_imperfecto() -> None:
    from forge.understand.text import is_habitual

    assert is_habitual("antes esto estaba en otro sitio")
    assert is_habitual("estabamos probando otra cosa")

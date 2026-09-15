"""Comprobaciones de contexto que separan una senal de una palabra suelta.

Buscar la palabra no basta, y esto es lo que lo demuestra:

    "esto tarda un rato"                        -> avisa de una espera
    "esta aplicacion tarda mucho en general"    -> describe una propiedad
    "no te preocupes que esto no tarda nada"    -> dice lo contrario

    "cuidado con esto"                          -> es un aviso
    "cuidado es el nombre de la carpeta"        -> es un sustantivo

Las tres primeras llevan la misma raiz y solo una pide algo al montaje. Lo que
las separa no es el vocabulario: es la **negacion**, el **aspecto** (si habla de
ahora o de siempre) y la **funcion** de la palabra en la frase.

Sin estas comprobaciones, de veinte frases trampa escritas a proposito se
colaban catorce. Y un falso positivo aqui no es un fallo cosmetico: acelera un
tramo que no era una espera, o borra un trozo que no sobraba.
"""

from __future__ import annotations

import re
import unicodedata

#: Palabras de negacion. Si una cae justo antes de la marca, la marca dice lo
#: contrario de lo que parece.
_NEGACIONES = ("no", "nunca", "jamas", "tampoco", "ni")
#: Cuantas palabras antes se mira buscando la negacion.
NEGATION_WINDOW = 3

#: Marcas de que se habla de **siempre**, no de ahora. "Esta app tarda mucho en
#: general" describe el programa; no anuncia que ahora toque esperar.
_HABITUAL = (
    r"\ben general\b", r"\bnormalmente\b", r"\bsiempre\b", r"\ba veces\b",
    r"\bsuele\b", r"\bdesde que\b", r"\bantes\b", r"\bya lo (arreglaron|han)\b",
    r"\bde normal\b", r"\bpor lo (general|normal)\b",
)
#: Imperfecto: habla del pasado, no de ahora. La terminacion en `-aba` se puede
#: buscar por raiz sin peligro, pero la de `-ia` **no**: en castellano acaban asi
#: cientos de sustantivos corrientes ("paciencia", "todavia", "guia", "familia"),
#: y buscarla por terminacion tumbaba frases que si anunciaban una espera. Por
#: eso los verbos en `-ia` van uno a uno. Falta "hacia" a proposito: en una guia
#: es casi siempre la preposicion ("hacia la derecha").
_IMPERFECTO = (
    # Tres letras de raiz como minimo, y no dos: con dos, "acaba" y "graba"
    # (presente, y en una guia se dicen cada dos frases) pasaban por
    # imperfecto y tumbaban la frase entera por hablar "de siempre". Con
    # tres, "estaba" y "tardaba" siguen dentro y esas se quedan fuera.
    r"\b\w{3,}(aba|abas|abamos|aban)\b",
    r"\b(tenia|habia|podia|queria|decia|iba|ibamos|iban|era|eran|solia"
    r"|salia|venia|ponia|veia|sabia|debia|parecia|servia|funcionaba)\b",
)

#: Palabras que anclan la frase al momento presente. Sin una de estas, una
#: mencion a tardar o a esperar puede ser cualquier cosa.
_ANCLAS = (
    r"\b(esto|esta|este|estos|estas)\b", r"\baqui\b", r"\bahora\b",
    r"\bya\b", r"\ble (damos|doy|das)\b", r"\bvamos a\b", r"\bvoy a\b",
    r"\b(dejamos|dejo|esperamos|espero|espera|esperad)\b", r"\bmientras\b",
    r"\ba esperar\b",
    # "ale a mirar la barra subir": la misma construccion que "a esperar",
    # con el verbo de mirar en vez del de esperar. Ancla igual de bien.
    r"\ba (mirar|ver|contemplar)\b",
    r"\b(ale|hale|venga)\b", r"\bme voy\b", r"\bnos vamos\b",
    r"\ben lo que\b", r"\bse (pone|queda|esta)\b",
    # Nombrar el proceso que esta corriendo ancla igual que decir "esto": "la
    # instalacion es lenta, asi que paciencia" pasa aqui y ahora.
    r"\b(la|el) (instalacion|descarga|copia|actualizacion|compilacion|proceso"
    r"|render|renderizado|escaneo|analisis|conversion)\b",
)


def normalize(texto: str) -> str:
    """Minusculas, sin acentos y sin puntuacion."""
    limpio = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower())
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"[^a-z0-9\s]", " ", limpio)


def is_negated(texto: str, start: int) -> bool:
    """Si hay una negacion justo antes de la posicion indicada."""
    previas = texto[:start].split()[-NEGATION_WINDOW:]
    return any(p in _NEGACIONES for p in previas)


def is_habitual(texto: str) -> bool:
    """Si la frase habla de lo que pasa siempre, no de lo que pasa ahora."""
    if any(re.search(p, texto) for p in _HABITUAL):
        return True
    return any(re.search(p, texto) for p in _IMPERFECTO)


def has_present_anchor(texto: str) -> bool:
    """Si algo ata la frase a este momento del video."""
    return any(re.search(p, texto) for p in _ANCLAS)


#: Palabras que, justo delante, convierten a la siguiente en un nombre. Los
#: determinantes es lo obvio; "de" tambien, porque encabeza complementos: "la
#: tecla DE atencion", "una llamada DE atencion". La interjeccion nunca va
#: detras de "de".
_DETERMINANTES = (
    "la", "el", "una", "un", "las", "los", "esa", "ese", "mi", "tu", "su",
    "de", "del",
)

#: Formas de "ser" que, pegadas detras, delatan que la palabra es el sujeto de
#: una definicion: "cuidado ES el nombre de la carpeta".
_COPULA = ("es", "era", "sera", "son", "eran", "significa")

#: Detras de un nombre cabe un complemento con "de": "clave DE registro",
#: "lo importante DE este programa". Detras de un aviso, no... salvo estas
#: muletillas, que solo refuerzan ("importante de verdad").
_COMPLEMENTO = re.compile(
    r"^\s*del?\s+(?!verdad\b|narices\b|cojones\b|todo\b)\w+"
)


def preceded_by_determiner(texto: str, start: int) -> bool:
    """Si la palabra viene precedida de un articulo: entonces es un sustantivo."""
    previas = texto[:start].split()
    return bool(previas) and previas[-1] in _DETERMINANTES


def followed_by_copula(texto: str, end: int) -> bool:
    """Si justo detras viene un "es": la palabra es de lo que se habla.

    Se mira **solo la palabra siguiente**. Mirar mas lejos parecia mas listo y
    era peor: en "atencion, que esto es clave" el "es" esta a tres palabras y
    no define nada, asi que la ventana larga se comia el aviso.
    """
    siguientes = texto[end:].split()
    return bool(siguientes) and siguientes[0] in _COPULA


def followed_by_complement(texto: str, end: int) -> bool:
    """Si detras viene un complemento con "de", que es cosa de sustantivos.

    Es lo unico que separa "esto es clave de registro" (un nombre) de "esto es
    clave" (un aviso): las dos llevan la misma palabra detras del mismo verbo.
    """
    return bool(_COMPLEMENTO.match(texto[end:]))


def is_a_noun_here(texto: str, start: int, end: int) -> bool:
    """Si en esta frase la palabra funciona como nombre y no como aviso."""
    return (
        preceded_by_determiner(texto, start)
        or followed_by_copula(texto, end)
        or followed_by_complement(texto, end)
    )


# ---------------------------------------------------------------------------
# Lo que parece una despedida y no lo es
# ---------------------------------------------------------------------------

#: "Hasta aqui" tambien mide hasta donde llega algo en pantalla. Con uno de
#: estos verbos detras habla de extension, no de despedida.
EXTENT_AFTER = re.compile(
    r"^\s*(llega|llegan|va|van|sale|salen|abarca|abarcan|ocupa|ocupan|mide|miden"
    r"|se (extiende|extienden|ve|ven|estira|queda|quedan|alarga|muestra))\b"
)
#: "Un saludo" despide... salvo cuando se lo mandas a alguien concreto.
RELAY_AFTER = re.compile(r"^\s*(de (mi|nuestra|su|tu) parte|al que\b|a quien\b)")
#: Lo mismo, buscando la formula entera dentro de la frase.
_RECADO = re.compile(
    r"\bun (saludo|abrazo)\s+(de (mi|nuestra|su|tu) parte|al que\b|a quien\b)"
)


def is_relayed_greeting(texto: str) -> bool:
    """Si el saludo va dirigido a un tercero: entonces el video no se acaba."""
    return bool(_RECADO.search(texto))

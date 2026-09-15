"""Que lo que se inserta tenga que ver con lo que se esta diciendo.

El fallo era de los que dan mas verguenza al verlos en pantalla: hablas de
**Palworld** y aparece una imagen de **Minecraft**, porque las dos estaban
etiquetadas como "videojuego". La regla de antes era que compartir *una*
palabra bastaba:

    buscadas = {"palworld", "base"}
    etiquetas = {"minecraft", "videojuego", "base"}
    comunes = {"base"}            ->  dentro, con un 70% de relevancia

Y no es un detalle de puntuacion: es que la pregunta estaba mal hecha. "Tiene
algo en comun" no es "es esto". Aqui se pregunta otra cosa, en dos partes:

1. **¿Esta etiquetado con lo que nombras?** Lo que se busca tiene una cabeza --
   la palabra concreta que se acaba de decir -- y el resto es contexto para
   desempatar. Si el material no lleva la cabeza, no es de lo que hablas, por
   muchas palabras de contexto que comparta. "Base" no convierte una foto de
   Minecraft en una foto de Palworld.

2. **¿Habla de algo que en el video no se menciona?** Una etiqueta rara dentro
   de tu biblioteca es la **identidad** de ese material: lo que ese fichero es
   y los demas no. Si esa identidad no aparece en ningun momento del video --
   ni dicha ni escrita en pantalla -- ese material va de otra cosa. Esto pilla
   el caso en el que la cabeza es generica: dices "base", el fichero es de
   Minecraft, y Minecraft no se nombra en todo el video.

Lo que sale de aqui es conservador a proposito, igual que los recuadros: si no
se puede confirmar que el material es de lo que hablas, **no se pone**. Un
hueco no se nota; una imagen equivocada la ve todo el mundo.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from ..understand.meaning import stem


def normalize_tag(texto: str) -> str:
    """Una etiqueta sin acentos, sin mayusculas y sin separadores."""
    limpio = "".join(
        c for c in unicodedata.normalize("NFD", str(texto).lower())
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", "", limpio)


def tag_stem(tag: str) -> str:
    """La raiz de una etiqueta, quitandole antes el plural.

    Snowball hace esto solo con las palabras del castellano, pero no con los
    prestamos, que en una guia de informatica son la mitad: "driver" se queda
    en "driv" y "drivers" se queda en "drivers", asi que no coincidian. Quitar
    la "s" antes lo arregla para los dos.
    """
    limpio = normalize_tag(tag)
    if limpio.endswith("es") and len(limpio) > 5:
        limpio = limpio[:-2]
    elif limpio.endswith("s") and len(limpio) > 4:
        limpio = limpio[:-1]
    return stem(limpio)


def tag_stems(tags) -> set[str]:
    """Las raices de un grupo de etiquetas, para comparar sin pelearse."""
    return {r for r in (tag_stem(x) for x in tags) if r}


def subject(tags) -> str:
    """De que es este material: su **primera** etiqueta.

    Es una convencion, y es la que ya usa todo el mundo al nombrar ficheros:
    `minecraft-videojuego-base.png` es una foto **de Minecraft**, y lo de
    videojuego y base la describe. En `tags.json`, igual: la primera de la
    lista es el sujeto.

    Hace falta distinguirlo porque la regla de abajo se apoya en ello: de un
    material se puede no decir todo lo que lo describe, pero si aparece en el
    montaje es porque se habla **de el**.
    """
    for tag in tags:
        raiz = tag_stem(tag)
        if raiz:
            return raiz
    return ""


@dataclass(frozen=True)
class Verdict:
    """Si ese material puede ponerse ahi, y por que si o por que no."""

    ok: bool
    reason: str
    overlap: tuple[str, ...] = ()

    def __bool__(self) -> bool:
        return self.ok


def judge(
    tags,
    *,
    head: str,
    context: str = "",
    vocabulary=(),
    subject_first: bool = True,
) -> Verdict:
    """Decide si ese material es de lo que se esta hablando.

    `head` es lo concreto que se nombra; `context`, lo que se dice alrededor;
    `vocabulary`, todo lo que se dice o se lee en pantalla **en todo el video**.

    Con `subject_first`, las etiquetas van **en orden** y la primera es el
    sujeto (ver `subject`). Vale para tu biblioteca, donde los nombres de
    fichero siguen esa convencion; no vale para un banco de stock, donde las
    etiquetas vienen en el orden que le apetezca al banco.
    """
    etiquetas_ordenadas = [t for t in tags if normalize_tag(t)]
    etiquetas = tag_stems(etiquetas_ordenadas)
    if not etiquetas:
        return Verdict(False, "el material no tiene ninguna etiqueta que comprobar")

    cabeza = {tag_stem(head)} - {""} if head else set()
    if cabeza and not (cabeza & etiquetas):
        return Verdict(
            False,
            f'no esta etiquetado con "{head}", que es de lo que hablas ahi',
        )

    # De lo que **es** el material hay que hablar en el video. Las demas
    # etiquetas solo lo describen, y de eso se puede no decir nada: una foto de
    # Palworld sigue siendo de Palworld aunque no digas "granja" en todo el
    # video. Pero una foto de Minecraft no se pone nunca en un video donde
    # Minecraft no se nombra, por muchas palabras que comparta.
    # Lo que se busca cuenta como parte de lo que se dice: si la consulta lleva
    # "palworld", es que ahi se estaba hablando de Palworld.
    dicho = tag_stems(vocabulary) | tag_stems(context.split()) | cabeza

    sujeto = subject(etiquetas_ordenadas) if subject_first else ""
    if sujeto and sujeto not in dicho:
        original = next(
            (t for t in etiquetas_ordenadas if tag_stem(t) == sujeto), sujeto
        )
        return Verdict(
            False,
            f'es material de "{original}", y eso no se nombra en todo el video',
        )

    pedidas = cabeza | tag_stems(context.split())
    comunes = [
        t for t in etiquetas_ordenadas if tag_stem(t) in pedidas & etiquetas
    ]
    return Verdict(
        True,
        f"coincide con lo que dices: {', '.join(sorted(comunes))}"
        if comunes else "coincide",
        tuple(sorted(comunes)),
    )

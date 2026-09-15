"""Que **es** cada parte del video, segun lo que se dice en ella.

Hasta aqui el montaje sabia donde respiras, no de que hablas: los capitulos
salian de las pausas largas y todo el video se editaba igual. Pero las partes de
una guia no son iguales entre si, y quien la ve tampoco las trata igual:

- la **intro** se la salta casi todo el mundo,
- un **paso** es lo que viene a buscar,
- un **aviso** ("ojo, si no haces esto no funciona") es el momento que no se
  puede perder y el que mas se agradece que este senalado,
- una **digresion** ("por cierto, aunque esto da igual...") es justo lo que
  sobra,
- el **cierre** ("nos vemos en el siguiente video") tampoco lo ve nadie entero.

Se detecta con las **marcas del discurso**: las formulas con las que una persona
enlaza lo que cuenta. En material explicativo son sorprendentemente fijas ("lo
primero es", "ahora vamos a", "ojo con", "en resumen", "nos vemos"), van casi
siempre al principio de la frase, y no hace falta ningun modelo de lenguaje para
reconocerlas. Ademas explican su decision sola: *"esto es un aviso porque dices
'ten cuidado con'"*, que es lo que permite revisarlo y corregirlo.

Lo que no sabe hacer: entender un video donde nadie enlaza nada. Cuando no hay
marcas, no se inventa una estructura: deja todo como cuerpo y el montaje se
comporta como antes.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # solo para los tipos: `Analysis` guarda estos tramos, asi
    # que importarlo de verdad daria una dependencia circular.
    from ..analysis.types import Transcript


class SegmentRole(str, Enum):
    """Que papel juega un tramo dentro del video."""

    INTRO = "intro"
    STEP = "paso"
    WARNING = "aviso"
    TIP = "consejo"
    RECAP = "resumen"
    OUTRO = "cierre"
    ASIDE = "digresion"
    BODY = "cuerpo"


#: Cuanto peso tiene encontrar la marca. Las inequivocas valen mas.
_FUERTE = 0.9
_MEDIA = 0.65
_DEBIL = 0.4

#: Marcas de discurso por papel. `inicio=True` exige que la formula abra la
#: frase, que es donde van casi todas; las de `inicio=False` valen en cualquier
#: sitio porque son afirmaciones, no enlaces ("esto es importante").
_CUES: dict[SegmentRole, list[tuple[str, float, bool]]] = {
    SegmentRole.INTRO: [
        (r"(hola|buenas|muy buenas|bienvenid[oa]s?)\b", _FUERTE, True),
        (r"en (este|el) (video|tutorial|capitulo)\b", _FUERTE, True),
        (r"(hoy|en el dia de hoy) (vamos a|os (voy|traigo)|te (voy|traigo))", _FUERTE, True),
        (r"(vamos a ver|os enseno|te enseno|voy a ensenarte)\b", _MEDIA, True),
        (r"antes de (empezar|nada)\b", _MEDIA, True),
        (r"(hi|hey|welcome)\b", _FUERTE, True),
        (r"in this (video|tutorial)\b", _FUERTE, True),
    ],
    SegmentRole.STEP: [
        (r"lo primero( que| es)?\b", _FUERTE, True),
        (r"(el|al) (primer|segundo|tercer|cuarto|quinto|ultimo) paso\b", _FUERTE, True),
        (r"(paso|punto) (uno|dos|tres|cuatro|cinco|\d+)\b", _FUERTE, True),
        (r"(ahora|luego|despues|a continuacion|seguidamente)\b", _MEDIA, True),
        (r"(lo|el) siguiente( paso| que| es)?\b", _MEDIA, True),
        (r"(vamos|pasamos) (a|con) (la|el|los|las)\b", _MEDIA, True),
        (r"una vez (que )?(has|hayas|tengas|este)\b", _MEDIA, True),
        (r"(first|next|then|after that|now (we|you))\b", _MEDIA, True),
    ],
    SegmentRole.WARNING: [
        (r"(ojo|cuidado|atencion|aviso)\b", _FUERTE, True),
        (r"ten (mucho )?cuidado\b", _FUERTE, False),
        (r"(muy )?importante\b", _MEDIA, False),
        (r"(no|nunca) (te )?olvides\b", _FUERTE, False),
        (r"si no,? no (te )?(funciona|va|sirve)\b", _FUERTE, False),
        (r"esto es (lo )?(mas )?importante\b", _FUERTE, False),
        (r"(sin esto|si te saltas esto)\b", _FUERTE, False),
        (r"(warning|careful|be careful|make sure)\b", _MEDIA, False),
        # "fijate bien en este boton" es literalmente pedir atencion sobre algo
        # concreto: es el momento que mas se agradece tener senalado.
        (r"(fijate|fijaos|fijese|mira) (bien|mucho|atentamente)\b", _MEDIA, True),
    ],
    SegmentRole.TIP: [
        (r"(un )?(truco|consejo)\b", _FUERTE, True),
        (r"(te|os) recomiendo\b", _FUERTE, False),
        (r"yo (suelo|siempre|en mi caso)\b", _MEDIA, True),
        (r"lo que yo hago es\b", _MEDIA, True),
        (r"(pro )?tip\b", _MEDIA, True),
    ],
    SegmentRole.RECAP: [
        (r"(en )?(resumen|resumiendo)\b", _FUERTE, True),
        (r"(recapitulando|repasamos)\b", _FUERTE, True),
        # "ya esta" con el "ya" obligatorio: sin el, "esta" pilla cualquier
        # demostrativo ("activamos esta casilla") y lo llama resumen. Es el
        # mismo error que quitar el "este" de "en este video".
        (r"(y )?ya (esta|estaria)\b", _MEDIA, True),
        (r"(con esto (ya )?(queda|tienes|esta))\b", _MEDIA, True),
        (r"(to sum up|in short|recap)\b", _FUERTE, True),
    ],
    SegmentRole.OUTRO: [
        (r"(nos vemos|hasta (la proxima|luego|el proximo))\b", _FUERTE, True),
        (r"(gracias por (ver|verme|estar))\b", _FUERTE, False),
        (r"(suscribete|suscribiros|dale (a )?like|comenta)\b", _FUERTE, False),
        (r"(en el (siguiente|proximo) video)\b", _MEDIA, False),
        (r"(thanks for watching|see you|subscribe)\b", _FUERTE, False),
    ],
    SegmentRole.ASIDE: [
        (r"por cierto\b", _FUERTE, True),
        (r"(esto )?(es un inciso|entre parentesis)\b", _FUERTE, True),
        (r"(aunque|pero) (bueno|vamos|da igual)\b", _MEDIA, True),
        (r"(que no viene a cuento|fuera de tema)\b", _FUERTE, False),
        (r"(by the way|anyway|side note)\b", _MEDIA, True),
    ],
}

#: Cuantas palabras del principio se miran para las marcas de `inicio`. Una
#: marca de discurso que aparece en la palabra veinte ya no enlaza nada.
OPENING_WORDS = 6
#: Por debajo de esta confianza no se le pone papel: mejor "cuerpo" que
#: equivocarse, porque el papel cambia como se edita el tramo.
MIN_CONFIDENCE = 0.4
#: Un tramo mas corto que esto no llega a ser una parte del video.
MIN_SEGMENT_SECONDS = 1.2


@dataclass
class NarrativeSegment:
    """Un tramo del video con el papel que juega y por que se cree eso."""

    start: float
    end: float
    role: SegmentRole
    confidence: float
    #: la formula concreta que lo delato, para poder explicarlo y revisarlo
    cue: str = ""
    text: str = ""

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)

    def contains(self, t: float) -> bool:
        return self.start <= t < self.end

    @property
    def rationale(self) -> str:
        if self.cue:
            return f'{self.role.value}: dices "{self.cue}"'
        if self.role is SegmentRole.BODY:
            return "cuerpo: no enlaza con ninguna formula reconocible"
        return f"{self.role.value}: por donde cae en el video"


def _normalize(texto: str) -> str:
    """Minusculas, sin acentos y sin puntuacion: el habla transcrita varia."""
    limpio = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower())
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"[^a-z0-9\s]", " ", limpio)


def _match(texto: str) -> tuple[SegmentRole, float, str] | None:
    """El papel que mejor encaja con lo que se dice en ese tramo."""
    limpio = _normalize(texto)
    apertura = " ".join(limpio.split()[:OPENING_WORDS])

    mejor: tuple[SegmentRole, float, str] | None = None
    for papel, marcas in _CUES.items():
        for patron, peso, solo_al_inicio in marcas:
            donde = apertura if solo_al_inicio else limpio
            encontrado = re.search(patron, donde)
            if not encontrado:
                continue
            if mejor is None or peso > mejor[1]:
                mejor = (papel, peso, encontrado.group(0).strip())
    return mejor


def detect_segments(
    transcript: "Transcript | None", duration: float = 0.0
) -> list[NarrativeSegment]:
    """Reparte el video en tramos con papel, a partir de lo que se dice.

    Los tramos salen de las frases del transcript. Los consecutivos con el mismo
    papel se juntan, porque una guia no cambia de parte cada frase: lo que marca
    una parte nueva es la formula con la que se enlaza.
    """
    if transcript is None or not transcript.segments:
        return []

    crudos: list[NarrativeSegment] = []
    for frase in transcript.segments:
        if frase.end - frase.start < 0.05:
            continue
        encaje = _match(frase.text)
        if encaje and encaje[1] >= MIN_CONFIDENCE:
            papel, confianza, marca = encaje
        else:
            papel, confianza, marca = SegmentRole.BODY, 0.0, ""
        crudos.append(
            NarrativeSegment(
                start=round(frase.start, 3),
                end=round(frase.end, 3),
                role=papel,
                confidence=confianza,
                cue=marca,
                text=frase.text,
            )
        )

    if not crudos:
        return []

    crudos = _apply_position_priors(crudos, duration)
    return _tile(_merge(crudos), duration)


def _tile(segmentos: list[NarrativeSegment], duration: float) -> list[NarrativeSegment]:
    """Estira los tramos hasta que cubran el video entero, sin huecos.

    Los tramos salen de las frases, asi que entre uno y otro queda el silencio
    en el que la persona respira -- y ese silencio es justo lo que el montaje
    decide recortar. Sin estirar, esas pausas caian en tierra de nadie y se
    trataban como cuerpo: la estructura se entendia bien y no servia para nada.

    La pausa se le da al tramo **anterior**: quien callo es quien acaba de
    terminar su parte, asi que el silencio que sigue a la intro es de la intro.
    """
    if not segmentos:
        return []

    segmentos[0].start = 0.0
    for anterior, siguiente in zip(segmentos, segmentos[1:]):
        anterior.end = siguiente.start
    if duration > segmentos[-1].end:
        segmentos[-1].end = duration
    return segmentos


def _apply_position_priors(
    segmentos: list[NarrativeSegment], duration: float
) -> list[NarrativeSegment]:
    """Donde cae un tramo tambien dice algo, pero menos que lo que se dice.

    El primer tramo de un video es casi siempre presentacion y el ultimo casi
    siempre despedida, aunque no lleven formula. Solo se aplica si el tramo no
    tenia papel propio: lo que se dice manda sobre donde cae.
    """
    if segmentos[0].role is SegmentRole.BODY:
        segmentos[0].role = SegmentRole.INTRO
        segmentos[0].confidence = _DEBIL

    ultimo = segmentos[-1]
    if ultimo.role is SegmentRole.BODY and (
        duration <= 0 or ultimo.start > duration * 0.75
    ):
        ultimo.role = SegmentRole.OUTRO
        ultimo.confidence = _DEBIL
    return segmentos


def _merge(segmentos: list[NarrativeSegment]) -> list[NarrativeSegment]:
    """Junta los tramos seguidos que juegan el mismo papel."""
    salida: list[NarrativeSegment] = []
    for s in segmentos:
        if salida and salida[-1].role is s.role:
            anterior = salida[-1]
            anterior.end = s.end
            anterior.text = f"{anterior.text} {s.text}".strip()
            # Se queda la marca mas fuerte de las dos.
            if s.confidence > anterior.confidence:
                anterior.confidence = s.confidence
                anterior.cue = s.cue
            continue
        salida.append(
            NarrativeSegment(
                start=s.start, end=s.end, role=s.role,
                confidence=s.confidence, cue=s.cue, text=s.text,
            )
        )

    # Un tramo demasiado corto no es una parte: se absorbe en el anterior. Pero
    # si traia una marca mas fuerte que la del tramo que se lo come, es esa la
    # que manda: un "ojo!" de medio segundo es breve y es exactamente el momento
    # que no se puede perder. Absorberlo sin mas lo borraba del mapa.
    fusionados: list[NarrativeSegment] = []
    for s in salida:
        if fusionados and s.duration < MIN_SEGMENT_SECONDS:
            anterior = fusionados[-1]
            anterior.end = s.end
            if s.confidence > anterior.confidence:
                anterior.role = s.role
                anterior.confidence = s.confidence
                anterior.cue = s.cue
            continue
        fusionados.append(s)
    return fusionados


def role_at(segmentos: list[NarrativeSegment], t: float) -> SegmentRole:
    """Que papel juega el video en ese instante del ORIGINAL."""
    for s in segmentos:
        if s.contains(t):
            return s.role
    return SegmentRole.BODY


def summarize(segmentos: list[NarrativeSegment]) -> str:
    """Una linea con la estructura que se entendio, para poder revisarla."""
    if not segmentos:
        return "sin estructura reconocible"
    return " · ".join(f"{s.role.value} {s.duration:.0f}s" for s in segmentos)

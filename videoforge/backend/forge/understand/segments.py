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
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

from .meaning import infer
from .text import (
    EXTENT_AFTER,
    followed_by_complement,
    followed_by_copula,
    RELAY_AFTER,
    is_a_noun_here,
    is_negated,
    normalize,
)

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
        (r"en (este|el) (video|tutorial|capitulo)\b", _FUERTE, True, "principio"),
        (r"(hoy|en el dia de hoy) (vamos a|os (voy|traigo)|te (voy|traigo))", _FUERTE, True, "principio"),
        (r"(vamos a ver|os enseno|te enseno|voy a ensenarte)\b", _MEDIA, True, "principio"),
        (r"antes de (empezar|nada)\b", _MEDIA, True, "principio"),
        # Con \b delante: sin el, el "hi" de "ahi" convertia en intro cualquier\n        # frase con un "ahi" dentro. Lo encontro una frase de prueba que decia\n        # "cuidadin con lo que tocas ahi" y salia clasificada como saludo.\n        (r"\b(hi|hey|welcome)\b", _FUERTE, True),
        (r"\bin this (video|tutorial)\b", _FUERTE, True),
    ],
    SegmentRole.STEP: [
        (r"lo primero( que| es)?\b", _FUERTE, True),
        # Ordinales con cualquier terminacion: primer/primera/primero.
        (r"\b(el|al|la)? ?(primer|segund|tercer|cuart|quint|sext|ultim)\w*\s+(paso|punto|parte|cosa)\b", _FUERTE, True, "complemento"),
        (r"\b(paso|punto)\s+(uno|dos|tres|cuatro|cinco|seis|\d+)\b", _FUERTE, True),
        (r"\bpor ultimo\b", _FUERTE, True),
        (r"(ahora|luego|despues|a continuacion|seguidamente)\b(?! de todo)", _MEDIA, True, "cambia"),
        (r"(lo|el) siguiente( paso| que| es)?\b", _MEDIA, True),
        (r"\b(seguimos|continuamos|pasamos|vamos)\s+(con|a por|a la|al)\b", _MEDIA, True, "cambia"),
        (r"\bvamos (a|con) (la|el|los|las|por)\b", _MEDIA, True),
        (r"una vez (que )?(has|hayas|tengas|este|hecho)\b", _MEDIA, True),
        (r"\b(hecho|acabado|terminado|cerrado) esto\b", _MEDIA, True),
        (r"\btoca (ahora )?(la|el|los|las)\b", _MEDIA, True),
        (r"\bvamos al lio\b", _MEDIA, True),
        # Transicion sin formula: cierras una cosa y abres otra. No dice
        # "ahora" ni "el siguiente paso", pero cambia de sitio igual.
        (
            r"\b(cerramos|cierro|cierras|cerrad|guardamos|guardo|salimos"
            r"|minimizamos)\b[^.]{0,20}\by\s+(abrimos|abro|abres|abrid"
            r"|entramos|creamos|pasamos|vamos|nos vamos)\b",
            _MEDIA,
            True,
        ),
        (r"\b(first|next|then|after that|now (we|you))\b", _MEDIA, True),
    ],
    SegmentRole.WARNING: [
        # Raices, no frases: "cuidado", "cuidadito", "cuidadin" son lo mismo.
        (r"\b(ojo|aviso)\b", _FUERTE, True),
        (r"\bcuidad\w*\b", _FUERTE, True, "sustantivo"),
        (r"\batenci\w*\b", _FUERTE, False, "sustantivo"),
        (r"\bpresta(d)? atenci\w*", _FUERTE, False),
        (r"\bimportant\w*\b", _MEDIA, False, "sustantivo"),
        (r"\b(critic[oa]|clave|imprescindible|fundamental)\b", _FUERTE, False, "sustantivo"),
        (r"\b(no|nunca)\s+(se\s+)?(te|os|me|nos)?\s*(salt\w*|olvid\w*)", _FUERTE, False),
        (r"\bcomo (te|os) (lo |la )?salt\w*", _FUERTE, False),
        (r"\b(mete[ns]?|metiendo) la pata\b", _FUERTE, False),
        (r"\b(si o si|a huevo|obligatorio)\b", _MEDIA, False),
        (r"\bhay que (hacerlo|ponerlo|tenerlo)\b", _MEDIA, False),
        (r"\b(vigila|revisa|comprueba)\w*\s+(bien|mucho)\b", _MEDIA, False),
        (r"si no,? no (te |os )?(funciona|va|sirve)\b", _FUERTE, False),
        (r"\b(la lias|la cagas|se lia|se rompe todo)\b", _FUERTE, False),
        (r"\b(lo que )?mas (falla|se falla|se equivoca)\b", _FUERTE, False),
        (r"\bcon (tiento|cuidado|ojo)\b", _MEDIA, False),
        (r"\b(sin esto|si te saltas esto)\b", _FUERTE, False),
        (r"\bte (puedes |podeis )?(cargar|carga[rs]|romper)\b", _MEDIA, False),
        (r"\b(warning|careful|be careful|make sure)\b", _MEDIA, False),
        # "fijate bien en este boton" es pedir atencion sobre algo concreto.
        (r"\b(fijate|fijaos|fijese|mira[dn]?)\s+(bien|mucho|atentamente)\b", _MEDIA, True),
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
        (r"\b(to sum up|in short|recap)\b", _FUERTE, True),
    ],
    SegmentRole.OUTRO: [
        (r"(nos vemos|hasta (la proxima|luego|el proximo|otra))\b", _FUERTE, False),
        (r"\bhasta aqui\b", _FUERTE, True, "final+extension"),
        (r"(gracias por (ver|verme|estar|acompanar\w*|aguantar\w*))\b", _FUERTE, False, "final"),
        (r"espero que (os|te) haya\s+\w*(servid|gustad|ayudad|valid)\w*", _FUERTE, False),
        (r"\bun (saludo|abrazo)\b", _FUERTE, False, "final+recado+definicion"),
        (r"(suscrib\w*|dale (a )?like|comenta[dn]?)\b", _FUERTE, False),
        (r"(en el (siguiente|proximo) video)\b", _MEDIA, False),
        (r"\b(thanks for watching|see you|subscribe)\b", _FUERTE, False),
        (r"\b(esto|eso) (ha sido|es) todo\b", _FUERTE, False, "final"),
        (r"\bnada mas por (mi|nuestra) parte\b", _FUERTE, False, "final"),
        (r"\blo dejamos (aqui|por hoy)\b", _FUERTE, False, "final"),
    ],
    SegmentRole.ASIDE: [
        (r"por cierto\b", _FUERTE, True),
        (r"(esto )?(es un inciso|entre parentesis)\b", _FUERTE, True),
        (r"(aunque|pero) (bueno|vamos|da igual)\b", _MEDIA, True),
        (r"(que no viene a cuento|fuera de tema)\b", _FUERTE, False),
        (r"\b(by the way|anyway|side note)\b", _MEDIA, True),
        # "ahora te cuento una anecdota" lleva marca de paso y no es un paso.
        (r"\b(te|os) cuento\b.*\b(anecdota|historia|curiosidad|chascarrillo)\b", _FUERTE, False),
        (r"\bque no viene al caso\b", _FUERTE, False),
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


#: Hasta esta fraccion del video, una presentacion es una presentacion. Despues
#: no: "vamos a ver como se configura esto" en el minuto doce no presenta nada,
#: es un paso mas. Sin esta guarda, en una guia de veinte minutos salian
#: **treinta y nueve intros** repartidas de punta a punta, y cada una se
#: editaba como una intro (se aprieta mas y los zooms valen menos).
INTRO_POSITION = 0.12
#: Y antes de ahi, tampoco se descarta sin mas: se cree a medias, igual que con
#: el cierre. Una guia que empieza con dos minutos de contexto existe.
INTRO_LATE_FACTOR = 0.5

#: A partir de esta fraccion del video, una despedida es una despedida sin mas
#: preguntas.
OUTRO_POSITION = 0.7
#: Antes de ahi no se descarta: se cree a medias. Una despedida a mitad de
#: video existe (cortas dos guias en un mismo archivo), solo es rara. Con este
#: factor, una formula fuerte ("gracias por ver") sigue contando y una regular
#: ("en el siguiente video") se cae sola por debajo de `MIN_CONFIDENCE`.
OUTRO_EARLY_FACTOR = 0.55

_normalize = normalize

#: Lo que deduce `meaning.py` vale algo menos que una formula exacta: si las dos
#: cosas se disputan el mismo tramo, gana la formula, que es mas explicable.
MEANING_DISCOUNT = 0.85

#: Como se llama cada papel en `meaning.py`.
_POR_SENTIDO = {
    "aviso": SegmentRole.WARNING,
    "paso": SegmentRole.STEP,
    "cierre": SegmentRole.OUTRO,
}


def _guard_factor(guarda: str | None, texto: str, encontrado, posicion: float) -> float:
    """Cuanto se cree la marca, mirando el contexto que la rodea.

    Buscar la palabra no basta: "cuidado con esto" es un aviso y "cuidado es el
    nombre de la carpeta" no. Sin estas comprobaciones, de veinte frases trampa
    escritas a proposito se colaban catorce.

    Devuelve un factor sobre el peso: 0 la tumba, 1 la deja intacta, y los
    valores de en medio son para el contexto que resta sin descartar. Una marca
    puede pedir varias comprobaciones a la vez, separadas por `+`.
    """
    if is_negated(texto, encontrado.start()):
        return 0.0
    if guarda is None:
        return 1.0
    if "+" in guarda:
        factor = 1.0
        for una in guarda.split("+"):
            factor *= _guard_factor(una, texto, encontrado, posicion)
        return factor
    if guarda == "extension":
        return 0.0 if EXTENT_AFTER.search(texto[encontrado.end():]) else 1.0
    if guarda == "recado":
        return 0.0 if RELAY_AFTER.search(texto[encontrado.end():]) else 1.0
    if guarda == "definicion":
        # "Un abrazo ES lo que le hacia falta" habla de un abrazo, no despide.
        return 0.0 if followed_by_copula(texto, encontrado.end()) else 1.0
    if guarda == "complemento":
        # "El tercer punto DEL MENU no hace nada" no avanza al tercer punto:
        # habla de uno. Lo delata el complemento con "de", no el verbo: "el
        # siguiente paso ES abrir" si avanza, y lleva un "es" detras igual.
        return 0.0 if followed_by_complement(texto, encontrado.end()) else 1.0
    if guarda == "sustantivo":
        # La palabra tiene que estar usada como interjeccion, no como nombre.
        # "la tecla de ATENCION", "esto ES clave de registro", "CUIDADO es el
        # nombre de la carpeta": las tres llevan la palabra y ninguna avisa.
        return 0.0 if is_a_noun_here(texto, encontrado.start(), encontrado.end()) else 1.0
    if guarda == "final":
        # Una despedida se dice al final, y eso es parte de lo que la hace una
        # despedida; pero no se descarta por sitio, solo se cree menos.
        return 1.0 if posicion >= OUTRO_POSITION else OUTRO_EARLY_FACTOR
    if guarda == "principio":
        # Simetrico: una presentacion presenta el video, y el video se presenta
        # al empezar.
        return 1.0 if posicion <= INTRO_POSITION else INTRO_LATE_FACTOR
    if guarda == "cambia":
        # "seguimos con la misma pantalla" no pasa a otra cosa.
        resto = " ".join(texto[encontrado.end():].split()[:3])
        return 0.0 if re.search(r"\b(la misma|el mismo|lo mismo|igual)\b", resto) else 1.0
    return 1.0


def _match(texto: str, posicion: float = 0.5) -> tuple[SegmentRole, float, str] | None:
    """El papel que mejor encaja con lo que se dice en ese tramo.

    `posicion` es donde cae el tramo en el video (0 al principio, 1 al final):
    hay marcas que solo significan lo que parecen cerca del final.
    """
    limpio = _normalize(texto)
    apertura = " ".join(limpio.split()[:OPENING_WORDS])

    mejor: tuple[SegmentRole, float, str] | None = None
    for papel, marcas in _CUES.items():
        for marca in marcas:
            patron, peso, solo_al_inicio = marca[0], marca[1], marca[2]
            guarda = marca[3] if len(marca) > 3 else None
            donde = apertura if solo_al_inicio else limpio
            encontrado = re.search(patron, donde)
            if not encontrado:
                continue
            peso *= _guard_factor(guarda, donde, encontrado, posicion)
            if peso <= 0.0:
                continue
            if mejor is None or peso > mejor[1]:
                mejor = (papel, peso, encontrado.group(0).strip())

    # Y ademas, lo que se deduce de **que** se habla en la frase, que es lo que
    # cubre las mil formas de decir lo mismo que no estan escritas arriba. No
    # es solo un recambio para cuando no hay formula: compite con ella. El
    # descuento hace que una formula clara gane siempre, pero una marca floja
    # ("luego") no deberia tapar un aviso entero ("si te lo saltas luego no
    # arranca"), y antes lo tapaba.
    for sentido in infer(texto):
        papel = _POR_SENTIDO.get(sentido.intent)
        if papel is None:
            continue
        peso = sentido.score * MEANING_DISCOUNT
        if papel is SegmentRole.OUTRO and posicion < OUTRO_POSITION:
            peso *= OUTRO_EARLY_FACTOR
        if mejor is None or peso > mejor[1]:
            mejor = (papel, round(peso, 3), sentido.why)
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
        posicion = frase.start / duration if duration > 0 else 0.5
        encaje = _match(frase.text, posicion)
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


#: Cuantos tramos caben en el resumen antes de que deje de ser un resumen.
SUMMARY_MAX = 12


def summarize(segmentos: list[NarrativeSegment], maximo: int = SUMMARY_MAX) -> str:
    """Una linea con la estructura que se entendio, para poder revisarla.

    Tiene que caber en una linea de terminal. Antes escribia **un tramo por
    frase**: en una guia de veinte minutos eran doscientos quince, y la nota
    del montaje pasaba a ser un muro de texto que nadie iba a leer. Cuando hay
    demasiados se cuenta por papel, que es lo que de verdad se quiere saber.
    """
    if not segmentos:
        return "sin estructura reconocible"
    if len(segmentos) <= maximo:
        return " · ".join(f"{s.role.value} {s.duration:.0f}s" for s in segmentos)

    from collections import Counter

    veces: Counter[str] = Counter()
    tiempo: dict[str, float] = {}
    for s in segmentos:
        veces[s.role.value] += 1
        tiempo[s.role.value] = tiempo.get(s.role.value, 0.0) + s.duration
    partes = [
        f"{papel} x{n} ({tiempo[papel] / 60:.0f} min)" if tiempo[papel] >= 90
        else f"{papel} x{n} ({tiempo[papel]:.0f}s)"
        for papel, n in veces.most_common()
    ]
    return f"{len(segmentos)} tramos: " + " · ".join(partes)

"""Presets de estilo: las reglas de montaje, como datos.

Un estilo no es una plantilla de efectos: es un conjunto de *reglas* que el
planner aplica al material concreto que tenga delante. Por eso viven en JSON y
se pueden anadir estilos nuevos sin tocar una linea de codigo.

Cada estilo define tambien sus **bandas de saturacion**: cuantos cortes por
minuto, cuanto overlay y cuanto texto en pantalla considera "en el punto". Lo
que en una guia es sobrecarga, en un short de gameplay es lo normal.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

from ..errors import PlanError

#: Presets que vienen con el proyecto.
BUILTIN_STYLES_DIR = Path(__file__).resolve().parent.parent.parent / "styles"


class Band(BaseModel):
    """Rango objetivo de una metrica. Fuera de el, el balanceador actua."""

    lo: float
    hi: float

    def contains(self, value: float) -> bool:
        return self.lo <= value <= self.hi

    def distance(self, value: float) -> float:
        """Cuanto se sale del rango (0 si esta dentro)."""
        if value < self.lo:
            return self.lo - value
        if value > self.hi:
            return value - self.hi
        return 0.0

    def scaled(self, factor: float) -> "Band":
        """Reescala la banda con el deslizador de intensidad."""
        return Band(lo=self.lo * factor, hi=self.hi * factor)


class RoleRules(BaseModel):
    """Cuanto se aprieta el recorte segun **que parte del video** sea.

    Las partes de una guia no valen lo mismo. La intro se la salta casi todo el
    mundo, el cierre tampoco lo ve nadie entero, y una digresion es justo lo que
    sobra: ahi se puede recortar mas. Un aviso ("ojo, sin esto no funciona") es
    el momento que la gente viene a buscar, y ahi no se toca nada.

    El numero es cuanto se aprieta respecto al ritmo normal del estilo: 1.0 es
    igual que el resto, mas de 1 recorta pausas mas cortas y deja menos aire, y
    0 no recorta nada en absoluto.
    """

    intro: float = 1.5
    step: float = 1.0
    #: Un aviso se recorta con la mitad de mano, no con ninguna. Poner 0 (no
    #: tocar nada) suena bien y deja dentro pausas de dos segundos enteras, que
    #: son aire muerto en cualquier parte del video. Con 0.5 se sigue quitando
    #: lo que sobra de verdad y se conserva el doble de aire alrededor, que es
    #: lo que hace que la frase importante caiga con peso.
    warning: float = 0.5
    tip: float = 0.85
    recap: float = 1.2
    outro: float = 1.6
    aside: float = 1.6
    body: float = 1.0

    def factor(self, role: str) -> float:
        return float(getattr(self, role, 1.0))


class PacingRules(BaseModel):
    """Como se decide que entra en el montaje y a que ritmo."""

    remove_silence: bool = True
    #: solo se recortan silencios mas largos que esto
    silence_min: float = 0.6
    #: cuanto se deja del silencio recortado, para que no suene atropellado
    silence_keep: float = 0.12
    #: margen ANTES de que vuelva la voz. Es el mas critico: el ataque de una
    #: palabra es suave y empieza antes de lo que marca el detector, asi que
    #: cortar justo ahi se come la primera consonante.
    speech_pad: float = 0.12
    #: margen DESPUES de que acabe la voz. Puede ser menor: la cola de una
    #: palabra se apaga sola y recortarla no se nota.
    tail_pad: float = 0.07
    #: cuanto silencio se deja al principio del video. Nadie quiere ver dos
    #: segundos de nada antes de que empiece a hablar.
    head_keep: float = 0.25
    remove_fillers: bool = False
    #: un clip mas corto que esto no se sostiene
    min_clip: float = 0.9
    #: banda objetivo de cortes por minuto
    cuts_per_minute: Band = Field(default_factory=lambda: Band(lo=6, hi=18))
    #: cuanto se aprieta el recorte en cada parte del video
    roles: RoleRules = Field(default_factory=RoleRules)
    #: A cuanto se acelera una espera que tu mismo anuncias ("esto tarda un
    #: rato"). Cortarla entera es lo facil y es peor: quien mira quiere **ver**
    #: que el proceso pasa, no fiarse de que paso. A 8x, medio minuto de
    #: instalacion son cuatro segundos en los que se ve la barra avanzar.
    wait_speed: float = 8.0
    #: Y si aun asi queda larga, se acelera mas hasta caber en esto.
    wait_max_seconds: float = 4.0
    #: Espera minima para que compense acelerarla en vez de recortarla.
    wait_min_seconds: float = 2.5


class CaptionRules(BaseModel):
    enabled: bool = True
    max_chars: int = 34
    max_words: int = 6
    max_duration: float = 3.2
    #: pausa entre palabras que fuerza cambio de linea
    split_gap: float = 0.45
    style: str = "default"
    position: str = "bottom"


class EmphasisRules(BaseModel):
    """Zooms y movimiento de camara anadido."""

    punch_in: bool = True
    #: cuanto amplia el zoom de enfasis
    punch_zoom: float = 1.18
    #: tope cuando el zoom encuadra algo concreto (un boton que nombras). Mas
    #: que esto en una grabacion de pantalla ya se ve el recorte: 1,45 sobre
    #: 1080p es recortar a 745 lineas y volver a subirlas.
    punch_zoom_max: float = 1.45
    #: que fraccion del ancho de la imagen quieres que ocupe eso que nombras.
    #: Un tercio es lo que hace un editor: lo bastante grande para leerlo, lo
    #: bastante pequeno para no perder de vista donde esta.
    punch_target_share: float = 0.32
    punch_seconds: float = 1.6
    #: separacion minima entre dos zooms, para que no maree
    punch_min_gap: float = 6.0
    max_punch_per_minute: float = 4.0
    #: no meter zoom si el plano ya se mueve mas que esto (0..1)
    max_motion_for_punch: float = 0.45
    #: cuanto sigue acercandose el zoom mientras aguanta, como fraccion del
    #: propio zoom. Cero lo deja clavado, que es lo que hace que una grabacion
    #: de pantalla parezca una captura fija.
    punch_drift: float = 0.03
    ken_burns: bool = False
    ken_burns_zoom: float = 1.06


class BrollRules(BaseModel):
    enabled: bool = True
    max_per_minute: float = 2.0
    min_gap: float = 8.0
    default_seconds: float = 2.6
    mode: str = "full"
    #: nunca tapar mas de esta fraccion del montaje
    max_coverage: float = 0.25


def budget(per_minute: float, duration: float, min_duration: float = 0.0) -> int:
    """Cuantos efectos de un tipo caben en un montaje de esa duracion.

    Truncar el producto deja en cero cualquier video corto: a 1,2 efectos por
    minuto, un montaje de 47 segundos da 0,94, que `int()` convierte en "ninguno".
    Por eso no salia **ni un** material de apoyo en la guia de ejemplo, y no
    habia forma de notarlo salvo contando. Se redondea, y si el montaje da para
    al menos uno, se permite uno.
    """
    if duration < max(min_duration, 1e-6):
        return 0
    return max(1, round(per_minute * duration / 60.0))


class CalloutRules(BaseModel):
    """Recuadros sobre lo que se nombra en pantalla.

    Solo se activan donde el OCR y el transcript coinciden, asi que sin
    Tesseract instalado el estilo sigue funcionando y simplemente no salen.
    """

    enabled: bool = True
    max_per_minute: float = 1.5
    min_gap: float = 12.0
    seconds: float = 1.8
    #: grosor del trazo como fraccion de la altura del fotograma
    thickness: float = 0.004
    #: color del recuadro en hexadecimal RGB
    color: str = "FFD200"

    # -- y como se ve, que es cosa del estilo ---------------------------------
    #
    # Un recuadro de un trazo y un color se pierde sobre una imagen movida y con
    # muchos colores, que es exactamente lo que es un gameplay. Con esto un
    # estilo puede darle la cara de su juego sin tocar una linea de codigo.

    #: Filo oscuro pegado por fuera del trazo. Es lo que hace que el recuadro se
    #: vea igual sobre un cielo claro que sobre un suelo oscuro. Vacio lo quita.
    edge_color: str = ""
    #: Relleno translucido dentro del recuadro, 0..1. Un panel de juego oscurece
    #: lo que resalta en vez de solo rodearlo. 0 lo quita.
    fill: float = 0.0
    #: Y el color de ese relleno; vacio usa el del recuadro.
    fill_color: str = ""
    #: Esquinas marcadas, en fraccion del lado menor del recuadro. Es lo que mas
    #: "interfaz de juego" hace de todo. 0 las quita.
    corner: float = 0.0
    #: Color de las esquinas; vacio usa el del recuadro.
    corner_color: str = ""
    #: Etiqueta con el nombre de lo que se recuadra, pegada encima. En una guia
    #: de un juego ayuda: el recuadro dice **donde** y la etiqueta dice **que**,
    #: y asi se entiende sin rebobinar.
    label: bool = False
    #: Color de la caja de esa etiqueta.
    label_color: str = "#1f4fd8"


class ChapterRules(BaseModel):
    enabled: bool = True
    #: no crear capitulos mas cortos que esto
    min_seconds: float = 45.0
    #: cuanto dura el rotulo en pantalla
    card_seconds: float = 2.2
    show_cards: bool = True


class LabelRules(BaseModel):
    """Rotulos de seccion: la caja de color que dice donde estas.

    No es la tarjeta de capitulo. La tarjeta **anuncia el cambio** al empezar;
    el rotulo es un **recordatorio** para quien llega a mitad de seccion y no
    sabe de que se esta hablando. Por eso sale despues, y solo si la seccion es
    lo bastante larga como para que haga falta recordarlo.
    """

    enabled: bool = True
    #: color de la caja
    color: str = "#1f4fd8"
    #: por debajo de esto, la tarjeta del principio ya basta
    min_chapter_seconds: float = 90.0
    #: cuanto se queda en pantalla
    seconds: float = 3.2
    #: cuanto espera desde que acaba la tarjeta de capitulo, para no decir dos
    #: veces lo mismo a la vez
    after_card: float = 8.0


class TransitionRules(BaseModel):
    enabled: bool = True
    default: str = "fade"
    duration: float = 0.25
    #: fraccion de los cortes que llevan transicion; el resto son cortes secos
    fraction: float = 0.2


class GradeRules(BaseModel):
    preset: str = "neutral"
    intensity: float = 0.35


class MusicRules(BaseModel):
    enabled: bool = False
    gain_db: float = -20.0
    duck: bool = True


class VoiceRules(BaseModel):
    """Tratamiento de la voz antes de masterizar.

    Es lo que mas cambia la sensacion de calidad en una guia, y lo que nadie
    nota cuando esta bien hecho. El orden importa: primero se quita lo que
    sobra (retumbe, ruido), despues se doma lo que pica (sibilancia) y solo al
    final se comprime, para no estar comprimiendo basura.
    """

    enabled: bool = True
    #: Corte de graves. Por debajo de 80 Hz una voz no tiene nada, pero si lo
    #: tienen el aire acondicionado, el trafico y los golpes en la mesa.
    highpass_hz: float = 80.0
    #: Reduccion de ruido en dB. Conservador a proposito: pasarse deja la voz
    #: con un timbre metalico peor que el ruido que quita. 0 lo desactiva.
    denoise_db: float = 0.0
    #: Cuanto se doman las eses, 0..1. 0 lo desactiva.
    deess: float = 0.35
    #: Compresion para igualar el nivel entre frases. El objetivo es que no
    #: haya que tocar el volumen al cambiar de frase, no aplastar la voz: por
    #: debajo de unos 4 dB de variacion el resultado suena sin vida.
    compress: bool = True
    compress_ratio: float = 2.2
    #: Umbral de compresion en escala lineal (0.1 equivale a unos -20 dBFS).
    compress_threshold: float = 0.12


class RecallRules(BaseModel):
    """La tarjeta de "como vimos antes".

    Va en el estilo y no en el codigo porque su sitio y su color son una
    decision de look, no de montaje: un video de un juego quiere el marco de ese
    juego, y una guia de una app quiere uno neutro.
    """

    enabled: bool = True
    #: Alto de la tarjeta, en fraccion del fotograma.
    height: float = 0.34
    #: Forma de la tarjeta (ancho/alto en pantalla). 1.0 la deja **cuadrada**,
    #: que es como se ve una foto enmarcada; 0 la deja con la forma del
    #: material, que en un video es apaisada y parece un trozo de otro video en
    #: vez de una foto puesta aparte.
    aspect: float = 0.0
    #: Y su ancho maximo, para no llegar al centro donde van los subtitulos.
    max_width: float = 0.34
    #: Separacion del borde del fotograma.
    edge: float = 0.04
    #: Grosor del marco, en fraccion del lado menor de la tarjeta.
    border: float = 0.022
    #: Color del marco.
    border_color: str = "#F2F4F8"
    #: Banda de texto **dentro** del marco, abajo, en fraccion del alto de la
    #: tarjeta. Es lo que la convierte en una foto con su pie en vez de en un
    #: recorte con una etiqueta flotando encima. 0 la quita.
    bar: float = 0.0
    #: Texto fijo del pie. Si hay ademas un tema que recordar, se juntan.
    title: str = ""
    #: Color de la caja del pie cuando no hay banda (`bar` a 0).
    title_color: str = "#1f4fd8"


class SfxRules(BaseModel):
    enabled: bool = False
    max_per_minute: float = 3.0
    gain_db: float = -8.0


class StylePreset(BaseModel):
    """Un estilo completo."""

    name: str
    label: str
    description: str
    pacing: PacingRules = Field(default_factory=PacingRules)
    captions: CaptionRules = Field(default_factory=CaptionRules)
    emphasis: EmphasisRules = Field(default_factory=EmphasisRules)
    broll: BrollRules = Field(default_factory=BrollRules)
    callouts: CalloutRules = Field(default_factory=CalloutRules)
    chapters: ChapterRules = Field(default_factory=ChapterRules)
    labels: LabelRules = Field(default_factory=LabelRules)
    transitions: TransitionRules = Field(default_factory=TransitionRules)
    grade: GradeRules = Field(default_factory=GradeRules)
    music: MusicRules = Field(default_factory=MusicRules)
    sfx: SfxRules = Field(default_factory=SfxRules)
    recall: RecallRules = Field(default_factory=RecallRules)
    voice: VoiceRules = Field(default_factory=VoiceRules)
    #: metrica -> banda objetivo; las consume el motor de saturacion
    saturation: dict[str, Band] = Field(default_factory=dict)

    def band(self, metric: str) -> Band | None:
        return self.saturation.get(metric)


def _styles_dirs(extra: Path | None = None) -> list[Path]:
    dirs = [BUILTIN_STYLES_DIR]
    if extra:
        dirs.insert(0, extra)
    return [d for d in dirs if d.is_dir()]


@lru_cache(maxsize=32)
def _load_style_cached(name: str, extra_dir: Path | None = None) -> StylePreset:
    """Lee y valida el JSON del estilo. **No devolver esto tal cual**: ver abajo."""
    for directory in _styles_dirs(extra_dir):
        path = directory / f"{name}.json"
        if path.is_file():
            try:
                return StylePreset.model_validate(json.loads(path.read_text()))
            except (json.JSONDecodeError, ValueError) as exc:
                raise PlanError(
                    f"El estilo '{name}' tiene un formato invalido.", hint=str(exc)
                ) from exc

    disponibles = ", ".join(sorted(list_styles())) or "ninguno"
    raise PlanError(
        f"No existe el estilo '{name}'.",
        hint=f"Estilos disponibles: {disponibles}",
    )


def load_style(name: str, extra_dir: Path | None = None) -> StylePreset:
    """Carga un estilo por nombre, **en copia**.

    La cache guarda el fichero ya leido y validado, que es lo que cuesta; pero
    lo que sale de aqui es una copia, porque si no todo el mundo comparte el
    mismo objeto. Y eso ya mordio: un test apago los rotulos en "su" estilo y
    los apago en los demas.

    En un test es molesto; en el servidor de la API es un fallo de verdad, donde
    varios montajes se planifican en el mismo proceso: cualquier ajuste que un
    trabajo le hiciera a su estilo se lo encontraria el siguiente, y el sintoma
    seria un montaje raro de vez en cuando, sin forma de reproducirlo.
    """
    return _load_style_cached(name, extra_dir).model_copy(deep=True)


def list_styles(extra_dir: Path | None = None) -> list[str]:
    """Nombres de todos los estilos disponibles."""
    nombres: set[str] = set()
    for directory in _styles_dirs(extra_dir):
        nombres.update(p.stem for p in directory.glob("*.json"))
    return sorted(nombres)


def describe_styles(extra_dir: Path | None = None) -> list[StylePreset]:
    return [load_style(n, extra_dir) for n in list_styles(extra_dir)]

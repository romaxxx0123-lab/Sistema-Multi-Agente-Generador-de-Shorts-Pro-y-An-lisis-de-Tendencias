"""De reconocer **frases** a reconocer de que se esta hablando.

Todo lo anterior busca formulas: una lista de expresiones y, si la frase encaja
con una, hay senal. Funciona muy bien con las formas de decirlo que estan en la
lista, y **no existe** para las que no. Medido contra un conjunto de frases
escritas despues, sin mirar los patrones, reconocia el 37%. Dicho de otra
forma: de cada tres cosas que dirias, dos no las veia.

El problema no se arregla escribiendo mas patrones, porque las formas de decir
algo en castellano no se acaban nunca. Lo que si se acaba es de **cuantas cosas**
se habla en una guia. Asi que aqui no hay frases: hay

- **campos de significado** -- grupos de palabras que quieren decir lo mismo
  para el montaje: cosas que hace la maquina (comprimir, indexar, sincronizar,
  clonar...), cosas que miden el tiempo (rato, siglo, paciencia, despacio...),
  formas de ausentarse (irse, volver, fumar, mientras...), de peligro, de
  suprimir, de avanzar, de despedirse;

- **construcciones** -- moldes de la gramatica con un hueco dentro. "Se esta
  <gerundio>" dice que algo esta en marcha **ahora**, y lo dice igual con un
  verbo que nadie ha escrito en ninguna lista. "No hay quien lo <verbo>" es una
  hiperbole de duracion. "Como <subjuntivo>, <consecuencia>" es una amenaza.

y la senal sale de **combinar** las dos cosas. Un campo suelto no dice nada:
"comprimido" aparece igual en "se esta comprimiendo" que en "el archivo
comprimido ocupa la mitad". Lo que separa una de otra es que la primera trae
ademas una construccion de progreso y un ancla al presente.

Eso cambia como crece: una lista de frases cubre lo que tiene escrito, y seis
campos de veinte palabras con ocho construcciones cubren las combinaciones, que
son muchas mas de las que se pueden escribir a mano.

Sigue sin **entender**: no sabe de que va tu guia, no capta la ironia y no
inventa nada. Pero deja de exigirte que digas las cosas de una manera concreta,
que era la queja de verdad.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

from .text import (
    has_present_anchor,
    is_habitual,
    is_negated,
    is_relayed_greeting,
    normalize,
)

# ---------------------------------------------------------------------------
# Morfologia
# ---------------------------------------------------------------------------

#: El stemmer de Snowball para castellano: puro Python, unos pocos KB, y ya
#: hace lo que los patrones hacian a mano con `\w*`. "Descargando",
#: "descargas", "descargara" y hasta "instalacion" caen en la misma raiz.
try:  # pragma: no cover - depende del entorno
    import snowballstemmer

    _STEMMER = snowballstemmer.stemmer("spanish")
except Exception:  # pragma: no cover
    _STEMMER = None

#: Los irregulares que el stemmer no junta y que salen todo el rato. No es una
#: lista de frases: son seis verbos de los que mas se usan al hablar.
_IRREGULARES = {
    "voy": "ir", "vas": "ir", "va": "ir", "vamos": "ir", "vais": "ir",
    "van": "ir", "yendo": "ir", "fuera": "ir", "ido": "ir",
    "es": "ser", "son": "ser", "era": "ser", "eran": "ser", "sea": "ser",
    "esta": "estar", "estan": "estar", "estoy": "estar", "este": "estar",
    "hay": "haber", "ha": "haber", "han": "haber", "he": "haber",
    "doy": "dar", "das": "dar", "damos": "dar", "dale": "dar",
    "pongo": "poner", "pones": "poner", "pone": "poner", "puesto": "poner",
    "hago": "hacer", "haces": "hacer", "hace": "hacer", "hecho": "hacer",
}


#: Pronombres pegados al verbo. Al hablar salen constantemente ("asegurate",
#: "fijaos", "miralo", "ponerlo", "ensenaroslo") y el stemmer no los quita, asi
#: que "asegurate" y "asegurar" caian en raices distintas. Van de mas largo a
#: mas corto para que "melo" se quite antes que "lo".
_ENCLITICOS = (
    "seloS", "melos", "telos", "noslos", "oslos", "selos", "selas", "melas",
    "telas", "noslas", "oslas", "selo", "sela", "melo", "mela", "telo", "tela",
    "noslo", "nosla", "oslo", "osla", "los", "las", "les", "nos", "me", "te",
    "se", "lo", "la", "le", "os",
)
#: Terminaciones que solo hacen la palabra mas pequena o mas carinosa. Sin
#: esto, "despacito" y "despacio" son dos palabras distintas, y "ratito" hay
#: que escribirlo aparte de "rato".
_DIMINUTIVO = re.compile(r"^(.{3,}?)(ec|c)?(it|ill)([oaei]s?)$")
#: "Cuidadin", "poquitin": el diminutivo corto, que se lleva la vocal final.
_DIMINUTIVO_CORTO = re.compile(r"^(.{4,}?)(c)?in$")
#: Solo se quitan si lo que queda sigue siendo una palabra, no un muñon.
_MINIMO = 4


#: Lo que tiene que quedar detras para que eso fuera de verdad un pronombre
#: pegado: una forma verbal. Sin esta condicion, "vigila" perdia el "la" y se
#: quedaba en "vigi", y "pantalla" en "pantal". El pronombre solo se pega al
#: infinitivo, al gerundio y al imperativo, y los tres acaban asi.
_FORMAS_VERBALES = ("ar", "er", "ir", "ando", "endo", "a", "e")


def _sin_encliticos(palabra: str) -> str:
    for p in _ENCLITICOS:
        if not palabra.endswith(p) or len(palabra) - len(p) < _MINIMO:
            continue
        tronco = palabra[: -len(p)]
        if tronco.endswith(_FORMAS_VERBALES):
            # "asegurate" -> "asegura", "ponerlo" -> "poner", "fijaos" ->
            # "fija"; pero "vigila" y "estrella" se quedan como estan.
            return tronco
    return palabra


def _sin_diminutivo(palabra: str) -> str:
    """"Ratito" -> "rato", "cuidadin" -> "cuidado".

    Se quita el **infijo** y se deja la terminacion, que es como funciona el
    diminutivo en castellano: rat-it-o sobre rat-o. Quitar la terminacion
    entera daba munones ("ratit"), y eso no coincide con nada.
    """
    encaje = _DIMINUTIVO.match(palabra)
    if encaje:
        return encaje.group(1) + encaje.group(4)
    encaje = _DIMINUTIVO_CORTO.match(palabra)
    if encaje:
        return encaje.group(1) + "o"
    return palabra


@lru_cache(maxsize=4096)
def stem(palabra: str) -> str:
    """La raiz de una palabra, quitandole lo que solo es forma.

    Tres pasos, de fuera a dentro: el pronombre pegado detras ("asegura-TE"),
    el diminutivo ("despac-ITO") y la flexion, que es lo que hace Snowball.
    Cada uno cubre una familia entera de formas que antes habia que escribir a
    mano una por una.
    """
    if palabra in _IRREGULARES:
        return _IRREGULARES[palabra]
    limpia = _sin_diminutivo(_sin_encliticos(palabra))
    if limpia in _IRREGULARES:
        return _IRREGULARES[limpia]
    if _STEMMER is None:
        return limpia
    return _STEMMER.stemWord(limpia)


def stems(texto: str) -> set[str]:
    return {stem(p) for p in normalize(texto).split()}


def _raices(*palabras: str) -> frozenset[str]:
    """Las raices de un grupo de palabras, para escribir los campos en claro."""
    return frozenset(stem(p) for p in palabras)


# ---------------------------------------------------------------------------
# Campos de significado
# ---------------------------------------------------------------------------

#: Lo que hace la maquina mientras tu esperas.
PROCESO = _raices(
    "instalar", "cargar", "descargar", "copiar", "actualizar", "comprimir",
    "descomprimir", "sincronizar", "indexar", "verificar", "clonar", "compilar",
    "renderizar", "exportar", "importar", "convertir", "analizar", "escanear",
    "procesar", "calcular", "extraer", "formatear", "empaquetar", "optimizar",
    "arrancar", "iniciar", "buscar", "subir", "bajar", "restaurar", "migrar",
    "firmar", "generar", "construir", "desplegar", "actualizacion", "instalacion",
    "descarga", "copia", "sincronizacion", "trabajar", "avanzar", "correr",
)

#: Lo que mide el tiempo que se va en ello.
DURACION = _raices(
    "rato", "ratito", "tiempo", "siglo", "eternidad", "vida", "minuto", "hora",
    "dia", "semana", "largo", "lento", "despacio", "despacito", "tardar",
    "paciencia", "inmediato", "instantaneo",
    "ritmo", "pesado", "eterno", "interminable", "demorar", "lentitud",
)

#: Formas de decir que te vas o que te quedas mirando.
AUSENCIA = _raices(
    "piro", "volver", "dejar", "aprovechar",
    "fumar", "cafe", "agua", "cerveza", "cena", "merendar", "bano",
    "mientras", "esperar", "espera", "mirar", "contemplar", "descansar",
    "estirar", "pasear", "respiro", "descanso", "pausa", "brasa", "turra",
    # Sin "comer": comparte raiz con "como", que sale en cualquier frase
    # ("como quedan los colores").
)

#: Lo que sale en pantalla para decirte cuanto falta.
MEDIDOR = _raices(
    "porcentaje", "barra", "barrita", "rueda", "ruedecita", "circulito",
    "numerito", "contador", "progreso", "reloj", "cursor", "ciento",
)

#: Quitar, acortar, ahorrar.
SUPRESION = _raices(
    "saltar", "cortar", "resumir", "ahorrar", "sobrar", "editar",
    "rollo", "tostonazo", "toston", "aburrido", "aburrir", "pesado", "repetir",
    "sufrir", "molestar", "grano", "acortar", "recortar", "obviar", "omitir",
    "quitar", "edicion", "volando", "listo",
)

#: Lo que puede salir mal.
PELIGRO = _raices(
    "romper", "cargarse", "estrellar", "fastidiar", "liar", "fallar", "fallo",
    "error", "borrar", "perder", "petar", "cagar", "traste", "destrozar",
    "corromper", "estropear", "reventar", "equivocar", "equivocacion", "roto",
    "irrecuperable", "desastre", "descuido", "despiste", "delicado",
)

#: Pedir tiento.
CAUTELA = _raices(
    "cuidado", "cuidadito", "cuidadin", "ojo", "vigilar", "asegurar",
    "comprobar", "revisar", "atencion", "fijarse", "atento", "tiento",
    "precaucion", "aviso", "avisar",
)

#: Lo que no es opcional.
OBLIGACION = _raices(
    "obligatorio", "imprescindible", "necesario", "forzoso", "unico",
    "exacto", "tal", "clave", "critico", "fundamental", "esencial", "vital",
)

#: Moverse por el trabajo: de un paso al siguiente.
AVANCE = _raices(
    "siguiente", "primero", "segundo", "tercero", "cuarto", "quinto", "ultimo",
    "empezar", "terminar", "acabar", "entrar", "salir", "meter", "pasar",
    "turno", "bloque", "faena", "continuar", "seguir", "abrir", "cerrar",
    "volver", "tocar", "lio", "paso", "punto", "parte", "etapa", "fase",
)

#: Despedirse.
DESPEDIDA = _raices(
    "despedir", "despedida", "adios", "saludo", "abrazo", "gracias",
    "suscribir", "comentario", "proximo", "siguiente", "leer", "servir",
    "valer", "aguantar", "acompanar", "chao", "hasta",
)

CAMPOS: dict[str, frozenset[str]] = {
    "proceso": PROCESO,
    "duracion": DURACION,
    "ausencia": AUSENCIA,
    "medidor": MEDIDOR,
    "supresion": SUPRESION,
    "peligro": PELIGRO,
    "cautela": CAUTELA,
    "obligacion": OBLIGACION,
    "avance": AVANCE,
    "despedida": DESPEDIDA,
}

#: Frases hechas de varias palabras, que por raices sueltas no se ven.
_LOCUCIONES: dict[str, tuple[str, ...]] = {
    "duracion": (
        r"\bpara (largo|rato)\b",
        r"\bun buen rato\b", r"\bda tiempo (hasta )?(a|de|para)\b",
        r"\bno (es|va) inmediato\b",
    ),
    "supresion": (
        r"\bal grano\b", r"\ben vez de\b", r"\bno (merece|vale) la pena\b",
        r"\bno hace falta que\b", r"\bno aporta\b", r"\bpor encima\b",
        r"\bno (teneis|tienes) que ver\b", r"\bde nada\b",
        # "fuera" a secas solo suprime al final de la frase ("esto, fuera").
        # Como palabra suelta es el verbo ir, y entonces cualquier "vamos"
        # contaba como suprimir.
        r"\bfuera\s*$",
        r"\bmas de lo mismo\b", r"\b(os|te) lo cuento\b",
        r"\b(y|,)? ?listo\b\s*$", r"\bni (os|te) aburro\b",
    ),
    "peligro": (
        r"\bal traste\b", r"\bde cero\b", r"\bse (va|viene) abajo\b",
        r"\bla lias\b", r"\bmeter la pata\b",
    ),
    "obligacion": (r"\bsi o si\b", r"\btal cual\b", r"\bhay que\b", r"\btienes que\b"),
    "avance": (
        r"\ba por (el|la|lo)\b", r"\ben faena\b", r"\bal (lio|turron|ajo)\b",
    ),
    "despedida": (
        r"\bhasta (la|el) (proxima|proximo|semana)\b", r"\bnos (vemos|leemos)\b",
        r"\bpor hoy\b", r"\beso es todo\b", r"\bpoco mas\b",
        r"\bdar(os|te)? (bastante )?la (brasa|turra)\b", r"\bme piro\b",
    ),
    "ausencia": (r"\bmomento muerto\b", r"\btiempo muerto\b"),
}


# ---------------------------------------------------------------------------
# Construcciones: moldes con un hueco
# ---------------------------------------------------------------------------

#: Cada una es un molde de la gramatica. El hueco vale para cualquier verbo,
#: incluidos los que no estan en ningun campo, que es de donde sale la
#: generalizacion de verdad.
_CONSTRUCCIONES: tuple[tuple[str, str, str], ...] = (
    # algo esta en marcha AHORA MISMO
    ("progreso", r"\bse (esta|estan)\s+\w+(ando|endo)\b", "algo esta en marcha"),
    ("progreso", r"\bse (ha |han )?(puesto|ponen|pone) a\s+\w+(ar|er|ir)\b", "algo se pone en marcha"),
    ("progreso", r"\b(esta|estan|sigue|siguen)\s+\w+(ando|endo)\b", "algo sigue en marcha"),
    ("progreso", r"\blo (dejo|dejamos|dejas) \w+(ando|endo)\b", "lo dejas trabajando"),
    ("progreso", r"\bse (queda|quedan|va a quedar|estara)\b", "algo se queda asi"),
    ("progreso", r"\b(a|en) (su|lo) (bola|ritmo|aire|suyo)\b", "va a su aire"),
    ("lentitud", r"\b(va|van|iba|sigue|esto va)\s+\w*(despac|lent|pesad)\w*",
     "dices que va despacio"),
    # El gerundio suelto ("la rueda dando vueltas") no dice por si solo que
    # haya que esperar; vale solo acompanado, que es como se usa abajo.
    # Cuidado con el minimo de letras: "dando vueltas" tiene una sola de raiz.
    # Y con las palabras que acaban en -ando sin ser gerundios, que son pocas
    # pero una de ellas es "cuando".
    ("gerundio", r"\b(?!cuando\b|blando\b|bando\b|mando\b)\w+(ando|endo)\b",
     "algo esta en marcha"),
    # El imperativo negativo prohibe, y prohibir es avisar.
    ("prohibicion", r"\bno\s+((le|les|lo|la|los|las|te|os|se|me)\s+)?"
                    r"(des|deis|toques|toqueis|borres|borreis|cambies|cambieis"
                    r"|pulses|aceptes|cierres|quites|muevas|pongas|hagas"
                    r"|olvides|instales|actualices|se te ocurra)\b", "lo prohibes"),
    # hiperboles de duracion
    ("hiperbole", r"\bno hay quien (lo|la|le)?\s*\w+\b", "dices que no hay manera"),
    ("hiperbole", r"\b(tardar|acabar|terminar)\w*\s+(la vida|un siglo|siglos|una eternidad)\b", "exageras lo que tarda"),
    ("hiperbole", r"\bno\s+(se\s+)?(mueve|avanza|acaba|termina|tira|arranca"
                  r"|carga|responde|reacciona|va)\b", "dices que no avanza"),
    ("hiperbole", r"\bni de (coña|cona|broma)\b|\bni a tiros\b", "exageras lo que cuesta"),
    ("hiperbole", r"\blleva (asi|ya)\b", "dices que lleva asi un rato"),
    ("hiperbole", r"\bda tiempo (hasta )?(a|de|para)\b", "dices que da tiempo a otra cosa"),
    # ausentarse
    ("me_ausento", r"\b(me voy|nos vamos|me piro|salgo|vuelvo|ahora vengo)\b", "te ausentas"),
    ("me_ausento", r"\b(voy|vamos) a por\b", "vas a por algo"),
    # Darle a algo es ponerlo en marcha: lo que viene detras es la espera.
    ("lo_lanzo", r"\b(le )?(he |hemos |has )?(dado|damos|doy|das|dale) a\b", "acabas de lanzarlo"),
    # amenazas condicionales
    ("amenaza", r"\bcomo\s+((te|se|os|le|lo|la)\s+)?\w+(es|as|eis|en)\b", "pones una condicion con consecuencia"),
    ("amenaza", r"\bsi\b.{0,30}\bno\s+\w+(a|e|as|es)\b", "dices que si no, algo falla"),
    ("amenaza", r"\bno se te ocurra\b", "lo prohibes"),
    ("amenaza", r"\bes donde\b.{0,25}\b(se|la|el)\b", "senalas donde se falla"),
    ("amenaza", r"\bun (fallo|error|despiste|descuido|tonteria)\b.{0,25}\by\b", "dices que un fallo lo tira todo"),
    ("amenaza", r"\bbajo ningun concepto\b|\bni se te pase\b", "lo prohibes del todo"),
    # suprimir
    ("fuera", r"\b(esto|eso|aqui|todo esto|esta parte)\b.{0,40}\b(sobra|fuera|no va)\b", "dices que sobra"),
    ("fuera", r"\b(lo|la|las|los) (dejo|dejamos) fuera\b", "lo dejas fuera"),
    ("fuera", r"\bno (pasa|hay) nada (interesante|de interes)\b", "dices que ahi no pasa nada"),
    ("fuera", r"\b(paso|pasamos|voy|vamos|lo paso)\b.{0,15}\b(volando|rapido|por encima|de puntillas)\b", "pasas por encima"),
    ("fuera", r"\bde aqui (hasta|al) (el )?final\b.{0,25}\b(mismo|igual|nada)\b", "dices que lo que queda es igual"),
    # avanzar
    ("transicion", r"\b(cerr|cierr|sal|guard|termin|acab)\w*\b.{0,25}\b(y|luego|despues)\b.{0,15}\b(abr|entr|vam|pas|met|empez)\w*", "cierras una cosa y abres otra"),
    # Detras tiene que venir un sitio, no un infinitivo: "vamos AL panel" se
    # mueve y "vamos A VER como quedan los colores" no se mueve a ningun lado,
    # es futuro. Sin esa diferencia, media guia era un cambio de paso.
    ("transicion", r"\b(nos metemos|nos vamos|saltamos|pasamos|vamos)\s+(ya\s+)?"
                   r"(al\b|con\b|en\b|a (la|el|los|las|por)\b)", "pasas a otra cosa"),
    ("transicion", r"\b(le )?toca(mos)?\s+(ahora\s+)?(el|la|los|las|turno)\b", "le toca a otra cosa"),
    ("transicion", r"\b(empezamos|empiezo|arrancamos|arranco|seguimos)\s+(por|con)\b", "empiezas por algo"),
    ("transicion", r"\b(me paso|nos pasamos|me muevo)\s+a[l]?\b", "te pasas a otro sitio"),
    # despedirse
    ("cierre", r"\b(me despido|os dejo|lo dejamos|nos despedimos)\b", "te despides"),
    ("cierre", r"\bes todo lo que\b", "dices que eso es todo"),
    ("cierre", r"\b(si )?(os|te) ha (servido|gustado|valido|molado|encantado|ayudado)\b", "te despides pidiendo algo"),
)


@dataclass(frozen=True)
class Sense:
    """Lo que se deduce de una frase, y por que."""

    intent: str
    score: float
    why: str


@dataclass(frozen=True)
class Evidence:
    """Que campos y que construcciones aparecen en una frase."""

    campos: dict[str, tuple[str, ...]]
    construcciones: dict[str, str]
    negada: bool
    habitual: bool
    presente: bool

    def tiene(self, *nombres: str) -> bool:
        return all(n in self.campos or n in self.construcciones for n in nombres)

    def palabra(self, campo: str) -> str:
        if campo in self.construcciones:
            return self.construcciones[campo]
        valores = self.campos.get(campo)
        return valores[0] if valores else ""


def read(texto: str) -> Evidence:
    """Lee una frase y devuelve de que habla, sin decidir nada todavia."""
    limpio = normalize(texto)
    palabras = limpio.split()
    raices = [stem(p) for p in palabras]

    campos: dict[str, list[str]] = {}
    for nombre, campo in CAMPOS.items():
        vistas = [p for p, r in zip(palabras, raices) if r in campo]
        if vistas:
            campos[nombre] = vistas
    for nombre, locuciones in _LOCUCIONES.items():
        for patron in locuciones:
            encaje = re.search(patron, limpio)
            if encaje:
                campos.setdefault(nombre, []).append(encaje.group(0))

    construcciones: dict[str, str] = {}
    for nombre, patron, explicacion in _CONSTRUCCIONES:
        if nombre in construcciones:
            continue
        if re.search(patron, limpio):
            construcciones[nombre] = explicacion

    return Evidence(
        campos={k: tuple(v) for k, v in campos.items()},
        construcciones=construcciones,
        # La negacion se mira sobre la frase entera: aqui no hay una marca
        # concreta a la que mirarle lo que tiene delante.
        negada=any(
            is_negated(limpio, encaje.start())
            for encaje in re.finditer(r"\w+", limpio)
            if stem(encaje.group(0)) in PROCESO | SUPRESION | PELIGRO
        ),
        habitual=is_habitual(limpio),
        presente=has_present_anchor(limpio),
    )


# ---------------------------------------------------------------------------
# De la evidencia a la senal
# ---------------------------------------------------------------------------

#: Una palabra de aviso usada como nombre no avisa: "esto es CLAVE de registro".
#: Es la misma comprobacion que hacen los patrones, aplicada aqui tambien para
#: que ampliar la cobertura no reabra la puerta que ya estaba cerrada.
def _es_sustantivo(limpio: str, palabra: str) -> bool:
    from .text import is_a_noun_here

    encaje = re.search(rf"\b{re.escape(palabra)}\b", limpio)
    if encaje is None:
        return False
    return is_a_noun_here(limpio, encaje.start(), encaje.end())


def _nombrado(limpio: str, palabra: str) -> bool:
    """Si la palabra esta usada como nombre de una cosa, no como accion.

    Mas estrecha que `is_a_noun_here` a proposito: aqui el unico indicio que
    vale es el complemento con "de" ("el boton DE borrar"), porque el articulo
    no sirve. En "aqui todo el mundo LA caga", ese "la" no es un articulo, es
    un pronombre, y descartarlo por eso se comia el aviso.
    """
    encaje = re.search(rf"\b{re.escape(palabra)}\b", limpio)
    if encaje is None:
        return False
    previa = limpio[: encaje.start()].split()
    if previa and previa[-1] in ("de", "del"):
        return True
    from .text import followed_by_complement

    return followed_by_complement(limpio, encaje.end())


def _impersonal(limpio: str, palabra: str) -> bool:
    """Si la accion le pasa a la cosa en vez de hacerla tu.

    "Aqui el menu SE CORTA si la ventana es pequena" describe lo que le pasa al
    menu; "aqui lo corto" anuncia un corte del montaje. Las dos llevan la misma
    raiz y solo una pide algo. El "se" justo delante es lo que las separa.
    """
    return bool(re.search(rf"\bse\s+{re.escape(palabra)}\b", limpio))


def _empieza_por(limpio: str, campo: frozenset[str]) -> bool:
    """Si la frase **arranca** con una palabra del campo: suena a imperativo.

    "Vigila que la casilla este marcada" pide tiento; "la casilla de vigilancia"
    no. La diferencia es que en la primera el verbo abre la frase.
    """
    primeras = limpio.split()[:2]
    return any(stem(p) in campo for p in primeras)


def infer(texto: str) -> list[Sense]:
    """Que pide el montaje esta frase, por lo que significa.

    Ninguna regla se dispara con **una** senal suelta. Eso es deliberado: casi
    todas las palabras de los campos aparecen tambien en frases que no piden
    nada ("el archivo comprimido ocupa la mitad" habla de comprimir). Lo que
    convierte una palabra en senal es que venga acompanada: de una construccion
    que la ponga en marcha, de un ancla al presente, o de otro campo.
    """
    e = read(texto)
    limpio = normalize(texto)
    salida: list[Sense] = []

    def anadir(intent: str, score: float, *partes: str) -> None:
        salida.append(Sense(intent, score, " y ".join(p for p in partes if p)))

    vivo = e.presente and not e.habitual

    # -- toca esperar ------------------------------------------------------
    # La hiperbole va la primera y fuera del guardia de negacion, porque negar
    # **es** su forma: "esto no acaba nunca" y "no hay quien lo pare" dicen que
    # tarda muchisimo, y el guardia las tumbaria por llevar un "no".
    if (
        not e.habitual
        and "hiperbole" in e.construcciones
        and (e.campos.keys() & {"proceso", "medidor", "duracion"} or e.presente)
    ):
        anadir("espera", 0.85, e.construcciones["hiperbole"])
    elif not e.negada and not e.habitual:
        if "lentitud" in e.construcciones:
            # "Va despacito el pobre" no necesita ancla: decir que algo va
            # despacio ya es decir que esta pasando ahora.
            anadir("espera", 0.8, e.construcciones["lentitud"])
        elif "progreso" in e.construcciones and (e.presente or "proceso" in e.campos):
            anadir("espera", 0.9, e.construcciones["progreso"])
        elif e.tiene("proceso", "lo_lanzo"):
            anadir("espera", 0.85, f'acabas de lanzar "{e.palabra("proceso")}"')
        elif "gerundio" in e.construcciones and "proceso" in e.campos:
            # El gerundio de un proceso es el proceso en marcha: "el disco a
            # tope trabajando", "se quedo copiando".
            anadir("espera", 0.85, f'"{e.palabra("proceso")}" en marcha')
        elif e.tiene("proceso", "me_ausento"):
            anadir("espera", 0.9, f'"{e.palabra("proceso")}" esta en marcha',
                   e.construcciones["me_ausento"])
        elif e.tiene("proceso", "duracion") and e.presente:
            anadir("espera", 0.85, f'"{e.palabra("proceso")}" tarda')
        elif e.tiene("medidor") and (
            "hiperbole" in e.construcciones or
            e.campos.keys() & {"duracion"}
            or e.construcciones.keys() & {"progreso", "gerundio"}
            or vivo
        ):
            anadir("espera", 0.8, f'miras "{e.palabra("medidor")}"')
        elif len(e.campos.get("duracion", ())) >= 2 and e.presente:
            anadir("espera", 0.8, f'dices que esto va "{e.palabra("duracion")}"')
        elif e.tiene("duracion", "ausencia") and e.presente:
            anadir("espera", 0.8, f'"{e.palabra("ausencia")}" mientras tarda')
        elif e.tiene("ausencia") and e.presente and (
            "mientras" in limpio or len(e.campos["ausencia"]) >= 2
        ):
            anadir("espera", 0.75, "te pones a otra cosa mientras tanto")

    # -- esto se salta -----------------------------------------------------
    if not e.habitual:
        locucion = any(
            re.search(p, limpio)
            for p in (r"\bno (merece|vale) la pena\b", r"\bno hace falta que\b",
                      r"\ben vez de\b", r"\bal grano\b")
        )
        if "fuera" in e.construcciones:
            anadir("salto", 0.9, e.construcciones["fuera"])
        elif locucion and ("supresion" in e.campos or "proceso" not in e.campos):
            anadir("salto", 0.85, "dices que no hace falta verlo")
        elif (
            e.tiene("supresion")
            and (e.presente or len(e.campos["supresion"]) >= 2)
            and not _impersonal(limpio, e.palabra("supresion"))
        ):
            anadir("salto", 0.85, f'"{e.palabra("supresion")}"')

    # -- ojo con esto ------------------------------------------------------
    # Negado, el peligro dice lo contrario: "esto NO es delicado, se puede
    # tocar sin miedo" tranquiliza, no avisa.
    peligro = "peligro" in e.campos and not e.habitual and not e.negada
    apoyo = e.campos.keys() & {"peligro", "obligacion", "cautela", "supresion"}
    if "amenaza" in e.construcciones and (apoyo or peligro):
        anadir("aviso", 0.88, e.construcciones["amenaza"])
    elif "prohibicion" in e.construcciones:
        anadir("aviso", 0.9, e.construcciones["prohibicion"])
    elif peligro and e.presente and not _nombrado(limpio, e.palabra("peligro")):
        anadir("aviso", 0.85, f'puede "{e.palabra("peligro")}"')
    elif "cautela" in e.campos and (
        _empieza_por(limpio, CAUTELA) or e.presente
    ) and not _es_sustantivo(limpio, e.palabra("cautela")):
        anadir("aviso", 0.85, f'pides tiento: "{e.palabra("cautela")}"')
    elif "obligacion" in e.campos and e.presente and not _es_sustantivo(
        limpio, e.palabra("obligacion")
    ):
        anadir("aviso", 0.8, f'no es opcional: "{e.palabra("obligacion")}"')

    # -- paso siguiente ----------------------------------------------------
    # "Seguimos con LA MISMA pantalla de antes" no pasa a nada: se queda.
    sigue_igual = bool(re.search(r"\b(la misma|el mismo|lo mismo|igual que)\b", limpio))
    if "transicion" in e.construcciones and not sigue_igual:
        anadir("paso", 0.8, e.construcciones["transicion"])
    elif (
        "avance" in e.campos
        and len(e.campos["avance"]) >= 2
        and _empieza_por(limpio, AVANCE | frozenset({stem("una"), stem("lo"), stem("ya")}))
        # "el ultimo bloque de codigo es el mas corto" lleva dos palabras de
        # avance y no avanza nada: las esta usando como nombres.
        and not _es_sustantivo(limpio, e.palabra("avance"))
    ):
        anadir("paso", 0.75, f'avanzas: "{" ".join(e.campos["avance"][:2])}"')

    # -- se acaba ----------------------------------------------------------
    # "Me despido DE la version antigua" no despide el video: se despide de una
    # cosa. Un cierre de verdad no lleva complemento, o lleva a quien te
    # despides.
    despide_de_algo = bool(
        re.search(r"\b(me despido|nos despedimos) de (?!vosotros|todos|ti|ustedes)", limpio)
    )
    if "cierre" in e.construcciones and not despide_de_algo:
        anadir("cierre", 0.85, e.construcciones["cierre"])
    elif (
        len(e.campos.get("despedida", ())) >= 2
        and not is_relayed_greeting(limpio)
        # Basta con que una de las dos no sea un nombre: en "nos leemos en los
        # comentarios", "comentarios" lo es y "nos leemos" no, y despide.
        and not all(_es_sustantivo(limpio, w) for w in e.campos["despedida"])
    ):
        anadir("cierre", 0.8, f'te despides: "{" ".join(e.campos["despedida"][:2])}"')

    return salida

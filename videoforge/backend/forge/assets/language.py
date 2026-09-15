"""El puente entre lo que dices y el idioma en el que busca el banco.

Este modulo existe por un fallo concreto, y conviene contarlo porque explica su
forma. A los bancos de stock se les mandaba la consulta **en espanol** y sin
decirles el idioma:

    {"query": "impresora", ...}          # Pexels
    {"key": ..., "q": "impresora", ...}  # Pixabay

Contestan con etiquetas en ingles (`printer`, `office`, `paper`). Y despues la
regla de coherencia (`assets/coherence.py`) exige que **"impresora"** este entre
esas etiquetas. No esta nunca. Es decir: la regla que evita que salga Minecraft
cuando hablas de Palworld habia dejado el camino del stock practicamente muerto
para quien habla espanol. El fallo no estaba en la regla, estaba en preguntar en
un idioma y exigir la respuesta en otro.

Lo que hace falta de verdad para esto es un **traductor**, no un clasificador de
imagenes: es el hallazgo de `ANALISIS-INSERCION-MULTIMEDIA.md`. Un modelo local
pequeno (opus-mt es->en en ONNX, ~80 MB) lo resolveria entero, y el protocolo
`Translator` de aqui es el sitio donde se enchufa el dia que sus pesos se puedan
traer y comprobar. Mientras no se puedan, no se mete: este proyecto no mete nada
que no se pueda medir.

Lo que si se puede hacer hoy es un **glosario explicito** de los terminos que de
verdad se nombran en una guia. Es limitado y lo dice: si el termino no esta, la
consulta se manda tal cual con el idioma puesto -- lo que le vale a Pixabay, que
localiza sus etiquetas, y no a Pexels, que responde siempre en ingles -- y si
entonces la coherencia no se puede confirmar, no se pone nada. Un hueco no se
nota; una imagen equivocada la ve todo el mundo.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from .coherence import normalize_tag, tag_stem

#: Espanol -> ingles, para lo que se nombra en una guia. Cada entrada esta aqui
#: porque es una palabra que se dice senalando algo, que es cuando el montaje
#: busca material de apoyo. Los verbos y lo abstracto no entran: de "explicar"
#: no hay imagen que ensenar.
GLOSSARY: dict[str, tuple[str, ...]] = {
    # -- ordenador e interfaz ---------------------------------------------
    "ordenador": ("computer", "pc"),
    "portatil": ("laptop", "notebook"),
    "pantalla": ("screen", "display", "monitor"),
    "monitor": ("monitor", "display"),
    "teclado": ("keyboard",),
    "raton": ("mouse", "computer mouse"),
    "puntero": ("cursor", "pointer"),
    "cursor": ("cursor",),
    "boton": ("button",),
    "menu": ("menu",),
    "pestana": ("tab",),
    "ventana": ("window",),
    "carpeta": ("folder",),
    "fichero": ("file",),
    "archivo": ("file", "archive"),
    "ajustes": ("settings",),
    "configuracion": ("settings", "configuration"),
    "navegador": ("browser", "web browser"),
    "aplicacion": ("app", "application"),
    "programa": ("software", "program"),
    "codigo": ("code", "source code"),
    "terminal": ("terminal", "command line"),
    "consola": ("console",),
    "servidor": ("server",),
    "nube": ("cloud",),
    "red": ("network",),
    "internet": ("internet",),
    "wifi": ("wifi", "wireless"),
    "router": ("router",),
    "cable": ("cable", "wire"),
    "enchufe": ("plug", "socket"),
    "bateria": ("battery",),
    "cargador": ("charger",),
    "movil": ("phone", "smartphone"),
    "telefono": ("phone", "telephone"),
    "tableta": ("tablet",),
    "camara": ("camera",),
    "microfono": ("microphone", "mic"),
    "auriculares": ("headphones", "earphones"),
    "altavoz": ("speaker", "loudspeaker"),
    "impresora": ("printer",),
    "escaner": ("scanner",),
    "disco": ("disk", "hard drive"),
    "memoria": ("memory", "ram"),
    "tarjeta": ("card",),
    "grafica": ("graphics card", "gpu"),
    "procesador": ("processor", "cpu"),
    "placa": ("motherboard",),
    "ventilador": ("fan",),
    "refrigeracion": ("cooling",),
    "torre": ("computer case", "tower"),
    "contrasena": ("password",),
    "usuario": ("user",),
    "cuenta": ("account",),
    "correo": ("email", "mail"),
    "mensaje": ("message",),
    "aviso": ("warning", "alert"),
    "error": ("error",),
    "grafico": ("chart", "graph"),
    "tabla": ("table", "spreadsheet"),
    "hoja": ("sheet", "spreadsheet"),
    "documento": ("document",),
    "formulario": ("form",),
    "factura": ("invoice", "bill"),
    "copia": ("backup", "copy"),
    "actualizacion": ("update",),
    "descarga": ("download",),
    "virus": ("virus", "malware"),
    "antivirus": ("antivirus",),
    "juego": ("game", "video game"),
    "mando": ("controller", "gamepad"),
    "consola de juegos": ("game console",),
    # -- escritorio y oficina ---------------------------------------------
    "mesa": ("desk", "table"),
    "escritorio": ("desk", "desktop"),
    "silla": ("chair",),
    "lampara": ("lamp",),
    "libro": ("book",),
    "cuaderno": ("notebook",),
    "boligrafo": ("pen",),
    "lapiz": ("pencil",),
    "papel": ("paper",),
    "calendario": ("calendar",),
    "reloj": ("clock", "watch"),
    "oficina": ("office",),
    "reunion": ("meeting",),
    "equipo": ("team",),
    "dinero": ("money", "cash"),
    "banco": ("bank",),
    "grafica de ventas": ("sales chart",),
    "tienda": ("shop", "store"),
    "carrito": ("shopping cart",),
    "paquete": ("package", "parcel"),
    "caja": ("box",),
    "llave": ("key",),
    "candado": ("lock", "padlock"),
    "mapa": ("map",),
    "brujula": ("compass",),
    "avion": ("airplane", "plane"),
    "coche": ("car",),
    "bicicleta": ("bicycle", "bike"),
    "tren": ("train",),
    "autobus": ("bus",),
    "ciudad": ("city",),
    "carretera": ("road",),
    "casa": ("house", "home"),
    "cocina": ("kitchen",),
    "puerta": ("door",),
    # -- herramientas y taller --------------------------------------------
    "herramienta": ("tool",),
    "destornillador": ("screwdriver",),
    "martillo": ("hammer",),
    "llave inglesa": ("wrench",),
    "taladro": ("drill",),
    "tornillo": ("screw",),
    "pintura": ("paint",),
    "madera": ("wood",),
    "metal": ("metal",),
    "taller": ("workshop",),
    "obra": ("construction",),
    # -- naturaleza y ambiente --------------------------------------------
    "agua": ("water",),
    "fuego": ("fire",),
    "tierra": ("soil", "earth"),
    "planta": ("plant",),
    "arbol": ("tree",),
    "flor": ("flower",),
    "jardin": ("garden",),
    "huerto": ("vegetable garden",),
    "semilla": ("seed",),
    "montana": ("mountain",),
    "playa": ("beach",),
    "mar": ("sea", "ocean"),
    "rio": ("river",),
    "bosque": ("forest",),
    "cielo": ("sky",),
    "sol": ("sun",),
    "lluvia": ("rain",),
    "nieve": ("snow",),
    "viento": ("wind",),
    "animal": ("animal",),
    "perro": ("dog",),
    "gato": ("cat",),
    "pajaro": ("bird",),
    "granja": ("farm",),
    # -- comida y salud ----------------------------------------------------
    "comida": ("food",),
    "cafe": ("coffee",),
    "agua potable": ("drinking water",),
    "fruta": ("fruit",),
    "verdura": ("vegetable",),
    "pan": ("bread",),
    "receta": ("recipe",),
    "medicina": ("medicine",),
    "hospital": ("hospital",),
    "deporte": ("sport",),
    "gimnasio": ("gym",),
    "musculo": ("muscle",),
    # -- gente y estudio ---------------------------------------------------
    "persona": ("person",),
    "gente": ("people",),
    "mano": ("hand", "hands"),
    "cara": ("face",),
    "ojo": ("eye",),
    "nino": ("child", "kid"),
    "estudiante": ("student",),
    "profesor": ("teacher",),
    "clase": ("classroom", "class"),
    "escuela": ("school",),
    "universidad": ("university",),
    "idioma": ("language",),
    "musica": ("music",),
    "guitarra": ("guitar",),
    "piano": ("piano",),
    "pelicula": ("movie", "film"),
    "video": ("video",),
    "foto": ("photo", "photography"),
    "dibujo": ("drawing",),
    "arte": ("art",),
}


@runtime_checkable
class Translator(Protocol):
    """Lo unico que hace falta saber traducir: un termino, a un idioma.

    Aqui es donde entra un modelo local de traduccion cuando se pueda tener:
    mismo metodo, y ni los proveedores ni la regla de coherencia se enteran.
    """

    def equivalents(self, term: str, *, to: str = "en") -> tuple[str, ...]:
        ...


class GlossaryTranslator:
    """Traductor de glosario: lo que esta, esta; lo que no, no se inventa."""

    def __init__(self, glossary: dict[str, tuple[str, ...]] | None = None) -> None:
        crudo = GLOSSARY if glossary is None else glossary
        self._por_raiz: dict[str, tuple[str, ...]] = {}
        self._exacto: dict[str, tuple[str, ...]] = {}
        for es, en in crudo.items():
            self._exacto[normalize_tag(es)] = en
            raiz = tag_stem(es)
            # Varios terminos pueden compartir raiz ("archivo"/"archivar"): se
            # queda el primero, que es el que esta escrito en el glosario.
            self._por_raiz.setdefault(raiz, en)

    def equivalents(self, term: str, *, to: str = "en") -> tuple[str, ...]:
        """Como se dice eso en `to`, o nada si no se sabe.

        Se busca primero la palabra tal cual y despues por raiz, para que
        "pestanas" encuentre "pestana" sin tener que listar los plurales.
        """
        if to != "en" or not term:
            return ()
        limpio = normalize_tag(term)
        if limpio in self._exacto:
            return self._exacto[limpio]
        raiz = tag_stem(term)
        return self._por_raiz.get(raiz, ())


#: El unico que hay por ahora. Se pasa explicito a los proveedores para que en
#: los tests se pueda sustituir por otro.
DEFAULT_TRANSLATOR = GlossaryTranslator()


#: Codigo de idioma tal como lo quiere cada banco. Pexels usa `locale` con
#: region; Pixabay usa `lang` a secas.
PEXELS_LOCALES = {
    "es": "es-ES", "en": "en-US", "pt": "pt-BR", "fr": "fr-FR",
    "de": "de-DE", "it": "it-IT",
}
PIXABAY_LANGS = frozenset(
    {"es", "en", "pt", "fr", "de", "it", "nl", "pl", "ru", "ja", "ko", "zh"}
)


def bank_query(
    text: str, head: str, language: str, translator: Translator | None = None
) -> tuple[str, tuple[str, ...]]:
    """Con que se busca en el banco, y con que etiquetas vale la respuesta.

    Devuelve `(consulta, equivalentes_de_la_cabeza)`. Si la cabeza se sabe
    traducir, se busca en ingles -- que es el idioma en el que los bancos tienen
    de verdad indexado su material -- y los equivalentes sirven para que la
    regla de coherencia pueda cumplirse. Si no se sabe, se manda tal cual y se
    confia en el `lang`/`locale` de la peticion.
    """
    if (language or "es").lower().startswith("en"):
        return text, ()
    traductor = translator or DEFAULT_TRANSLATOR
    equivalentes = traductor.equivalents(head) if head else ()
    if not equivalentes:
        return text, ()
    return equivalentes[0], equivalentes

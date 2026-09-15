# Auditoria de coherencia

> **Estado: los diez hallazgos, cerrados.** Cada uno lleva debajo como se
> arreglo y donde esta el test que lo fija. La auditoria se queda como esta
> porque el valor no era la lista: era el metodo de mirar el sistema entero
> buscando decisiones que no se siguen de lo que el propio sistema sabe.

El caso de Palworld y Minecraft no era un caso: era un **sintoma**. El sistema
tiene muchas partes que deciden bien por separado y **no se hablan entre
ellas**, y cada sitio donde no se hablan produce la misma clase de fallo: hacer
algo que no se sigue de lo que el propio sistema ya sabe.

Esto es el repaso completo, antes de arreglar nada. Cada hallazgo lleva como se
comprobo:

- **medido** -- se reproduce con numeros en este repo;
- **demostrable** -- sale de la aritmetica o del codigo, sin ambiguedad;
- **latente** -- es posible por construccion y no se ha observado en los
  materiales de prueba que hay.

---

## A. Lo que se ve en pantalla

### A1. El recuadro se pinta donde el elemento **ya no esta** · HECHO

`_callout_filters` calcula la caja en coordenadas del **fotograma de salida**
(`x = rect.x * w`) y el filtro se aplica **despues** del `zoompan`. Cuando hay
un zoom activo, lo que se ve es un recorte ampliado del original, asi que el
recuadro cae en otro sitio:

```
boton al 84,5% del ancho, zoom centrado en el
  zoom 1,00   se ve al 84,5%   se pinta al 84,5%     0 px
  zoom 1,06   se ve al 83,6%   se pinta al 84,5%    18 px
  zoom 1,16   se ve al 82,0%   se pinta al 84,5%    48 px
  zoom 1,45   se ve al 77,5%   se pinta al 84,5%   134 px
```

Un boton de menu mide unos 170 px de ancho en 1080p: con el zoom de 1,45 -- que
es justo el que se pone **cuando senalas algo pequeno**, o sea exactamente
cuando hay un recuadro -- la caja se sale del boton entero. Y con Ken Burns es
peor de lo que dice el numero, porque el encuadre se **mueve** mientras el
recuadro se queda quieto: empieza desviado 18 px y acaba en otro sitio.

Lo mas feo del caso: el zoom y el recuadro se colocan **por la misma senal**
(senalas algo por su nombre), asi que no es una coincidencia rara, es el caso
normal.

### A2. El recuadro se pinta encima del b-roll · HECHO

Orden del grafo: b-roll → recuadros → subtitulos. Si en ese momento hay
material de apoyo a pantalla completa, el recuadro senala un sitio de una imagen
que ya no esta. Nadie comprueba que no coincidan.

### A3. Nadie mira los solapes entre efectos de **distinto tipo** · HECHO

`balance.py:143` solo compara efectos del mismo tipo (`e.kind is c.kind`). Cada
planner decide por su cuenta y el balanceador, que seria el sitio natural para
resolverlo, tampoco mira. De ahi salen A1 y A2, y ademas:

- zoom + b-roll a pantalla completa: te acercas a algo que esta tapado;
- rotulo de capitulo sobre b-roll: dos graficos a la vez;
- subtitulo sobre b-roll en PiP: el subtitulo se dibuja el ultimo y lo tapa
  (`captions.py` no sabe que existe el b-roll).

### A4. Dos movimientos a la vez · HECHO

`plan_ken_burns` anade deriva a todo plano largo y quieto sin mirar si ese
plano ya lleva un zoom de enfasis; el render los **suma**. Ken Burns existe para
que un plano quieto no parezca congelado, y si ya hay un zoom, quieto no esta.
No se observa en los estilos actuales (solo `documentary` lo activa), pero la
puerta esta abierta.

---

## B. Decisiones que ignoran lo que el sistema ya sabe

### B1. Las transiciones se reparten con una regla de tres · HECHO

```python
elegidos = cortes[::paso][:cuantas]     # planner.py:159
```

Una fraccion de los cortes, repartidos de forma regular. **Sin mirar que corte
es**. En una guia la mayoria de los cortes son silencios quitados *dentro del
mismo plano*: ahi la imagen no cambia, y un fundido es un bajon de brillo en
mitad de una pantalla quieta. En la guia sintetica salen 7 transiciones en
`tutorial` y 15 en `gaming-hype` colocadas asi.

El sistema sabe donde cambian los planos (`analysis.shots`) y donde cambia el
tema (`understand/topics.py`, recien hecho). No usa ninguna de las dos.

Su explicacion tampoco explica nada: *"transicion fade en el corte de 12.3s"*.

### B2. El b-roll no mira el papel del tramo · HECHO

`select.py` y `emphasis.py` usan el papel narrativo (intro, paso, aviso,
cierre) para decidir cuanto recortan y cuanto valen los zooms. `broll.py`,
`callouts.py` y `captions.py` no lo miran. Consecuencia: el material de apoyo
puede tapar la pantalla **justo en un aviso** ("ojo, si no haces esto no
funciona"), que es el momento del video que menos se puede tapar.

### B3. El material del propio video se anuncia como algo que no es · HECHO

El proveedor `self` lo dice en su propio docstring: *"no entiende la consulta:
elige por interes visual"*. Pero el montaje lo escribe asi:

```
material de apoyo en 60s porque ahi hablas de 'palworld' · recorte del plano 4
```

Lo primero es falso: ese recorte no tiene nada que ver con Palworld, es el
plano con mas contraste del video. Y ahora **es el que mas va a salir**, porque
al poner estrictos los otros dos proveedores, `self` es el que queda de reserva.
Esto es una consecuencia directa del arreglo anterior.

### B4. Un zoom puede caer dentro de un tramo acelerado · HECHO

Las esperas anunciadas se aceleran hasta 8x. `plan_punch_ins` no sabe nada de
`Clip.speed`, asi que puede colocar un acercamiento de 1,5 s sobre un tramo que
pasa a ocho veces la velocidad: no se lee como un zoom, se lee como un tiron.

(Lo que si esta bien: solo se acelera el **silencio** posterior al aviso, asi
que no hay voz ni subtitulos dentro. Eso ya es coherente.)

---

## C. Lo que el estilo promete y no pasa

### C1. Los efectos de sonido no existen · HECHO

```
gaming-hype    sfx.enabled=True   -> efectos: caption, punch_in, transition, grade
vlog           sfx.enabled=True   -> efectos: caption, punch_in, transition, grade
```

`SfxRules` con `max_per_minute` y `gain_db`, `EffectKind.SFX`, `SfxEffect`, el
sintetizador procedural en `assets/sfx.py` y la mezcla en el render: todo esta.
**Ningun planner crea un solo SfxEffect.** Eliges un estilo que pide diez
sonidos por minuto y no suena ninguno.

### C2. La musica tampoco · HECHO

`MusicRules` (`enabled`, `gain_db`, `duck`) no tiene **ni un solo consumidor**
en todo el codigo. Cuatro estilos de seis la piden activada. El plan original
prometia ademas el `sidechaincompress` para agachar la musica bajo la voz.

Las dos son la misma clase de incoherencia que arrastraba el proyecto con los
recuadros y los capitulos antes de revivirlos: la funcion existe a medias y el
estilo miente.

---

## D. Menores

- **D1.** La explicacion de una transicion no dice por que esta ahi (B1).
- **D2.** `cinematic` desactiva subtitulos, zooms, capitulos y recuadros: el
  render sale con un unico efecto de color. Puede ser deliberado, pero conviene
  decidirlo a proposito y escribirlo.

---

## Como se cerro cada uno

| # | arreglo | test |
|---|---|---|
| A1 | el recuadro se dibuja **dentro del clip, antes del zoom**: la caja sale en coordenadas del original y el zoom se la lleva con la imagen | `test_callouts.py::test_el_recuadro_se_acerca_con_la_imagen` (renderiza con zoom y mide donde cae el trazo) |
| A2, A3, A4, B4 | un **arbitro** (`plan/conflicts.py`) que se pasa al cerrar el montaje y quita lo que otro efecto deja sin sentido; el auto-balanceador le consulta antes de recuperar un candidato | `test_conflictos.py` (11 casos) |
| B1 | transicion donde **cambia el plano** o **empieza un capitulo**, y si no hay ninguna de las dos, ninguna transicion | `test_planner.py`, y la explicacion ahora dice el motivo |
| B2 | el papel narrativo pesa en el b-roll, y un **aviso no se tapa nunca** | `test_coherencia_broll.py::test_un_aviso_no_se_tapa_con_material_de_apoyo` |
| B3 | el proveedor `self` solo ensena **donde se vio en pantalla** lo que nombras (y prefiere lo ya visto); si no se vio nunca, no ensena nada | `test_assets.py`, cuatro casos |
| C1 | `plan_sfx`: cada sonido acompana a algo ya decidido y se va con ello | `test_conflictos.py`, y `gaming-hype` pasa de 0 a 33 sonidos |
| C2 | musica desde `assets/music/`, agachada bajo la voz con `sidechaincompress` | `test_musica.py::test_la_musica_se_agacha_mientras_hablas` (medido en dB) |
| D1 | la transicion explica por que esta ahi | incluido en B1 |
| D2 | `cinematic` es deliberado ("casi sin texto", y asi lo dice la tabla de estilos) | sin cambios |

De paso salio uno que no estaba en la lista: **el tratamiento de voz se
aplicaba a la mezcla ya hecha**, asi que el corte de graves le quitaba el
cuerpo a un golpe y el de-esser bombeaba con el ruido de un whoosh. La voz se
trata ahora antes de mezclar.

---

## Orden propuesto (ya recorrido)

Primero lo que se ve y esta mal colocado, despues lo que decide sin mirar, y al
final lo que no existe:

1. **A1 + A2 + A3** -- un arbitro de conflictos entre efectos, y el recuadro
   compensado por el zoom (o dibujado antes de el, que es mas simple y ademas
   hace que el recuadro se acerque con la imagen).
2. **B1** -- transiciones donde cambia el plano o el tema, y no cada N cortes.
3. **B3** -- que `self` no se anuncie como lo que no es, y que valga menos que
   dejar el hueco cuando lo que se nombra es concreto.
4. **B2** -- el papel del tramo tambien manda en el b-roll.
5. **C1 + C2** -- o se implementan o se quitan del estilo. Prometer y no hacer
   es peor que no prometer.
6. **A4, B4, D1, D2** -- cierres pequenos.

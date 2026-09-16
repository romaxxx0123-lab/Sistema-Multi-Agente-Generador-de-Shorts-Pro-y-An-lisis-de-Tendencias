# Lo siguiente que toca

Cuando me digas **"mejóralo"** estando en este proyecto y la tarea anterior ya
esté cerrada, lo que hay que hacer es esto, sin volver a preguntar.

## Rótulos: cuadros con texto, en distintos sitios

Poder poner **cuadros de color con texto** sobre el vídeo, colocados en
distintas posiciones según lo que convenga. El ejemplo que diste:

> un rectángulo azul que diga **"Expediciones Palworld"** cuando dedico un
> capítulo a eso

Es decir: el rótulo sale de lo que el vídeo **está tratando** en ese tramo (el
capítulo, el tema detectado, lo que se nombra), no de un adorno colocado cada
tantos segundos.

Lo que hace falta:

- un efecto de rótulo con **caja, color, posición y texto**, en varias
  ubicaciones (esquinas, banda inferior tipo *lower third*, centro);
- que el **texto salga del análisis** — el título del capítulo, el tema, el
  término que se está explicando — y no de una plantilla;
- que la **posición** se decida con lo que ya hay montado: no tapar lo que
  señalas, ni el puntero, ni los subtítulos, ni la zona llena de la pantalla
  (`plan/placement.py` ya hace exactamente esto para la ventanita de material);
- que el **color** sea del estilo, no inventado por rótulo.

## Y lo que de verdad importa de esa petición

> "que de verdad sea inteligente cuando usar este tipo de herramientas"

Un rótulo mal puesto es peor que ninguno. La regla es la misma que rige el
resto del montaje: **tiene que justificarse**. Un capítulo que empieza y se
llama algo concreto justifica un rótulo; un tramo cualquiera, no. Y nunca dos
seguidos, ni encima de un rótulo de capítulo que ya está diciendo lo mismo.

Antes de dar esto por hecho hay que medirlo, como todo lo demás: cuántos
rótulos salen en una guía de 20 minutos, cuántos caen sobre algo que tapan, y
qué dice el medidor de repetición.

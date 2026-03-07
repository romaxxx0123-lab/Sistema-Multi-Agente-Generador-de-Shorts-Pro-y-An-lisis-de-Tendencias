# First Scene Layout: "La Capilla Olvidada"

## Visión General
Esta escena representa la primera ubicación del juego: una pequeña capilla o iglesia sencilla rodeada por un exterior verde limitado y claro. Es un espacio contemplativo, silencioso y reverente, diseñado con un estilo *low poly* limpio.

El objetivo de este espacio es enseñar al jugador las mecánicas de exploración e interacción antes de introducir el sistema de misiones formales.

## Elementos Principales de la Escena (Layout)
La escena se divide en dos zonas lógicas: el **Exterior** y el **Interior de la Capilla**.

### 1. Exterior (El Patio)
- **Zona de Spawn (Player Start):** El jugador aparece en un camino de tierra frente a las puertas abiertas de la capilla.
- **Pozo (Well):** A la izquierda del camino principal. Es el primer punto interactivo visible.
  - Componente: `WellInteractable` ("Sacar agua").
- **Árboles y Vegetación (Low Poly):** Props de entorno que limitan el camino y guían la visión hacia la capilla.

### 2. Interior (La Capilla)
- **Puertas Abiertas:** La transición es fluida, sin pantallas de carga.
- **NPC Cuidador (Caretaker):** De pie cerca de la entrada o barriendo el suelo.
  - Componente: `CaretakerNPCInteractable` ("Hablar con Cuidador").
- **Vasijas (Vessels):** Dos vasijas ubicadas cerca de los pilares de la entrada o a los lados del pasillo central.
  - Componente: `VesselInteractable` ("Llenar vasija").
- **Atril de Escrituras (Lectern):** Ubicado en el lado derecho, antes de subir al altar.
  - Componente: `LecternInteractable` ("Leer escrituras").
- **Altar Central (Altar):** El punto focal al final del pasillo. Ligeramente elevado por un escalón.
  - Componente: `AltarInteractable` ("Preparar Altar").
- **Bancos:** Hileras de bancos simples y vacíos para dar contexto de iglesia.

## Flujo Espacial (Player Flow)
1. **Llegada:** El jugador avanza hacia adelante atraído por la silueta de la capilla.
2. **Descubrimiento:** Al pasar, ve el Pozo, interactúa y recibe agua (mecánica futura).
3. **Encuentro:** Al entrar, se topa con el Cuidador, quien le explica la necesidad de preparar el altar.
4. **Acción:** Llena las vasijas con agua y lee el atril para obtener Lore.
5. **Resolución:** Interactúa con el Altar central como acto final.

## Pasos para Ensamblar la Escena (Validación Manual en Unity)
Debido a que serializar escenas complejas sin abrir el editor es riesgoso, esta escena debe ensamblarse manualmente al abrir Unity:

1. **Crear el Entorno Base (ProBuilder/Primitivas):**
   - Usa cubos estirados y planos para crear el suelo verde, un camino de tierra, y las paredes rectangulares de la capilla.
   - Crea un tejado simple a dos aguas (prisma triangular).
2. **Configurar la Iluminación:**
   - Usa Directional Light suave y cálida.
   - Si usas URP, asegúrate de que haya una tenue luz de ambiente.
3. **Instanciar Interactuables (Placeholders):**
   - **Pozo:** Crea un Cilindro gris oscuro en el exterior. Asígnale la capa "Interactable" y añade `WellInteractable`.
   - **Vasijas:** Crea dos Esferas achatadas de color barro dentro de la capilla. Asígnales la capa "Interactable" y añade `VesselInteractable`.
   - **Atril:** Crea un Cubo inclinado de color madera. Capa "Interactable" + `LecternInteractable`.
   - **Altar:** Crea un Cubo rectangular alargado y blanco en el fondo. Capa "Interactable" + `AltarInteractable`.
   - **Cuidador (NPC):** Usa un Cilindro o Cápsula de un color distinto (ej. marrón). Capa "Interactable" + `CaretakerNPCInteractable`.
4. **Instanciar al Jugador:**
   - Asegúrate de que el Jugador y la Cámara (Cinemachine) estén configurados como se documentó en `PlayablePrototypeSetup.md`.
5. **Guardar:** Guarda esta escena como `Main.unity` (si sobreescribes la anterior) o `Chapel.unity`.
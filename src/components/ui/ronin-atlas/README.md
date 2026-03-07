# RONIN UI ATLAS

Set centralizado de iconografía y componentes visuales para Ronin Survivor.

## Estilo
- **Katana Edge**: Bordes definidos, trazos de 2px, estilo stroke-fill híbrido.
- **Color**: currentColor por defecto, compatible con Tailwind.

## Uso
Importa desde el índice central:

```tsx
import { IconTorii, SelloEpico, BadgeForged } from '../ui/ronin-atlas';

// Icono
<IconTorii size={24} color="#D4AF37" />

// Sello de Rareza
<SelloEpico size={64} />

// Badge
<BadgeForged />
```

## Directorios
- `/icons`: Iconos funcionales (Navegación, HUD).
- `/badges`: Sellos de rareza y estados.
- `/dividers`: Elementos de separación (Cortes de katana).

# Escenas del Proyecto (Scenes)

**IMPORTANTE:**
No se ha incluido una escena `.unity` serializada en este commit inicial porque crear o modificar archivos `.unity` de forma manual (fuera del editor) es altamente propenso a errores y corrupción.

## Pasos para Inicializar la Primera Escena
Al abrir este proyecto por primera vez en Unity 2022.3 LTS, por favor realiza los siguientes pasos:

1. Ve a `File > New Scene` y selecciona el template **URP Basic** (Universal Render Pipeline).
2. Guarda la escena como `Main.unity` dentro de esta carpeta (`Assets/_Project/Scenes/`).
3. Crea un Empty GameObject llamado `[GAME_BOOTSTRAP]` y añádele el script `GameBootstrap.cs` ubicado en `Assets/_Project/Scripts/Core/`.
4. Ve a `Edit > Project Settings > Player` y asegúrate de que el **Active Input Handling** esté configurado en `Input System Package (New)` o `Both`.
5. Ve a `File > Build Settings` y añade la escena `Main.unity` a la lista de "Scenes In Build".
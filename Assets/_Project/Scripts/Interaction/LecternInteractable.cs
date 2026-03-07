using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Representa el atril principal cerca del altar.
    /// Actualmente lee un mensaje estático, futuro lector de escrituras o Lore.
    /// </summary>
    public class LecternInteractable : InteractableBase
    {
        private void Awake()
        {
            _promptMessage = "Leer escrituras";
        }

        protected override bool OnInteract(GameObject interactor)
        {
            Debug.Log("[Atril] Un pasaje pacífico está escrito aquí: 'Bienaventurados los puros de corazón, porque ellos verán a Dios'. (Placeholder para Lore)");

            // TODO: En el futuro esto puede abrir un UI de texto completo.
            return true;
        }
    }
}

using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Representa el pozo en el exterior de la capilla.
    /// Actualmente sirve como placeholder para la futura misión de recolectar agua.
    /// </summary>
    public class WellInteractable : InteractableBase
    {
        private void Awake()
        {
            _promptMessage = "Sacar agua";
        }

        protected override bool OnInteract(GameObject interactor)
        {
            Debug.Log("[Pozo] Has sacado agua fresca del pozo. (Placeholder para misión)");

            // TODO: En la siguiente iteración, aquí se añadirá el agua al inventario
            // o se cambiará el estado de la misión activa.
            return true;
        }
    }
}

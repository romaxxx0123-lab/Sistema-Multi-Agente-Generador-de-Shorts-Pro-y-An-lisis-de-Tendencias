using UnityEngine;

namespace RPGProject.NPC
{
    using RPGProject.Interaction;

    /// <summary>
    /// NPC Cuidador (Caretaker) de la capilla.
    /// Actualmente es un placeholder que simplemente dice un texto estático
    /// para simular la conversación.
    /// En el futuro, iniciará el sistema de diálogos y misiones.
    /// </summary>
    public class CaretakerNPCInteractable : InteractableBase
    {
        private void Awake()
        {
            _promptMessage = "Hablar con Cuidador";
        }

        protected override bool OnInteract(GameObject interactor)
        {
            Debug.Log("[NPC Cuidador] Bienvenido peregrino. La capilla aún no está lista para la misa. " +
                      "¿Podrías sacar agua del pozo y limpiar las vasijas? (Placeholder para sistema de Diálogo/Misiones)");

            // TODO: En la siguiente iteración, aquí se iniciará un nodo de diálogo real
            // y se asignará la misión inicial "Preparar la capilla".
            return true;
        }
    }
}

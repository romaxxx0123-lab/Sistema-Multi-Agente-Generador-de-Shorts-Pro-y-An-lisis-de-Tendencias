using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Representa el Altar central de la capilla.
    /// Es el foco final de la primera misión "Preparar la capilla".
    /// </summary>
    public class AltarInteractable : InteractableBase
    {
        private bool _isPrepared = false;

        private void Awake()
        {
            UpdatePrompt();
        }

        protected override bool OnInteract(GameObject interactor)
        {
            if (_isPrepared)
            {
                Debug.Log("[Altar] El altar ya está preparado para la misa.");
                return false;
            }

            Debug.Log("[Altar] Faltan los preparativos iniciales: (Llenar vasijas, etc.) - (Placeholder para Finalizar Misión)");

            // TODO: En la siguiente iteración, aquí se chequeará el Quest System
            // para ver si las otras condiciones se han cumplido.
            return true;
        }

        private void UpdatePrompt()
        {
            _promptMessage = _isPrepared ? "Altar preparado" : "Preparar Altar";
        }
    }
}

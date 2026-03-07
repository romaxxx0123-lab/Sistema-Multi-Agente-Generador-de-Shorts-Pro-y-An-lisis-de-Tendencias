using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Representa las vasijas dentro de la capilla que necesitan ser llenadas con agua.
    /// Actualmente sirve como placeholder para la futura misión.
    /// </summary>
    public class VesselInteractable : InteractableBase
    {
        private bool _isFilled = false;

        private void Awake()
        {
            UpdatePrompt();
        }

        protected override bool OnInteract(GameObject interactor)
        {
            if (_isFilled)
            {
                Debug.Log("[Vasija] La vasija ya está llena y limpia.");
                return false;
            }

            Debug.Log("[Vasija] Has llenado la vasija con el agua del pozo. (Placeholder para misión)");

            _isFilled = true;
            UpdatePrompt();

            // TODO: En la siguiente iteración, aquí se verificará si el jugador tiene agua
            // y se actualizará el estado de la misión.
            return true;
        }

        private void UpdatePrompt()
        {
            _promptMessage = _isFilled ? "Vasija limpia" : "Llenar vasija";
        }
    }
}

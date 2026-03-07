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

        private void OnEnable()
        {
            if (RPGProject.World.WorldStateManager.Instance != null)
            {
                RPGProject.World.WorldStateManager.Instance.OnFlagChanged += HandleFlagChanged;
            }
        }

        private void OnDisable()
        {
            if (RPGProject.World.WorldStateManager.Instance != null)
            {
                RPGProject.World.WorldStateManager.Instance.OnFlagChanged -= HandleFlagChanged;
            }
        }

        private void Start()
        {
            if (RPGProject.World.WorldStateManager.Instance != null)
            {
                SyncState(RPGProject.World.WorldStateManager.Instance.GetFlag(_flagToSet));
            }
        }

        private void HandleFlagChanged(string flagName, bool value)
        {
            if (flagName == _flagToSet)
            {
                SyncState(value);
            }
        }

        private void SyncState(bool isFilled)
        {
            _isFilled = isFilled;
            UpdatePrompt();
        }

        [Header("World State Integration")]
        [SerializeField] private string _requiredWaterFlag = "env_pozo_revisado";
        [SerializeField] private string _flagToSet = "env_vasija_revisada";

        protected override bool OnInteract(GameObject interactor)
        {
            if (RPGProject.UI.DialogueUI.Instance != null && RPGProject.UI.DialogueUI.Instance.IsActive)
                RPGProject.UI.DialogueUI.Instance.HideDialogue();

            if (_isFilled)
            {
                Debug.Log("[Vasija] La vasija ya está llena y lista para el servicio.");
                return false;
            }

            if (RPGProject.World.WorldStateManager.Instance != null)
            {
                if (RPGProject.World.WorldStateManager.Instance.GetFlag(_requiredWaterFlag))
                {
                    Debug.Log("[Vasija] Has llenado la vasija con el agua fresca del pozo.");
                    _isFilled = true;
                    UpdatePrompt();

                    RPGProject.World.WorldStateManager.Instance.SetFlag(_flagToSet, true);
                    return true;
                }
                else
                {
                    Debug.Log("[Vasija] La vasija está sucia y vacía. Necesito agua del pozo primero.");
                    return false;
                }
            }

            return false;
        }

        private void UpdatePrompt()
        {
            _promptMessage = _isFilled ? "Vasija limpia" : "Llenar vasija";
        }
    }
}

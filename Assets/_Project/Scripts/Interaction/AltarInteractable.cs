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

        [Header("World State Integration")]
        [SerializeField] private string _requiredQuestID = "prep_capilla";
        [SerializeField] private string _flagToCheck = "player_has_altar_cloth";
        [SerializeField] private string _flagToSet = "env_altar_dressed";

        [Header("Visual Feedback")]
        [SerializeField] private GameObject _clothVisuals; // Optional mesh to enable

        private void Start()
        {
            if (_clothVisuals != null) _clothVisuals.SetActive(false);
        }

        protected override bool OnInteract(GameObject interactor)
        {
            if (RPGProject.UI.DialogueUI.Instance != null && RPGProject.UI.DialogueUI.Instance.IsActive)
                RPGProject.UI.DialogueUI.Instance.HideDialogue();

            if (_isPrepared)
            {
                Debug.Log("[Altar] Ya está vestido. Ahora las velas aguardan.");
                return false;
            }

            if (RPGProject.World.WorldStateManager.Instance != null)
            {
                // Has picked up the cloth but hasn't placed it yet
                if (RPGProject.World.WorldStateManager.Instance.GetFlag(_flagToCheck) &&
                    !RPGProject.World.WorldStateManager.Instance.GetFlag(_flagToSet))
                {
                    Debug.Log("[Sistema] Has extendido cuidadosamente el mantel sobre el altar de piedra.");

                    if (RPGProject.UI.NotificationUI.Instance != null)
                    {
                        RPGProject.UI.NotificationUI.Instance.ShowNotification("Altar vestido");
                    }

                    _isPrepared = true;
                    if (_clothVisuals != null) _clothVisuals.SetActive(true);

                    UpdatePrompt();
                    RPGProject.World.WorldStateManager.Instance.SetFlag(_flagToSet, true);
                    return true;
                }
            }

            Debug.Log("[Altar] Una base de piedra fría. No hay nada más que hacer sin el mantel.");
            return false;
        }

        private void UpdatePrompt()
        {
            _promptMessage = _isPrepared ? "Altar vestido" : "Vestir Altar";
        }
    }
}

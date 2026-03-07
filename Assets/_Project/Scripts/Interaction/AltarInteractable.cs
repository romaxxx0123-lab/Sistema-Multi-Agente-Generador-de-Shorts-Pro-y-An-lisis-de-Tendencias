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

        protected override bool OnInteract(GameObject interactor)
        {
            if (RPGProject.UI.DialogueUI.Instance != null && RPGProject.UI.DialogueUI.Instance.IsActive)
                RPGProject.UI.DialogueUI.Instance.HideDialogue();

            if (_isPrepared)
            {
                Debug.Log("[Altar] El altar ya está preparado para la misa.");
                return false;
            }

            if (RPGProject.World.WorldStateManager.Instance != null &&
                RPGProject.World.WorldStateManager.Instance.GetFlag($"quest_{_requiredQuestID}_completed"))
            {
                Debug.Log("[Altar] Te inclinas reverentemente. Todo está en orden para la celebración.");
                _isPrepared = true;
                UpdatePrompt();
                return true;
            }

            Debug.Log("[Altar] El altar se siente incompleto. Faltan preparativos previos.");
            return false;
        }

        private void UpdatePrompt()
        {
            _promptMessage = _isPrepared ? "Altar preparado" : "Preparar Altar";
        }
    }
}

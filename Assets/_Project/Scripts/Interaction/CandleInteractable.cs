using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Representa una vela simple en el altar.
    /// Se enciende solo cuando el altar ya tiene el mantel.
    /// </summary>
    public class CandleInteractable : InteractableBase
    {
        [Header("World State Integration")]
        [SerializeField] private string _requiredQuestID = "prep_capilla";
        [SerializeField] private int _requiredPhaseIndex = 2;
        [SerializeField] private string _flagToSet = "env_candle_X_lit";

        [Header("Visual Feedback")]
        [SerializeField] private GameObject _flameVFX; // Partícula opcional o luz

        private bool _isLit = false;

        private void Awake()
        {
            UpdatePrompt();
            if (_flameVFX != null) _flameVFX.SetActive(false);
        }

        protected override bool OnInteract(GameObject interactor)
        {
            if (RPGProject.UI.DialogueUI.Instance != null && RPGProject.UI.DialogueUI.Instance.IsActive)
                RPGProject.UI.DialogueUI.Instance.HideDialogue();

            if (_isLit)
            {
                Debug.Log("[Vela] Ya brilla con la luz del Señor.");
                return false;
            }

            var qm = RPGProject.Quests.QuestManager.Instance;

            // Check quest progress (needs to be Phase 2 - Altar Dressed)
            if (qm != null && qm.ActiveQuest != null && qm.ActiveQuest.QuestID == _requiredQuestID)
            {
                if (qm.CurrentPhaseIndex < _requiredPhaseIndex)
                {
                    Debug.Log("[Vela] El altar aún no ha sido preparado adecuadamente. No debo encender la vela todavía.");
                    return false;
                }

                Debug.Log("[Sistema] Has encendido una vela en el altar.");

                if (RPGProject.UI.NotificationUI.Instance != null)
                {
                    RPGProject.UI.NotificationUI.Instance.ShowNotification("Vela encendida");
                }

                _isLit = true;
                if (_flameVFX != null) _flameVFX.SetActive(true);

                UpdatePrompt();

                if (RPGProject.World.WorldStateManager.Instance != null)
                {
                    RPGProject.World.WorldStateManager.Instance.SetFlag(_flagToSet, true);
                }

                return true;
            }

            Debug.Log("[Vela] Una vela gastada descansa sobre el metal frío.");
            return false;
        }

        private void UpdatePrompt()
        {
            _promptMessage = _isLit ? "Vela encendida" : "Encender vela";
        }
    }
}

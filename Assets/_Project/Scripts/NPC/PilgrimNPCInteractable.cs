using UnityEngine;

namespace RPGProject.NPC
{
    using RPGProject.Interaction;
    using RPGProject.World;
    using RPGProject.UI;
    using RPGProject.Quests;

    /// <summary>
    /// Interaction hook for the exhausted pilgrim.
    /// Provides linear, contemplative dialogue depending on whether his rest corner is prepared.
    /// </summary>
    public class PilgrimNPCInteractable : InteractableBase
    {
        [Header("Dialogue Configuration")]
        [SerializeField] private string _speakerName = "Peregrino";

        [TextArea(2, 5)] [SerializeField] private string _dialogueExhausted =
            "El camino ha sido tan largo... mis pies ya no responden. Solo necesito un pequeño rincón donde la piedra no esté tan fría.";

        [TextArea(2, 5)] [SerializeField] private string _dialogueCornerReady =
            "Qué bendición. La manta es cálida y el agua fresca. Siento que el Señor mismo me ha abrazado a través de tus manos, hermano.";

        [Header("World State Dependencies")]
        [SerializeField] private string _questID = "quest_pilgrim_rest";
        [SerializeField] private int _requiredPhaseForCornerReady = 3; // Phase where bench, blanket and water are done.
        [SerializeField] private string _flagToSet = "event_spoke_to_pilgrim";

        private void Awake()
        {
            _promptMessage = "Hablar con " + _speakerName;
        }

        protected override bool OnInteract(GameObject interactor)
        {
            if (DialogueUI.Instance == null || WorldStateManager.Instance == null)
            {
                return false;
            }

            if (DialogueUI.Instance.IsActive)
            {
                DialogueUI.Instance.HideDialogue();
                return true;
            }

            string currentDialogue = _dialogueExhausted;

            // If the corner is completely prepared (e.g. quest is on the final phase or completed)
            var qm = QuestManager.Instance;
            if (qm != null &&
                ((qm.ActiveQuest != null && qm.ActiveQuest.QuestID == _questID && qm.CurrentPhaseIndex >= _requiredPhaseForCornerReady) ||
                 WorldStateManager.Instance.GetFlag($"quest_{_questID}_completed")))
            {
                currentDialogue = _dialogueCornerReady;

                // Set the flag to advance the quest objective (speaking to him)
                if (qm.ActiveQuest != null && qm.ActiveQuest.QuestID == _questID && !WorldStateManager.Instance.GetFlag(_flagToSet))
                {
                    WorldStateManager.Instance.SetFlag(_flagToSet, true);
                    if (NotificationUI.Instance != null)
                    {
                        NotificationUI.Instance.ShowNotification("Consuelo entregado");
                    }
                }
            }

            DialogueUI.Instance.ShowDialogue(_speakerName, currentDialogue);
            return true;
        }
    }
}

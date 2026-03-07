using UnityEngine;

namespace RPGProject.NPC
{
    using RPGProject.Interaction;
    using RPGProject.World;
    using RPGProject.UI;

    /// <summary>
    /// NPC interactable for Padre Elías.
    /// Manages contextual dialogue based on the completion of the Chapel quest
    /// and whether the player has already spoken to him.
    /// </summary>
    public class PadreEliasInteractable : InteractableBase
    {
        [Header("Dialogue Configuration")]
        [SerializeField] private string _speakerName = "Padre Elías";

        [TextArea(2, 5)] [SerializeField] private string _dialogueBeforeChapel =
            "...Señor, dame fuerzas para guiar a este pueblo en su hora de necesidad. (Parece sumido en una profunda oración y no nota tu presencia).";

        [TextArea(2, 5)] [SerializeField] private string _dialogueFirstMeeting =
            "He visto la luz de las velas desde la colina. Has devuelto la dignidad a Su casa, peregrino. Gracias.\n" +
            "Mi corazón está cargado por las familias del valle. Descansa hoy. Mañana, si estás dispuesto, hay mucho dolor que aliviar.";

        [TextArea(2, 5)] [SerializeField] private string _dialogueFallback =
            "El silencio de la capilla es un bálsamo para el alma. Quédate en paz, peregrino, pronto te necesitaré en el pueblo.";

        [Header("World State Dependencies")]
        [SerializeField] private string _requiredQuestID = "prep_capilla";
        [SerializeField] private string _spokeToEliasFlag = "event_spoke_to_padre_elias";

        private void Awake()
        {
            _promptMessage = "Hablar con " + _speakerName;
        }

        protected override bool OnInteract(GameObject interactor)
        {
            if (DialogueUI.Instance == null || WorldStateManager.Instance == null)
            {
                Debug.LogWarning("[PadreElias] Missing required UI or WorldStateManager.");
                return false;
            }

            // Close dialogue if already open
            if (DialogueUI.Instance.IsActive)
            {
                DialogueUI.Instance.HideDialogue();
                return true;
            }

            string currentDialogue = _dialogueBeforeChapel;

            // Check if the first quest is completed
            if (WorldStateManager.Instance.GetFlag($"quest_{_requiredQuestID}_completed"))
            {
                // Check if this is the first time speaking to him after the quest
                if (!WorldStateManager.Instance.GetFlag(_spokeToEliasFlag))
                {
                    currentDialogue = _dialogueFirstMeeting;
                    WorldStateManager.Instance.SetFlag(_spokeToEliasFlag, true);

                    // Show a subtle notification of progression
                    if (NotificationUI.Instance != null)
                    {
                        NotificationUI.Instance.ShowNotification("El descanso del peregrino");
                    }
                }
                else
                {
                    // Fallback dialogue after the first meeting
                    currentDialogue = _dialogueFallback;
                }
            }

            DialogueUI.Instance.ShowDialogue(_speakerName, currentDialogue);
            return true;
        }
    }
}

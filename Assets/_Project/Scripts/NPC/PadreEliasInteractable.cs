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
            "Mi corazón está cargado. Un hermano acaba de llegar exhausto de un largo viaje. ¿Podrías prepararle un rincón de descanso junto a la capilla? Necesita un banco limpio, una manta y agua fresca.";

        [TextArea(2, 5)] [SerializeField] private string _dialogueDuringQuest =
            "El pobre hermano apenas puede mantenerse en pie. Prepara el rincón y ofrécele consuelo.";

        [TextArea(2, 5)] [SerializeField] private string _dialogueReadyToTurnIn =
            "He visto cómo el peregrino ha encontrado paz en el rincón que preparaste. Tu caridad ilumina este valle tanto como las velas del altar.";

        [TextArea(2, 5)] [SerializeField] private string _dialogueFallback =
            "El silencio de la capilla es un bálsamo para el alma. Gracias por tu servicio de hoy, peregrino.";

        [Header("Quest Assignment (Second Quest)")]
        [SerializeField] private RPGProject.Quests.QuestData _questToAssign;

        [Header("World State Dependencies")]
        [SerializeField] private string _requiredFirstQuestID = "prep_capilla";
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
            if (WorldStateManager.Instance.GetFlag($"quest_{_requiredFirstQuestID}_completed"))
            {
                var qm = RPGProject.Quests.QuestManager.Instance;

                // Check if second quest is already completed globally
                if (_questToAssign != null && WorldStateManager.Instance.GetFlag($"quest_{_questToAssign.QuestID}_completed"))
                {
                    currentDialogue = _dialogueFallback;
                }
                // Check if second quest is currently active
                else if (qm != null && qm.ActiveQuest == _questToAssign)
                {
                    if (qm.CurrentState == RPGProject.Quests.QuestState.ReadyToTurnIn)
                    {
                        currentDialogue = _dialogueReadyToTurnIn;
                        qm.CompleteQuest();

                        Debug.Log("[Sistema] Misión Completada. Caridad +1");

                        if (RPGProject.Core.SaveManager.Instance != null)
                        {
                            RPGProject.Core.SaveManager.Instance.SaveGame(interactor.transform);
                        }
                    }
                    else if (qm.CurrentState == RPGProject.Quests.QuestState.InProgress)
                    {
                        currentDialogue = _dialogueDuringQuest;
                    }
                }
                // First meeting post-chapel, assign second quest
                else if (!WorldStateManager.Instance.GetFlag(_spokeToEliasFlag))
                {
                    currentDialogue = _dialogueFirstMeeting;
                    WorldStateManager.Instance.SetFlag(_spokeToEliasFlag, true);

                    if (qm != null && _questToAssign != null)
                    {
                        qm.StartQuest(_questToAssign);
                    }

                    if (NotificationUI.Instance != null)
                    {
                        NotificationUI.Instance.ShowNotification("Nueva misión: El rincón del peregrino");
                    }

                    // Auto-Save at this narrative milestone
                    if (RPGProject.Core.SaveManager.Instance != null)
                    {
                        RPGProject.Core.SaveManager.Instance.SaveGame(interactor.transform);
                    }
                }
                else
                {
                    currentDialogue = _dialogueFallback;
                }
            }

            DialogueUI.Instance.ShowDialogue(_speakerName, currentDialogue);
            return true;
        }
    }
}

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
        [Header("Contextual Dialogues")]
        [SerializeField] private string _speakerName = "Cuidador";
        [TextArea(2, 5)] [SerializeField] private string _preQuestDialogue = "Bienvenido peregrino. La capilla aún no está lista para la misa. Por favor, saca agua del pozo, limpia las vasijas y lee las escrituras del atril.";
        [TextArea(2, 5)] [SerializeField] private string _duringQuestPhase0Dialogue = "¿Ya terminaste de revisar el pozo, las vasijas y las escrituras? Necesitamos que el ambiente esté puro.";
        [TextArea(2, 5)] [SerializeField] private string _duringQuestPhase1Dialogue = "Gracias. Todo está en orden. Por favor, recoge el mantel doblado del rincón y colócalo reverentemente sobre el altar.";
        [TextArea(2, 5)] [SerializeField] private string _duringQuestPhase2Dialogue = "El altar ya tiene el mantel. Solo falta encender las dos velas para que la luz del Señor nos guíe.";
        [TextArea(2, 5)] [SerializeField] private string _readyToTurnInDialogue = "¡Alabado sea Dios! El altar está completamente vestido y las velas encendidas. Has devuelto la vida a este lugar.";
        [TextArea(2, 5)] [SerializeField] private string _postQuestDialogue = "La paz sea contigo. El Padre Elías llegará pronto. Deberías ir a buscarlo cerca de la colina este, seguramente le alegrará ver esto.";

        [Header("Quest Assignment")]
        [SerializeField] private RPGProject.Quests.QuestData _questToAssign;

        private void Awake()
        {
            _promptMessage = "Hablar con " + _speakerName;
        }

        protected override bool OnInteract(GameObject interactor)
        {
            if (RPGProject.UI.DialogueUI.Instance == null)
            {
                Debug.LogWarning("[CaretakerNPC] No DialogueUI in scene to display dialogue.");
                return false;
            }

            // Close dialogue if already open
            if (RPGProject.UI.DialogueUI.Instance.IsActive)
            {
                RPGProject.UI.DialogueUI.Instance.HideDialogue();
                return true;
            }

            // Determine dialogue based on quest state
            string currentDialogue = _preQuestDialogue;

            if (RPGProject.Quests.QuestManager.Instance != null && _questToAssign != null)
            {
                var qm = RPGProject.Quests.QuestManager.Instance;

                // Check if quest is already completed globally
                if (RPGProject.World.WorldStateManager.Instance.GetFlag($"quest_{_questToAssign.QuestID}_completed"))
                {
                    currentDialogue = _postQuestDialogue;
                }
                // Check if quest is currently assigned to the player
                else if (qm.ActiveQuest == _questToAssign)
                {
                    if (qm.CurrentState == RPGProject.Quests.QuestState.ReadyToTurnIn)
                    {
                        currentDialogue = _readyToTurnInDialogue;
                        qm.CompleteQuest(); // Turn it in!

                        // Otorga recompensa simbólica aquí.
                        Debug.Log("[Sistema] Misión Completada. Virtud Espiritual aumentada.");
                    }
                    else if (qm.CurrentState == RPGProject.Quests.QuestState.InProgress)
                    {
                        switch(qm.CurrentPhaseIndex)
                        {
                            case 0:
                                currentDialogue = _duringQuestPhase0Dialogue;
                                break;
                            case 1:
                                currentDialogue = _duringQuestPhase1Dialogue;
                                break;
                            case 2:
                                currentDialogue = _duringQuestPhase2Dialogue;
                                break;
                            default:
                                currentDialogue = _duringQuestPhase0Dialogue;
                                break;
                        }
                    }
                }
                // Assign the quest if not started
                else if (qm.CurrentState == RPGProject.Quests.QuestState.NotStarted)
                {
                    qm.StartQuest(_questToAssign);
                }
            }

            RPGProject.UI.DialogueUI.Instance.ShowDialogue(_speakerName, currentDialogue);
            return true;
        }
    }
}

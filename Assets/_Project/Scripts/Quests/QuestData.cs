using UnityEngine;

namespace RPGProject.Quests
{
    public enum QuestState
    {
        NotStarted,
        InProgress,
        ReadyToTurnIn,
        Completed
    }

    /// <summary>
    /// ScriptableObject to define a quest's static data securely.
    /// This prevents hardcoding mission text and objectives.
    /// </summary>
    [CreateAssetMenu(fileName = "NewQuest", menuName = "RPGProject/Quest")]
    public class QuestData : ScriptableObject
    {
        public string QuestID;
        public string QuestName;
        [TextArea(3, 10)] public string Description;

        [Header("Required World Flags to Complete")]
        [Tooltip("The names of the WorldState flags that must be true to turn this quest in.")]
        public string[] RequiredFlags;

        public string ObjectiveTextInProgress = "Completa las tareas encomendadas.";
        public string ObjectiveTextReady = "Regresa con el Cuidador.";
    }
}

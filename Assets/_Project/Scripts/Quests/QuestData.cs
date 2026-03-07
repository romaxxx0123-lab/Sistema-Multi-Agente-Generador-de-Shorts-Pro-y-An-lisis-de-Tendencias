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

    [System.Serializable]
    public class QuestPhase
    {
        [Tooltip("Las flags del WorldState que deben ser verdaderas para avanzar de esta fase.")]
        public string[] RequiredFlags;
        public string ObjectiveText = "Completa la tarea.";
    }

    /// <summary>
    /// ScriptableObject to define a quest's static data securely.
    /// Soporta múltiples fases lineales para misiones con progreso secuencial.
    /// </summary>
    [CreateAssetMenu(fileName = "NewQuest", menuName = "RPGProject/Quest")]
    public class QuestData : ScriptableObject
    {
        public string QuestID;
        public string QuestName;
        [TextArea(3, 10)] public string Description;

        [Header("Fases de la Misión")]
        [Tooltip("Define los pasos secuenciales de la misión. La última fase completada la pone en ReadyToTurnIn.")]
        public QuestPhase[] Phases;

        public string ObjectiveTextReady = "Regresa con el Cuidador.";
    }
}

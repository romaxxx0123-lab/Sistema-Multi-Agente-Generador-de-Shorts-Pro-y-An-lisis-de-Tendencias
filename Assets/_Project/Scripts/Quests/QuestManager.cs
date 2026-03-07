using System;
using UnityEngine;
using RPGProject.World;

namespace RPGProject.Quests
{
    /// <summary>
    /// Handles the active quest logic. Subscribes to WorldStateManager events
    /// to automatically detect when objectives are met and update the quest state.
    /// </summary>
    public class QuestManager : MonoBehaviour
    {
        public static QuestManager Instance { get; private set; }

        public QuestData ActiveQuest { get; private set; }
        public QuestState CurrentState { get; private set; } = QuestState.NotStarted;

        public event Action<QuestData, QuestState> OnQuestUpdated;

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);
            }
            else
            {
                Destroy(gameObject);
            }
        }

        private void Start()
        {
            if (WorldStateManager.Instance != null)
            {
                WorldStateManager.Instance.OnFlagChanged += CheckActiveQuestProgress;
            }
        }

        private void OnDestroy()
        {
            if (WorldStateManager.Instance != null)
            {
                WorldStateManager.Instance.OnFlagChanged -= CheckActiveQuestProgress;
            }
        }

        public void StartQuest(QuestData quest)
        {
            if (CurrentState == QuestState.InProgress || CurrentState == QuestState.ReadyToTurnIn)
            {
                Debug.LogWarning("[QuestManager] Cannot start a new quest. One is already active.");
                return;
            }

            ActiveQuest = quest;
            CurrentState = QuestState.InProgress;

            WorldStateManager.Instance.SetFlag($"quest_{quest.QuestID}_started", true);
            Debug.Log($"[QuestManager] Quest '{quest.QuestName}' started.");

            OnQuestUpdated?.Invoke(ActiveQuest, CurrentState);
        }

        public void CompleteQuest()
        {
            if (CurrentState != QuestState.ReadyToTurnIn)
            {
                Debug.LogWarning("[QuestManager] Cannot complete quest. Objectives not met.");
                return;
            }

            WorldStateManager.Instance.SetFlag($"quest_{ActiveQuest.QuestID}_completed", true);
            Debug.Log($"[QuestManager] Quest '{ActiveQuest.QuestName}' completed!");

            ActiveQuest = null;
            CurrentState = QuestState.Completed;

            OnQuestUpdated?.Invoke(null, CurrentState);
        }

        private void CheckActiveQuestProgress(string flagName, bool value)
        {
            if (ActiveQuest == null || CurrentState != QuestState.InProgress) return;

            // Check if all required flags are true
            bool allComplete = true;
            foreach (var flag in ActiveQuest.RequiredFlags)
            {
                if (!WorldStateManager.Instance.GetFlag(flag))
                {
                    allComplete = false;
                    break;
                }
            }

            if (allComplete)
            {
                CurrentState = QuestState.ReadyToTurnIn;
                Debug.Log($"[QuestManager] Objectives for '{ActiveQuest.QuestName}' met. Ready to turn in.");
                OnQuestUpdated?.Invoke(ActiveQuest, CurrentState);
            }
        }
    }
}

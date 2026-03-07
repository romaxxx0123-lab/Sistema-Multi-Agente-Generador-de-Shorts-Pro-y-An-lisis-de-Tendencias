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

        /// <summary>Índice de la fase actual (0 es la primera fase).</summary>
        public int CurrentPhaseIndex { get; private set; } = 0;

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
            CurrentPhaseIndex = 0;

            WorldStateManager.Instance.SetFlag($"quest_{quest.QuestID}_started", true);
            Debug.Log($"[QuestManager] Quest '{quest.QuestName}' started at Phase {CurrentPhaseIndex}.");

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
            if (ActiveQuest.Phases == null || ActiveQuest.Phases.Length == 0) return;

            QuestPhase currentPhase = ActiveQuest.Phases[CurrentPhaseIndex];

            // Evaluate if current phase is met
            bool phaseComplete = true;
            foreach (var flag in currentPhase.RequiredFlags)
            {
                if (!WorldStateManager.Instance.GetFlag(flag))
                {
                    phaseComplete = false;
                    break;
                }
            }

            if (phaseComplete)
            {
                CurrentPhaseIndex++;

                if (CurrentPhaseIndex >= ActiveQuest.Phases.Length)
                {
                    // Quest is fully complete
                    CurrentState = QuestState.ReadyToTurnIn;
                    Debug.Log($"[QuestManager] All phases for '{ActiveQuest.QuestName}' met. Ready to turn in.");
                }
                else
                {
                    // Quest advances to next phase
                    Debug.Log($"[QuestManager] Phase {CurrentPhaseIndex - 1} complete. Advancing to phase {CurrentPhaseIndex}.");
                }

                // Broadcast update so UI refreshes
                OnQuestUpdated?.Invoke(ActiveQuest, CurrentState);
            }
        }

        public string GetCurrentObjectiveText()
        {
            if (ActiveQuest == null) return string.Empty;
            if (CurrentState == QuestState.ReadyToTurnIn) return ActiveQuest.ObjectiveTextReady;
            if (CurrentState == QuestState.InProgress && CurrentPhaseIndex < ActiveQuest.Phases.Length)
            {
                return ActiveQuest.Phases[CurrentPhaseIndex].ObjectiveText;
            }
            return string.Empty;
        }
    }
}

using RPGProject.Quests;
using UnityEngine;
using TMPro;

namespace RPGProject.UI
{
    /// <summary>
    /// Minimally viable UI for displaying the active quest name and objective.
    /// Listens to QuestManager updates to refresh the UI automatically.
    /// </summary>
    public class QuestUI : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private GameObject _questContainer;
        [SerializeField] private TextMeshProUGUI _questNameText;
        [SerializeField] private TextMeshProUGUI _objectiveText;

        private void OnEnable()
        {
            if (QuestManager.Instance != null)
            {
                QuestManager.Instance.OnQuestUpdated += UpdateQuestUI;
            }
        }

        private void OnDisable()
        {
            if (QuestManager.Instance != null)
            {
                QuestManager.Instance.OnQuestUpdated -= UpdateQuestUI;
            }
        }

        private void Start()
        {
            // Initial Sync
            if (QuestManager.Instance != null)
            {
                UpdateQuestUI(QuestManager.Instance.ActiveQuest, QuestManager.Instance.CurrentState);
            }
            else
            {
                _questContainer.SetActive(false);
            }
        }

        private void UpdateQuestUI(QuestData activeQuest, QuestState state)
        {
            if (activeQuest == null || state == QuestState.NotStarted || state == QuestState.Completed)
            {
                _questContainer.SetActive(false);
                return;
            }

            _questContainer.SetActive(true);
            _questNameText.text = activeQuest.QuestName;

            if (state == QuestState.InProgress || state == QuestState.ReadyToTurnIn)
            {
                _objectiveText.text = $"- {QuestManager.Instance.GetCurrentObjectiveText()}";
            }
        }
    }
}

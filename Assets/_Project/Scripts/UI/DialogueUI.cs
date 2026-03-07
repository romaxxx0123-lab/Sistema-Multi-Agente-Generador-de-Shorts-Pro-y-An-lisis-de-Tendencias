using UnityEngine;
using TMPro;

namespace RPGProject.UI
{
    /// <summary>
    /// Minimally viable UI for displaying linear dialogue lines from an NPC.
    /// In the future, this can be expanded with portrait displays and dialogue choices.
    /// </summary>
    public class DialogueUI : MonoBehaviour
    {
        public static DialogueUI Instance { get; private set; }

        [SerializeField] private GameObject _dialoguePanel;
        [SerializeField] private TextMeshProUGUI _speakerNameText;
        [SerializeField] private TextMeshProUGUI _dialogueLineText;

        public bool IsActive => _dialoguePanel != null && _dialoguePanel.activeSelf;

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
            }
            else
            {
                Destroy(gameObject);
            }
        }

        private void Start()
        {
            HideDialogue();
        }

        public void ShowDialogue(string speakerName, string text)
        {
            if (_dialoguePanel == null) return;

            _dialoguePanel.SetActive(true);
            _speakerNameText.text = speakerName;
            _dialogueLineText.text = text;

            // In a more robust system, you'd disable player movement/input here via an event.
            Debug.Log($"[DialogueUI] {speakerName}: {text}");
        }

        public void HideDialogue()
        {
            if (_dialoguePanel != null)
            {
                _dialoguePanel.SetActive(false);
            }

            // Re-enable player movement/input here.
        }
    }
}

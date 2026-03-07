using RPGProject.Interaction;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace RPGProject.UI
{
    /// <summary>
    /// Connects the player's InteractionDetector to a floating world-space or screen-space UI canvas.
    /// Reads the IInteractable prompt and displays it dynamically.
    /// </summary>
    public class InteractionPromptUI : MonoBehaviour
    {
        [SerializeField] private InteractionDetector _detector;
        [SerializeField] private TextMeshProUGUI _promptText;
        [SerializeField] private GameObject _uiContainer;

        private void Start()
        {
            if (_uiContainer != null)
                _uiContainer.SetActive(false);
        }

        private void LateUpdate()
        {
            if (_detector == null || _uiContainer == null || _promptText == null) return;

            var interactable = _detector.ClosestInteractable;

            if (interactable != null)
            {
                _promptText.text = interactable.InteractionPrompt;
                _uiContainer.SetActive(true);
            }
            else
            {
                _uiContainer.SetActive(false);
            }
        }
    }
}

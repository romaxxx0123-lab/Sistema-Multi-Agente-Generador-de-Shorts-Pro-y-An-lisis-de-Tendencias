using UnityEngine;
using TMPro;
using System.Collections;

namespace RPGProject.UI
{
    /// <summary>
    /// Minimally invasive UI to display short notifications center-screen
    /// (e.g., "Recogiste el mantel", "Vela encendida") and fade them out.
    /// </summary>
    public class NotificationUI : MonoBehaviour
    {
        public static NotificationUI Instance { get; private set; }

        [SerializeField] private TextMeshProUGUI _notificationText;
        [SerializeField] private float _displayDuration = 2.5f;

        private Coroutine _fadeCoroutine;

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

            if (_notificationText != null)
            {
                _notificationText.gameObject.SetActive(false);
            }
        }

        public void ShowNotification(string message)
        {
            if (_notificationText == null) return;

            if (_fadeCoroutine != null)
            {
                StopCoroutine(_fadeCoroutine);
            }

            _notificationText.text = message;
            _notificationText.gameObject.SetActive(true);

            // Simple alpha reset (if using CanvasGroup or TMP alpha)
            var color = _notificationText.color;
            color.a = 1f;
            _notificationText.color = color;

            _fadeCoroutine = StartCoroutine(FadeOutRoutine());
        }

        private IEnumerator FadeOutRoutine()
        {
            yield return new WaitForSeconds(_displayDuration);

            float fadeTime = 1f;
            float elapsedTime = 0f;
            var color = _notificationText.color;

            while (elapsedTime < fadeTime)
            {
                elapsedTime += Time.deltaTime;
                color.a = Mathf.Lerp(1f, 0f, elapsedTime / fadeTime);
                _notificationText.color = color;
                yield return null;
            }

            _notificationText.gameObject.SetActive(false);
        }
    }
}

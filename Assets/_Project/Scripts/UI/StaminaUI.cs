using RPGProject.Player;
using UnityEngine;
using UnityEngine.UI;

namespace RPGProject.UI
{
    /// <summary>
    /// Connects to the PlayerStats to listen for stamina changes
    /// and updates a minimal UI Slider or Image Fill.
    /// </summary>
    public class StaminaUI : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private PlayerStats _playerStats;
        [SerializeField] private Slider _staminaSlider;
        [SerializeField] private Image _staminaFill; // Optional

        private void OnEnable()
        {
            if (_playerStats != null && _playerStats.Stamina != null)
            {
                _playerStats.Stamina.OnStaminaChanged += UpdateUI;
            }
        }

        private void OnDisable()
        {
            if (_playerStats != null && _playerStats.Stamina != null)
            {
                _playerStats.Stamina.OnStaminaChanged -= UpdateUI;
            }
        }

        private void Start()
        {
            // Initial update
            if (_playerStats != null && _playerStats.Stamina != null)
            {
                UpdateUI(_playerStats.Stamina.CurrentStamina / _playerStats.Stamina.MaxStamina);
            }
        }

        private void UpdateUI(float percentage)
        {
            if (_staminaSlider != null)
            {
                _staminaSlider.value = percentage;
            }

            if (_staminaFill != null)
            {
                _staminaFill.fillAmount = percentage;
            }
        }
    }
}

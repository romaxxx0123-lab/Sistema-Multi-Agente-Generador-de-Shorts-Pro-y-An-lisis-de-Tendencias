using System;
using UnityEngine;

namespace RPGProject.Player
{
    public class StaminaComponent : MonoBehaviour
    {
        [SerializeField] private float _maxStamina = 100f;
        [SerializeField] private float _regenRate = 5f;
        [SerializeField] private float _regenDelay = 2f;

        public float MaxStamina => _maxStamina;
        public float CurrentStamina { get; private set; }
        private float _lastUsedTime;

        public event Action<float> OnStaminaChanged;

        private void Awake()
        {
            CurrentStamina = _maxStamina;
        }

        private void Update()
        {
            if (Time.time >= _lastUsedTime + _regenDelay && CurrentStamina < _maxStamina)
            {
                RegenerateStamina(_regenRate * Time.deltaTime);
            }
        }

        public bool UseStamina(float amount)
        {
            if (CurrentStamina < amount) return false;

            CurrentStamina -= amount;
            _lastUsedTime = Time.time;

            OnStaminaChanged?.Invoke(CurrentStamina / _maxStamina);
            return true;
        }

        private void RegenerateStamina(float amount)
        {
            CurrentStamina = Mathf.Min(CurrentStamina + amount, _maxStamina);
            OnStaminaChanged?.Invoke(CurrentStamina / _maxStamina);
        }
    }
}

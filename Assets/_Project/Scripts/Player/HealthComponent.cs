using System;
using UnityEngine;

namespace RPGProject.Player
{
    public class HealthComponent : MonoBehaviour
    {
        [SerializeField] private float _maxHealth = 100f;

        public float CurrentHealth { get; private set; }
        public bool IsDead => CurrentHealth <= 0;

        public event Action<float> OnHealthChanged;
        public event Action OnDeath;

        private void Awake()
        {
            CurrentHealth = _maxHealth;
        }

        public void TakeDamage(float amount)
        {
            if (IsDead || amount <= 0) return;

            CurrentHealth = Mathf.Max(CurrentHealth - amount, 0);
            OnHealthChanged?.Invoke(CurrentHealth / _maxHealth);

            if (IsDead)
            {
                OnDeath?.Invoke();
            }
        }

        public void Heal(float amount)
        {
            if (IsDead || amount <= 0) return;

            CurrentHealth = Mathf.Min(CurrentHealth + amount, _maxHealth);
            OnHealthChanged?.Invoke(CurrentHealth / _maxHealth);
        }
    }
}

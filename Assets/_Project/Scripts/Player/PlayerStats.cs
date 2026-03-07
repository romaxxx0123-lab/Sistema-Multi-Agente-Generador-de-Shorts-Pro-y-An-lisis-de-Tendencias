using UnityEngine;

namespace RPGProject.Player
{
    /// <summary>
    /// Centralized hub for managing all player statistics like health, stamina,
    /// progression, and modifiers without directly coupling to logic controllers.
    /// </summary>
    [RequireComponent(typeof(HealthComponent))]
    [RequireComponent(typeof(StaminaComponent))]
    public class PlayerStats : MonoBehaviour
    {
        public HealthComponent Health { get; private set; }
        public StaminaComponent Stamina { get; private set; }

        private void Awake()
        {
            Health = GetComponent<HealthComponent>();
            Stamina = GetComponent<StaminaComponent>();

            // Register delegates and events here
        }

        private void OnEnable()
        {
            if (Health != null)
                Health.OnDeath += HandleDeath;
        }

        private void OnDisable()
        {
            if (Health != null)
                Health.OnDeath -= HandleDeath;
        }

        private void HandleDeath()
        {
            Debug.Log("[PlayerStats] Player has died. Triggering game over or respawn event.");
            // Raise global event for Player Death
        }
    }
}

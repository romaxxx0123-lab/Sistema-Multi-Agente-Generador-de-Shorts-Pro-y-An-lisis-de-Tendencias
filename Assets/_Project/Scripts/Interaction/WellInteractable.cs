using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Representa el pozo en el exterior de la capilla.
    /// Actualmente sirve como placeholder para la futura misión de recolectar agua.
    /// </summary>
    public class WellInteractable : InteractableBase
    {
        private void Awake()
        {
            _promptMessage = "Sacar agua";
        }

        [Header("World State Integration")]
        [SerializeField] private string _requiredQuestID = "prep_capilla";
        [SerializeField] private string _flagToSet = "env_pozo_revisado";

        protected override bool OnInteract(GameObject interactor)
        {
            // Close dialogue UI if open
            if (RPGProject.UI.DialogueUI.Instance != null && RPGProject.UI.DialogueUI.Instance.IsActive)
                RPGProject.UI.DialogueUI.Instance.HideDialogue();

            // Simple validation to ensure quest is active
            if (RPGProject.World.WorldStateManager.Instance != null &&
                RPGProject.World.WorldStateManager.Instance.GetFlag($"quest_{_requiredQuestID}_started"))
            {
                if (!RPGProject.World.WorldStateManager.Instance.GetFlag(_flagToSet))
                {
                    Debug.Log("[Pozo] Has sacado agua fresca del pozo.");
                    RPGProject.World.WorldStateManager.Instance.SetFlag(_flagToSet, true);
                    return true;
                }
                else
                {
                    Debug.Log("[Pozo] Ya tienes suficiente agua.");
                    return false;
                }
            }

            Debug.Log("[Pozo] El agua del pozo refleja el cielo tranquilo. Aún no necesito agua.");
            return false;
        }
    }
}

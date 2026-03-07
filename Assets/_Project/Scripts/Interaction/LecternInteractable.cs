using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Representa el atril principal cerca del altar.
    /// Actualmente lee un mensaje estático, futuro lector de escrituras o Lore.
    /// </summary>
    public class LecternInteractable : InteractableBase
    {
        private void Awake()
        {
            _promptMessage = "Leer escrituras";
        }

        [Header("World State Integration")]
        [SerializeField] private string _requiredQuestID = "prep_capilla";
        [SerializeField] private string _flagToSet = "env_escrituras_revisadas";

        protected override bool OnInteract(GameObject interactor)
        {
            if (RPGProject.UI.DialogueUI.Instance != null && RPGProject.UI.DialogueUI.Instance.IsActive)
                RPGProject.UI.DialogueUI.Instance.HideDialogue();

            Debug.Log("[Atril] Un pasaje pacífico está marcado: 'Bienaventurados los puros de corazón, porque ellos verán a Dios'.");

            if (RPGProject.World.WorldStateManager.Instance != null)
            {
                // Solo marcamos progreso si la quest está activa y no se ha leído ya
                if (RPGProject.World.WorldStateManager.Instance.GetFlag($"quest_{_requiredQuestID}_started") &&
                    !RPGProject.World.WorldStateManager.Instance.GetFlag(_flagToSet))
                {
                    RPGProject.World.WorldStateManager.Instance.SetFlag(_flagToSet, true);
                }
            }

            return true;
        }
    }
}

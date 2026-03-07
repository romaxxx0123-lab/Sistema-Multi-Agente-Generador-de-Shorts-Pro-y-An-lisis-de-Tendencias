using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Representa un mantel sagrado doblado.
    /// Solo puede recogerse durante la fase específica de la misión.
    /// </summary>
    public class ClothInteractable : InteractableBase
    {
        [Header("World State Integration")]
        [SerializeField] private string _requiredQuestID = "prep_capilla";
        [SerializeField] private int _requiredPhaseIndex = 1;
        [SerializeField] private string _flagToSet = "player_has_altar_cloth";

        private void Awake()
        {
            _promptMessage = "Recoger mantel";
        }

        private void OnEnable()
        {
            if (RPGProject.World.WorldStateManager.Instance != null)
            {
                RPGProject.World.WorldStateManager.Instance.OnFlagChanged += HandleFlagChanged;
            }
        }

        private void OnDisable()
        {
            if (RPGProject.World.WorldStateManager.Instance != null)
            {
                RPGProject.World.WorldStateManager.Instance.OnFlagChanged -= HandleFlagChanged;
            }
        }

        private void Start()
        {
            if (RPGProject.World.WorldStateManager.Instance != null)
            {
                HandleFlagChanged(_flagToSet, RPGProject.World.WorldStateManager.Instance.GetFlag(_flagToSet));
            }
        }

        private void HandleFlagChanged(string flagName, bool value)
        {
            if (flagName == _flagToSet && value == true)
            {
                gameObject.SetActive(false);
            }
        }

        protected override bool OnInteract(GameObject interactor)
        {
            if (RPGProject.UI.DialogueUI.Instance != null && RPGProject.UI.DialogueUI.Instance.IsActive)
                RPGProject.UI.DialogueUI.Instance.HideDialogue();

            if (RPGProject.Quests.QuestManager.Instance == null || RPGProject.World.WorldStateManager.Instance == null)
            {
                return false;
            }

            var qm = RPGProject.Quests.QuestManager.Instance;

            // Check if quest is active and at least in the required phase
            if (qm.ActiveQuest != null && qm.ActiveQuest.QuestID == _requiredQuestID && qm.CurrentPhaseIndex >= _requiredPhaseIndex)
            {
                Debug.Log("[Sistema] Has recogido el mantel sagrado con cuidado.");
                RPGProject.World.WorldStateManager.Instance.SetFlag(_flagToSet, true);

                if (RPGProject.UI.NotificationUI.Instance != null)
                {
                    RPGProject.UI.NotificationUI.Instance.ShowNotification("Mantel recogido");
                }

                // Desaparecer objeto visualmente
                gameObject.SetActive(false);
                return true;
            }

            // Si el jugador intenta recogerlo antes de tiempo
            if (qm.CurrentPhaseIndex < _requiredPhaseIndex)
            {
                Debug.Log("[Mantel] Es un hermoso paño de lino. Aún no se me ha pedido usarlo.");
                return false;
            }

            return false;
        }
    }
}

using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Limpia o prepara un banco de piedra o madera para que el peregrino descanse.
    /// Fase 1 de la misión 'quest_pilgrim_rest'.
    /// </summary>
    public class RestBenchInteractable : InteractableBase
    {
        [Header("World State Integration")]
        [SerializeField] private string _requiredQuestID = "quest_pilgrim_rest";
        [SerializeField] private int _requiredPhaseIndex = 0;
        [SerializeField] private string _flagToSet = "env_rest_corner_prepared";

        [Header("Visual State")]
        [Tooltip("Malla opcional (ej. un banco limpio o escombros desapareciendo)")]
        [SerializeField] private GameObject _cleanBenchVisuals;

        private void Awake()
        {
            _promptMessage = "Preparar rincón";
        }

        private void OnEnable()
        {
            if (RPGProject.World.WorldStateManager.Instance != null)
                RPGProject.World.WorldStateManager.Instance.OnFlagChanged += HandleFlagChanged;
        }

        private void OnDisable()
        {
            if (RPGProject.World.WorldStateManager.Instance != null)
                RPGProject.World.WorldStateManager.Instance.OnFlagChanged -= HandleFlagChanged;
        }

        private void Start()
        {
            if (RPGProject.World.WorldStateManager.Instance != null)
                SyncState(RPGProject.World.WorldStateManager.Instance.GetFlag(_flagToSet));
        }

        private void HandleFlagChanged(string flagName, bool value)
        {
            if (flagName == _flagToSet)
                SyncState(value);
        }

        private void SyncState(bool isPrepared)
        {
            if (isPrepared)
            {
                _promptMessage = "Rincón limpio";
                if (_cleanBenchVisuals != null) _cleanBenchVisuals.SetActive(true);
            }
            else
            {
                if (_cleanBenchVisuals != null) _cleanBenchVisuals.SetActive(false);
            }
        }

        protected override bool OnInteract(GameObject interactor)
        {
            if (RPGProject.UI.DialogueUI.Instance != null && RPGProject.UI.DialogueUI.Instance.IsActive)
                RPGProject.UI.DialogueUI.Instance.HideDialogue();

            var wm = RPGProject.World.WorldStateManager.Instance;
            var qm = RPGProject.Quests.QuestManager.Instance;

            if (wm != null && wm.GetFlag(_flagToSet))
            {
                Debug.Log("[Rincón] El espacio ya está despejado y limpio.");
                return false;
            }

            if (qm != null && qm.ActiveQuest != null && qm.ActiveQuest.QuestID == _requiredQuestID && qm.CurrentPhaseIndex == _requiredPhaseIndex)
            {
                Debug.Log("[Sistema] Has limpiado el rincón y acomodado el banco.");
                if (RPGProject.UI.NotificationUI.Instance != null)
                    RPGProject.UI.NotificationUI.Instance.ShowNotification("Rincón preparado");

                wm.SetFlag(_flagToSet, true);
                return true;
            }

            Debug.Log("[Rincón] Un rincón frío y polvoriento.");
            return false;
        }
    }
}

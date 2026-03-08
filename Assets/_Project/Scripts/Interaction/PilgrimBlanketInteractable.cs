using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Coloca una manta previamente asignada (o la "saca" de un estado global virtual) sobre el rincón.
    /// Fase 2 de la misión 'quest_pilgrim_rest'.
    /// </summary>
    public class PilgrimBlanketInteractable : InteractableBase
    {
        [Header("World State Integration")]
        [SerializeField] private string _requiredQuestID = "quest_pilgrim_rest";
        [SerializeField] private int _requiredPhaseIndex = 1;
        [SerializeField] private string _flagToSet = "env_pilgrim_blanket_placed";

        [Header("Visual State")]
        [Tooltip("La malla de la manta que aparece sobre el banco")]
        [SerializeField] private GameObject _blanketVisuals;

        private void Awake()
        {
            _promptMessage = "Colocar manta";
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

        private void SyncState(bool isPlaced)
        {
            if (isPlaced)
            {
                _promptMessage = "Manta acomodada";
                if (_blanketVisuals != null) _blanketVisuals.SetActive(true);
            }
            else
            {
                if (_blanketVisuals != null) _blanketVisuals.SetActive(false);
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
                Debug.Log("[Manta] Ya está lista para dar calor.");
                return false;
            }

            if (qm != null && qm.ActiveQuest != null && qm.ActiveQuest.QuestID == _requiredQuestID)
            {
                if (qm.CurrentPhaseIndex < _requiredPhaseIndex)
                {
                    Debug.Log("[Sistema] Primero debo preparar y limpiar el rincón de piedra.");
                    return false;
                }

                if (qm.CurrentPhaseIndex == _requiredPhaseIndex)
                {
                    Debug.Log("[Sistema] Has doblado y colocado una manta gruesa sobre el banco.");
                    if (RPGProject.UI.NotificationUI.Instance != null)
                        RPGProject.UI.NotificationUI.Instance.ShowNotification("Manta colocada");

                    wm.SetFlag(_flagToSet, true);
                    return true;
                }
            }

            return false;
        }
    }
}

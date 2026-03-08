using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Coloca un cuenco de agua fresca (presumiblemente del pozo) junto a la manta.
    /// Fase 3 de la misión 'quest_pilgrim_rest'.
    /// </summary>
    public class WaterBowlInteractable : InteractableBase
    {
        [Header("World State Integration")]
        [SerializeField] private string _requiredQuestID = "quest_pilgrim_rest";
        [SerializeField] private int _requiredPhaseIndex = 2;
        [SerializeField] private string _flagToSet = "env_pilgrim_water_brought";

        [Header("Visual State")]
        [Tooltip("La malla del cuenco con agua")]
        [SerializeField] private GameObject _bowlVisuals;

        private void Awake()
        {
            _promptMessage = "Dejar agua fresca";
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
                _promptMessage = "Agua servida";
                if (_bowlVisuals != null) _bowlVisuals.SetActive(true);
            }
            else
            {
                if (_bowlVisuals != null) _bowlVisuals.SetActive(false);
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
                Debug.Log("[Cuenco] El agua descansa tranquila, lista para calmar la sed.");
                return false;
            }

            if (qm != null && qm.ActiveQuest != null && qm.ActiveQuest.QuestID == _requiredQuestID)
            {
                if (qm.CurrentPhaseIndex < _requiredPhaseIndex)
                {
                    Debug.Log("[Sistema] Debería acomodar la manta primero.");
                    return false;
                }

                if (qm.CurrentPhaseIndex == _requiredPhaseIndex)
                {
                    Debug.Log("[Sistema] Has dejado un cuenco con agua clara junto a la manta.");
                    if (RPGProject.UI.NotificationUI.Instance != null)
                        RPGProject.UI.NotificationUI.Instance.ShowNotification("Agua servida");

                    wm.SetFlag(_flagToSet, true);
                    return true;
                }
            }

            return false;
        }
    }
}

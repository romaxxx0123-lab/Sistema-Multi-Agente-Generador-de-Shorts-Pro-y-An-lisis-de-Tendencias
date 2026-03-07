using UnityEngine;

namespace RPGProject.Core
{
    /// <summary>
    /// Serves as the main entry point and global manager initializer for the game.
    /// Should be the first script that executes in the entry scene.
    /// </summary>
    public class GameBootstrap : MonoBehaviour
    {
        [SerializeField] private bool _initializeOnAwake = true;

        private void Start()
        {
            if (_initializeOnAwake)
            {
                // Se invoca en Start en lugar de Awake para asegurar que
                // WorldStateManager, QuestManager y SaveManager (que usan Awake)
                // ya estén completamente inicializados.
                InitializeGame();
            }
        }

        private void InitializeGame()
        {
            Debug.Log("[GameBootstrap] Initializing Game Systems...");

            // Auto-load on game start
            if (SaveManager.Instance != null)
            {
                if (SaveManager.Instance.HasSaveData())
                {
                    SaveManager.Instance.LoadGame();
                }
                else
                {
                    SaveManager.Instance.NewGame();
                }
            }

            Debug.Log("[GameBootstrap] Initialization Complete.");
        }
    }
}

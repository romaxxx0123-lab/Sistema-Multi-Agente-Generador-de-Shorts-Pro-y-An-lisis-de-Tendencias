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

        private void Awake()
        {
            if (_initializeOnAwake)
            {
                InitializeGame();
            }
        }

        private void InitializeGame()
        {
            Debug.Log("[GameBootstrap] Initializing Game Systems...");

            // TODO: Initialize global event bus, audio systems,
            // state management, and load user settings.

            Debug.Log("[GameBootstrap] Initialization Complete.");
        }
    }
}

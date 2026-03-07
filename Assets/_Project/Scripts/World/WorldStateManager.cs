using System;
using System.Collections.Generic;
using UnityEngine;

namespace RPGProject.World
{
    /// <summary>
    /// A simple, centralized manager to hold persistent boolean flags for the world state.
    /// This is the foundation for saving/loading progress and driving contextual dialogue/quests.
    /// </summary>
    public class WorldStateManager : MonoBehaviour
    {
        public static WorldStateManager Instance { get; private set; }

        private Dictionary<string, bool> _worldFlags = new Dictionary<string, bool>();

        public event Action<string, bool> OnFlagChanged;

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);
            }
            else
            {
                Destroy(gameObject);
            }
        }

        public void SetFlag(string flagName, bool value)
        {
            _worldFlags[flagName] = value;
            Debug.Log($"[WorldState] Flag '{flagName}' set to {value}");
            OnFlagChanged?.Invoke(flagName, value);
        }

        public bool GetFlag(string flagName)
        {
            if (_worldFlags.TryGetValue(flagName, out bool value))
            {
                return value;
            }
            return false; // Default state is false if not found
        }

        // --- Serialización Externa ---

        public Dictionary<string, bool> ExportFlags()
        {
            return new Dictionary<string, bool>(_worldFlags);
        }

        public void ImportFlags(Dictionary<string, bool> loadedFlags)
        {
            _worldFlags.Clear();
            foreach (var kvp in loadedFlags)
            {
                _worldFlags[kvp.Key] = kvp.Value;
                OnFlagChanged?.Invoke(kvp.Key, kvp.Value); // Disparar a UI e Interactuables que están "escuchando" su inicialización
            }
            Debug.Log($"[WorldState] {loadedFlags.Count} flags cargadas.");
        }

        public void ClearFlags()
        {
            _worldFlags.Clear();
            Debug.Log("[WorldState] Flags limpiadas para nueva partida.");
        }
    }
}

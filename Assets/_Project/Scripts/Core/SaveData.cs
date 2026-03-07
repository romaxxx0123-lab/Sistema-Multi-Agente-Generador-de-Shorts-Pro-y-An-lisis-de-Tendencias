using System.Collections.Generic;
using UnityEngine;

namespace RPGProject.Core
{
    /// <summary>
    /// Estructura simple y serializable para guardar el progreso del jugador y el mundo.
    /// Utiliza listas paralelas para serializar diccionarios (limitación de JsonUtility).
    /// </summary>
    [System.Serializable]
    public class SaveData
    {
        [Header("World State Flags")]
        public List<string> FlagKeys = new List<string>();
        public List<bool> FlagValues = new List<bool>();

        [Header("Quest Progress")]
        public string ActiveQuestID = "";
        public int QuestStateValue = 0; // Cast to QuestState enum
        public int QuestPhaseIndex = 0;

        [Header("Player Data")]
        public Vector3 PlayerPosition = Vector3.zero;
        public Quaternion PlayerRotation = Quaternion.identity;
        // Futuro: Virtud Espiritual u otros stats

        public void SetFlags(Dictionary<string, bool> dictionary)
        {
            FlagKeys.Clear();
            FlagValues.Clear();
            foreach (var kvp in dictionary)
            {
                FlagKeys.Add(kvp.Key);
                FlagValues.Add(kvp.Value);
            }
        }

        public Dictionary<string, bool> GetFlags()
        {
            Dictionary<string, bool> dictionary = new Dictionary<string, bool>();
            for (int i = 0; i < FlagKeys.Count; i++)
            {
                dictionary[FlagKeys[i]] = FlagValues[i];
            }
            return dictionary;
        }
    }
}

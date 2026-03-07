using System.IO;
using UnityEngine;
using RPGProject.World;
using RPGProject.Quests;

namespace RPGProject.Core
{
    /// <summary>
    /// Gestiona la lectura y escritura de SaveData en el disco (JSON).
    /// Contiene la API limpia: SaveGame, LoadGame, NewGame, HasSaveData.
    /// </summary>
    public class SaveManager : MonoBehaviour
    {
        public static SaveManager Instance { get; private set; }

        private string _saveFilePath;

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);

                // Definir la ruta segura en cada plataforma (AppData/LocalLow, etc.)
                _saveFilePath = Path.Combine(Application.persistentDataPath, "savegame.json");
            }
            else
            {
                Destroy(gameObject);
            }
        }

        public bool HasSaveData()
        {
            return File.Exists(_saveFilePath);
        }

        public void SaveGame(Transform playerTransform = null)
        {
            SaveData data = new SaveData();

            // 1. Guardar World State (Flags de pozo, vasija, npc, etc.)
            if (WorldStateManager.Instance != null)
            {
                data.SetFlags(WorldStateManager.Instance.ExportFlags());
            }

            // 2. Guardar Estado de Quest Actual
            if (QuestManager.Instance != null && QuestManager.Instance.ActiveQuest != null)
            {
                data.ActiveQuestID = QuestManager.Instance.ActiveQuest.QuestID;
                data.QuestStateValue = (int)QuestManager.Instance.CurrentState;
                data.QuestPhaseIndex = QuestManager.Instance.CurrentPhaseIndex;
            }

            // 3. Guardar Posición de Jugador
            if (playerTransform != null)
            {
                data.PlayerPosition = playerTransform.position;
                data.PlayerRotation = playerTransform.rotation;
            }
            else
            {
                // Backup buscando al player por Tag
                GameObject player = GameObject.FindGameObjectWithTag("Player");
                if (player != null)
                {
                    data.PlayerPosition = player.transform.position;
                    data.PlayerRotation = player.transform.rotation;
                }
            }

            // Serializar y escribir
            string json = JsonUtility.ToJson(data, true);
            File.WriteAllText(_saveFilePath, json);
            Debug.Log($"[SaveManager] Juego guardado exitosamente en: {_saveFilePath}");
        }

        public void LoadGame()
        {
            if (!HasSaveData())
            {
                Debug.LogWarning("[SaveManager] No se encontró partida guardada. Iniciando New Game.");
                NewGame();
                return;
            }

            string json = File.ReadAllText(_saveFilePath);
            SaveData data = JsonUtility.FromJson<SaveData>(json);

            // 1. Restaurar World State
            if (WorldStateManager.Instance != null)
            {
                WorldStateManager.Instance.ImportFlags(data.GetFlags());
            }

            // 2. Restaurar Estado de Quest Actual
            if (QuestManager.Instance != null)
            {
                QuestManager.Instance.RestoreQuestState(data.ActiveQuestID, data.QuestStateValue, data.QuestPhaseIndex);
            }

            // 3. Restaurar Posición de Jugador
            GameObject player = GameObject.FindGameObjectWithTag("Player");
            if (player != null)
            {
                // CharacterController override (Unity a veces pelea con set.position si el CC está activo)
                CharacterController cc = player.GetComponent<CharacterController>();
                if (cc != null) cc.enabled = false;

                player.transform.position = data.PlayerPosition;
                player.transform.rotation = data.PlayerRotation;

                if (cc != null) cc.enabled = true;
            }

            Debug.Log("[SaveManager] Juego cargado exitosamente.");
        }

        public void NewGame()
        {
            if (HasSaveData())
            {
                File.Delete(_saveFilePath);
                Debug.Log("[SaveManager] Partida anterior borrada.");
            }

            if (WorldStateManager.Instance != null) WorldStateManager.Instance.ClearFlags();
            if (QuestManager.Instance != null) QuestManager.Instance.ClearActiveQuest();

            Debug.Log("[SaveManager] Nueva partida iniciada.");
        }
    }
}

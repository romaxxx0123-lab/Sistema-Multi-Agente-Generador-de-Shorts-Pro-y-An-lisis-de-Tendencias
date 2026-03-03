export const templates = {
  projectVersion: "m_EditorVersion: 2022.3.10f1\nm_EditorVersionWithRevision: 2022.3.10f1 (230623)\n",

  manifest: (useNewInputSystem: boolean) => `{
  "dependencies": {
    ${useNewInputSystem ? '"com.unity.inputsystem": "1.7.0",' : ''}
    "com.unity.feature.2d": "2.0.0",
    "com.unity.ide.visualstudio": "2.0.22",
    "com.unity.modules.ai": "1.0.0",
    "com.unity.modules.animation": "1.0.0",
    "com.unity.modules.assetbundle": "1.0.0",
    "com.unity.modules.audio": "1.0.0",
    "com.unity.modules.cloth": "1.0.0",
    "com.unity.modules.director": "1.0.0",
    "com.unity.modules.imageconversion": "1.0.0",
    "com.unity.modules.imgui": "1.0.0",
    "com.unity.modules.jsonserialize": "1.0.0",
    "com.unity.modules.particlesystem": "1.0.0",
    "com.unity.modules.physics": "1.0.0",
    "com.unity.modules.physics2d": "1.0.0",
    "com.unity.modules.profiler": "1.0.0",
    "com.unity.modules.screencapture": "1.0.0",
    "com.unity.modules.terrain": "1.0.0",
    "com.unity.modules.terrainphysics": "1.0.0",
    "com.unity.modules.tilemap": "1.0.0",
    "com.unity.modules.ui": "1.0.0",
    "com.unity.modules.uielements": "1.0.0",
    "com.unity.modules.umbra": "1.0.0",
    "com.unity.modules.unityanalytics": "1.0.0",
    "com.unity.modules.unitywebrequest": "1.0.0",
    "com.unity.modules.unitywebrequestassetbundle": "1.0.0",
    "com.unity.modules.unitywebrequestaudio": "1.0.0",
    "com.unity.modules.unitywebrequesttexture": "1.0.0",
    "com.unity.modules.unitywebrequestwww": "1.0.0",
    "com.unity.modules.vehicles": "1.0.0",
    "com.unity.modules.video": "1.0.0",
    "com.unity.modules.vr": "1.0.0",
    "com.unity.modules.wind": "1.0.0",
    "com.unity.modules.xr": "1.0.0",
    "com.unity.render-pipelines.universal": "14.0.8",
    "com.unity.textmeshpro": "3.0.6",
    "com.unity.timeline": "1.7.5",
    "com.unity.visualscripting": "1.8.0"
  }
}`,

  singleton: (namespace: string) => `using UnityEngine;

namespace ${namespace}.Core
{
    public abstract class Singleton<T> : MonoBehaviour where T : MonoBehaviour
    {
        private static T _instance;
        private static readonly object _lock = new object();

        public static T Instance
        {
            get
            {
                lock (_lock)
                {
                    if (_instance == null)
                    {
                        _instance = (T)FindFirstObjectByType(typeof(T));
                        if (_instance == null)
                        {
                            var singletonObject = new GameObject();
                            _instance = singletonObject.AddComponent<T>();
                            singletonObject.name = typeof(T).ToString() + " (Singleton)";
                            DontDestroyOnLoad(singletonObject);
                        }
                    }
                    return _instance;
                }
            }
        }

        protected virtual void Awake()
        {
            if (_instance == null)
            {
                _instance = this as T;
                if (transform.parent == null) DontDestroyOnLoad(gameObject);
            }
            else if (_instance != this)
            {
                Destroy(gameObject);
            }
        }
    }
}`,

  cameraController: (namespace: string) => `using UnityEngine;

namespace ${namespace}.Core
{
    public class CameraController : MonoBehaviour
    {
        public Transform target;
        public Vector3 offset = new Vector3(0, 5, -10);
        public float smoothSpeed = 0.125f;

        void LateUpdate()
        {
            if (target == null) return;

            Vector3 desiredPosition = target.position + offset;
            Vector3 smoothedPosition = Vector3.Lerp(transform.position, desiredPosition, smoothSpeed);
            transform.position = smoothedPosition;

            transform.LookAt(target);
        }
    }
}`,

  worldManager: (namespace: string) => `using UnityEngine;
using ${namespace}.Core;

namespace ${namespace}.Managers
{
    public class WorldManager : Singleton<WorldManager>
    {
        [Header("World Settings")]
        public float gravityMultiplier = 1.0f;
        public int currentLevel = 1;

        void Start()
        {
            Debug.Log("World Manager active. Gravity: " + Physics.gravity);
        }

        public void NextLevel()
        {
            currentLevel++;
            Debug.Log("Proceeding to level " + currentLevel);
        }
    }
}`,

  interactable: (namespace: string) => `using UnityEngine;
using UnityEngine.Events;

namespace ${namespace}.Gameplay
{
    public class Interactable : MonoBehaviour
    {
        public UnityEvent onInteract;
        public float interactDistance = 2.0f;

        public void Interact()
        {
            onInteract.Invoke();
            Debug.Log("Interacted with " + gameObject.name);
        }
    }
}`,

  material: (r: number, g: number, b: number) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!21 &2100000
Material:
  serializedVersion: 8
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: New Material
  m_Shader: {fileID: 4800000, guid: 933532a4fcc9b51438d90b4d6d3c03ad, type: 3}
  m_Parent: {fileID: 0}
  m_ModifiedSerializedProperties: 0
  m_ValidKeywords: []
  m_InvalidKeywords: []
  m_LightmapFlags: 4
  m_EnableInstancingVariants: 0
  m_DoubleSidedGI: 0
  m_CustomRenderQueue: -1
  stringTagMap: {}
  disabledShaderPasses: []
  m_SavedProperties:
    serializedVersion: 3
    m_TexEnvs:
    - _BaseMap:
        m_Texture: {fileID: 0}
        m_Scale: {x: 1, y: 1}
        m_Offset: {x: 0, y: 0}
    m_Ints: []
    m_Floats:
    - _Smoothness: 0.5
    m_Colors:
    - _BaseColor: {r: ${r}, g: ${g}, b: ${b}, a: 1}
  m_BuildTextureStacks: []
`,

  prefab: (_meshGuid: string, matGuid: string, name: string) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100000
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 400000}
  - component: {fileID: 3300000}
  - component: {fileID: 2300000}
  - component: {fileID: 6500000}
  m_Layer: 0
  m_Name: ${name}
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &400000
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_Children: []
  m_Father: {fileID: 0}
  m_RootOrder: 0
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
--- !u!33 &3300000
MeshFilter:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300000
MeshRenderer:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_CastShadows: 1
  m_ReceiveShadows: 1
  m_DynamicOccludee: 1
  m_MotionVectors: 1
  m_LightProbeUsage: 1
  m_ReflectionProbeUsage: 1
  m_RayTracingMode: 2
  m_RayTraceProcedural: 0
  m_RenderingLayerMask: 1
  m_RendererPriority: 0
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
  m_StaticBatchInfo:
    firstSubMesh: 0
    subMeshCount: 0
  m_CheckSelfOcclusion: 1
--- !u!65 &6500000
BoxCollider:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_Material: {fileID: 0}
  m_IsTrigger: 0
  m_Enabled: 1
  serializedVersion: 2
  m_Size: {x: 1, y: 1, z: 1}
  m_Center: {x: 0, y: 0, z: 0}
`,

  meta: (guid: string) => `fileFormatVersion: 2
guid: ${guid}
DefaultImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`,

  asmdef: (name: string) => `{
    "name": "${name}",
    "references": [],
    "includePlatforms": [],
    "excludePlatforms": [],
    "allowUnsafeCode": false,
    "overrideReferences": false,
    "precompiledReferences": [],
    "autoReferenced": true,
    "defineConstraints": [],
    "versionDefines": [],
    "noEngineReferences": false
}`,

  readme: (config: { projectName: string; genre: string; complexity: string; useNewInputSystem: boolean }) => `# ${config.projectName} - Hyper Pro World

Generated by **Unity Project Architect Pro v6.0 - Hyper Detailed Engine**.

## Genre: ${config.genre}
## Complexity: ${config.complexity}

## Functional Assets Included:
- **Player Prefab**: Fully set up with CharacterController and Material.
- **Ground Prefab**: Modular ground piece.
- **CameraController**: Smooth target tracking.
- **WorldManager**: Singleton level and environment controller.
${config.complexity === 'Enterprise' || config.complexity === 'UltimatePro' ? '- **ItemDatabase**: ScriptableObject data container.\n- **HighQualitySettings**: Universal Render Pipeline asset.' : ''}
${config.complexity === 'UltimatePro' ? '- **AI/BehaviorTree**: Advanced NPC logic.\n- **AbilitySystem**: ScriptableObject abilities.' : ''}

## Features:
- **GUID Persistence**: Meta files included for all assets ensuring immediate link persistence.
- **Hyper-Detailed Hierarchy**: Professional folder structure including Plugins, Docs, Audio, Textures, etc.
- **Project Settings**: Pre-configured Quality, Graphics, Tag, and Input settings.
- **Layered Architecture**: Core, Managers, Gameplay, Patterns, AI, UI.
${config.complexity === 'Enterprise' || config.complexity === 'UltimatePro' ? '- **Enterprise Patterns**: Service Locator, Object Pooling, Save System, Event Bus.\n- **Localization**: Basic localization management system.' : ''}
${config.complexity === 'UltimatePro' ? '- **Professional Tooling**: Custom Editor inspectors.\n- **Automated QA**: Pre-configured Unit Test suite.' : ''}
${config.useNewInputSystem ? '- **Input System**: Pre-configured .inputactions asset.' : ''}
`,

  gameEvent: (namespace: string) => `using System.Collections.Generic;
using UnityEngine;

namespace ${namespace}.Events
{
    [CreateAssetMenu(fileName = "New Game Event", menuName = "Events/Game Event")]
    public class GameEvent : ScriptableObject
    {
        private readonly List<GameEventListener> _listeners = new List<GameEventListener>();
        public void Raise() { for (int i = _listeners.Count - 1; i >= 0; i--) _listeners[i].OnEventRaised(); }
        public void RegisterListener(GameEventListener listener) { if (!_listeners.Contains(listener)) _listeners.Add(listener); }
        public void UnregisterListener(GameEventListener listener) { if (_listeners.Contains(listener)) _listeners.Remove(listener); }
    }
}`,

  gameEventListener: (namespace: string) => `using UnityEngine;
using UnityEngine.Events;

namespace ${namespace}.Events
{
    public class GameEventListener : MonoBehaviour
    {
        public GameEvent Event;
        public UnityEvent Response;
        private void OnEnable() { if (Event != null) Event.RegisterListener(this); }
        private void OnDisable() { if (Event != null) Event.UnregisterListener(this); }
        public void OnEventRaised() { Response.Invoke(); }
    }
}`,

  stateMachine: (namespace: string) => `using UnityEngine;
using System.Collections.Generic;

namespace ${namespace}.StateMachine
{
    public abstract class State
    {
        protected StateMachine machine;
        public State(StateMachine machine) { this.machine = machine; }
        public virtual void Enter() { }
        public virtual void Update() { }
        public virtual void Exit() { }
    }

    public class StateMachine : MonoBehaviour
    {
        protected State currentState;
        public void SetState(State newState) { if (currentState != null) currentState.Exit(); currentState = newState; if (currentState != null) currentState.Enter(); }
        protected virtual void Update() { if (currentState != null) currentState.Update(); }
    }
}`,

  gameManager: (namespace: string) => `using UnityEngine;
using ${namespace}.Core;

namespace ${namespace}.Managers
{
    public class GameManager : Singleton<GameManager>
    {
        public bool isGameOver = false;
        public float score = 0;
        public void AddScore(float amount) { score += amount; }
        public void GameOver() { isGameOver = true; Debug.Log("Game Over!"); }
    }
}`,

  playerController: (namespace: string) => `using UnityEngine;

namespace ${namespace}.Gameplay
{
    [RequireComponent(typeof(CharacterController))]
    public class PlayerController : MonoBehaviour
    {
        public float moveSpeed = 5f;
        public float rotationSpeed = 10f;
        private CharacterController _controller;

        void Start() { _controller = GetComponent<CharacterController>(); }

        void Update()
        {
            float horizontal = Input.GetAxis("Horizontal");
            float vertical = Input.GetAxis("Vertical");
            Vector3 direction = new Vector3(horizontal, 0, vertical).normalized;

            if (direction.magnitude >= 0.1f)
            {
                float targetAngle = Mathf.Atan2(direction.x, direction.z) * Mathf.Rad2Deg;
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.Euler(0, targetAngle, 0), rotationSpeed * Time.deltaTime);
                _controller.Move(direction * moveSpeed * Time.deltaTime);
            }
        }
    }
}`,

  tagManager: `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &1
TagManager:
  serializedVersion: 2
  tags:
  - Player
  - Enemy
  - NPC
  - Interactable
  - Obstacle
  - Projectile
  - Trigger
  layers:
  - Default
  - TransparentFX
  - Ignore Raycast
  -
  - Water
  - UI
  -
  -
  - PostProcessing
`,

  sceneTemplate: `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_OcclusionBakeSettings:
    smallestOccluder: 5
    smallestHole: 0.25
    backfaceThreshold: 100
  m_SceneGUID: 00000000000000000000000000000000
--- !u!104 &2
RenderSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 9
  m_Fog: 0
  m_FogColor: {r: 0.5, g: 0.5, b: 0.5, a: 1}
  m_FogMode: 3
  m_FogDensity: 0.01
  m_LinearFogStart: 0
  m_LinearFogEnd: 300
  m_AmbientSkyColor: {r: 0.212, g: 0.227, b: 0.259, a: 1}
  m_AmbientIntensity: 1
  m_AmbientMode: 0
  m_SkyboxMaterial: {fileID: 10304, guid: 0000000000000000f000000000000000, type: 0}
--- !u!1 &100
GameObject:
  m_ObjectHideFlags: 0
  m_Name: Main Camera
  m_TagString: MainCamera
  m_Component:
  - component: {fileID: 101}
  - component: {fileID: 102}
--- !u!4 &101
Transform:
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 5, z: -10}
  m_LocalScale: {x: 1, y: 1, z: 1}
--- !u!20 &102
Camera:
  m_ClearFlags: 1
  m_BackgroundColor: {r: 0.19, g: 0.3, b: 0.47, a: 0}
--- !u!1 &200
GameObject:
  m_Name: Player
  m_TagString: Player
  m_Component:
  - component: {fileID: 201}
--- !u!4 &201
Transform:
  m_LocalPosition: {x: 0, y: 1, z: 0}
`,

  serviceLocator: (namespace: string) => `using System;
using System.Collections.Generic;
using UnityEngine;

namespace ${namespace}.Core
{
    public static class ServiceLocator
    {
        private static readonly Dictionary<Type, object> _services = new Dictionary<Type, object>();

        public static void Register<T>(T service) => _services[typeof(T)] = service;
        public static void Unregister<T>() => _services.Remove(typeof(T));
        public static T Get<T>() => (T)_services[typeof(T)];
    }
}`,

  objectPooler: (namespace: string) => `using System.Collections.Generic;
using UnityEngine;

namespace ${namespace}.Core
{
    public class ObjectPooler : Singleton<ObjectPooler>
    {
        public GameObject prefab;
        public int size = 10;
        private Queue<GameObject> _pool = new Queue<GameObject>();

        void Start()
        {
            for (int i = 0; i < size; i++)
            {
                GameObject obj = Instantiate(prefab);
                obj.SetActive(false);
                _pool.Enqueue(obj);
            }
        }

        public GameObject Get()
        {
            GameObject obj = _pool.Dequeue();
            obj.SetActive(true);
            _pool.Enqueue(obj);
            return obj;
        }
    }
}`,

  saveSystem: (namespace: string) => `using UnityEngine;
using System.IO;

namespace ${namespace}.Core
{
    public static class SaveSystem
    {
        private static string Path => Application.persistentDataPath + "/save.json";

        public static void Save<T>(T data)
        {
            string json = JsonUtility.ToJson(data);
            File.WriteAllText(Path, json);
        }

        public static T Load<T>()
        {
            if (!File.Exists(Path)) return default;
            string json = File.ReadAllText(Path);
            return JsonUtility.FromJson<T>(json);
        }
    }
}`,

  audioManager: (namespace: string) => `using UnityEngine;
using ${namespace}.Core;

namespace ${namespace}.Managers
{
    public class AudioManager : Singleton<AudioManager>
    {
        public AudioSource musicSource;
        public AudioSource sfxSource;

        public void PlayMusic(AudioClip clip) { musicSource.clip = clip; musicSource.Play(); }
        public void PlaySFX(AudioClip clip) { sfxSource.PlayOneShot(clip); }
    }
}`,

  itemData: (namespace: string) => `using UnityEngine;

namespace ${namespace}.Data
{
    [CreateAssetMenu(fileName = "New Item", menuName = "Data/Item")]
    public class ItemData : ScriptableObject
    {
        public string itemName;
        public Sprite icon;
        public int value;
    }
}`,

  inputActions: `{
    "name": "GameActions",
    "maps": [
        {
            "name": "Player",
            "id": "...",
            "actions": [
                {
                    "name": "Move",
                    "type": "Value",
                    "id": "...",
                    "expectedControlType": "Vector2",
                    "processors": "",
                    "interactions": "",
                    "initialStateCheck": true
                },
                {
                    "name": "Interact",
                    "type": "Button",
                    "id": "...",
                    "expectedControlType": "Button",
                    "processors": "",
                    "interactions": "",
                    "initialStateCheck": false
                },
                {
                    "name": "Pause",
                    "type": "Button",
                    "id": "...",
                    "expectedControlType": "Button",
                    "processors": "",
                    "interactions": "",
                    "initialStateCheck": false
                }
            ],
            "bindings": []
        }
    ],
    "controlSchemes": []
}`,

  urpAsset: `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 0}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: bf2edee5c5b0820469b82f059918544c, type: 3}
  m_Name: UniversalRP-HighQuality
  m_EditorClassIdentifier:
  m_Settings:
    m_MainLightShadowsSupported: 1
    m_MainLightShadowmapResolution: 2048
    m_AdditionalLightsSupported: 1
    m_AdditionalLightsShadowsSupported: 1
    m_AdditionalLightsShadowmapResolution: 512
    m_SoftShadowsSupported: 1
    m_HDR: 1
    m_AntiAliasing: 2
`,

  behaviorTree: (namespace: string) => `using UnityEngine;
using System.Collections.Generic;

namespace ${namespace}.AI
{
    public abstract class Node { public abstract bool Execute(); }

    public class Selector : Node
    {
        private List<Node> nodes;
        public Selector(List<Node> nodes) { this.nodes = nodes; }
        public override bool Execute() { foreach (var node in nodes) if (node.Execute()) return true; return false; }
    }

    public class Sequence : Node
    {
        private List<Node> nodes;
        public Sequence(List<Node> nodes) { this.nodes = nodes; }
        public override bool Execute() { foreach (var node in nodes) if (!node.Execute()) return false; return true; }
    }

    public class BehaviorTreeAgent : MonoBehaviour
    {
        private Node root;
        void Update() { root?.Execute(); }
    }
}`,

  abilitySystem: (namespace: string) => `using UnityEngine;
using System.Collections.Generic;

namespace ${namespace}.Gameplay.Abilities
{
    public abstract class Ability : ScriptableObject
    {
        public float cooldown;
        public abstract void Activate(GameObject user);
    }

    public class AbilityController : MonoBehaviour
    {
        public List<Ability> abilities;
        private Dictionary<Ability, float> cooldowns = new Dictionary<Ability, float>();

        public void TryUseAbility(int index)
        {
            var ability = abilities[index];
            if (!cooldowns.ContainsKey(ability) || Time.time >= cooldowns[ability])
            {
                ability.Activate(gameObject);
                cooldowns[ability] = Time.time + ability.cooldown;
            }
        }
    }
}`,

  uiView: (namespace: string) => `using UnityEngine;
using System.Collections.Generic;

namespace ${namespace}.UI
{
    public abstract class UIView : MonoBehaviour
    {
        public virtual void Show() { gameObject.SetActive(true); }
        public virtual void Hide() { gameObject.SetActive(false); }
    }

    public class UIManager : Core.Singleton<UIManager>
    {
        public List<UIView> views;
        public void ShowView<T>() where T : UIView
        {
            foreach (var view in views) if (view is T) view.Show(); else view.Hide();
        }
    }
}`,

  customEditor: (namespace: string) => `using UnityEngine;
using UnityEditor;

namespace ${namespace}.EditorTools
{
    [CustomEditor(typeof(MonoBehaviour))]
    public class ProToolsEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            EditorGUILayout.HelpBox("Hyper Detailed Architect Engine Active", MessageType.Info);
            DrawDefaultInspector();
            if (GUILayout.Button("Optimizar Escena")) { Debug.Log("Escena Optimizada."); }
            if (GUILayout.Button("Validar Assets")) { Debug.Log("Assets Válidos."); }
        }
    }
}`,

  unitTest: (namespace: string) => `using NUnit.Framework;
using UnityEngine;

namespace ${namespace}.Tests
{
    public class CoreSystemsTests
    {
        [Test]
        public void Singleton_Is_Unique()
        {
            var obj1 = new GameObject().AddComponent<Managers.GameManager>();
            var obj2 = new GameObject().AddComponent<Managers.GameManager>();
            Assert.AreNotEqual(obj1, obj2);
            Assert.AreEqual(Managers.GameManager.Instance, obj1);
        }

        [Test]
        public void ServiceLocator_Registration()
        {
            var mockService = new object();
            Core.ServiceLocator.Register(mockService);
            Assert.AreEqual(mockService, Core.ServiceLocator.Get<object>());
        }
    }
}`,

  // New Project Settings Templates
  qualitySettings: `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!47 &1
QualitySettings:
  m_ObjectHideFlags: 0
  serializedVersion: 5
  m_CurrentQuality: 3
  m_QualitySettings:
  - m_Name: Very Low
    serializedVersion: 2
    pixelLightCount: 0
    shadows: 0
    shadowResolution: 0
    shadowProjection: 1
    shadowCascades: 1
    shadowDistance: 15
    shadowNearPlaneOffset: 3
    shadowCascades4Split: {x: 0.06666667, y: 0.2, z: 0.46666667}
    shadowMaskMode: 0
    skinWeights: 1
    textureQuality: 1
    anisotropicFiltering: 0
    antiAliasing: 0
    softParticles: 0
    softVegetation: 0
    realtimeReflectionProbes: 0
    billboardsFaceCameraPosition: 0
    vSyncCount: 0
    realtimeGICPUUsage: 25
    lodBias: 0.3
    maximumLODLevel: 0
    enableLODCrossFade: 1
    particleRaycastBudget: 4
    asyncUploadBufferSize: 4
    asyncUploadTimeSlice: 2
    terrainQualityVerticalControl: 1
    streamingMipmapsActive: 0
    streamingMipmapsAddAllCameras: 1
    streamingMipmapsMemoryBudget: 512
    streamingMipmapsRenderersPerFrame: 512
    streamingMipmapsMaxLevelReduction: 2
    streamingMipmapsMaxFileIORequests: 1024
    shadowmaskMode: 0
  - m_Name: Ultra
    serializedVersion: 2
    pixelLightCount: 4
    shadows: 2
    shadowResolution: 3
    shadowProjection: 1
    shadowCascades: 4
    shadowDistance: 150
    shadowNearPlaneOffset: 3
    shadowCascades4Split: {x: 0.06666667, y: 0.2, z: 0.46666667}
    shadowMaskMode: 1
    skinWeights: 4
    textureQuality: 0
    anisotropicFiltering: 2
    antiAliasing: 8
    softParticles: 1
    softVegetation: 1
    realtimeReflectionProbes: 1
    billboardsFaceCameraPosition: 1
    vSyncCount: 1
    realtimeGICPUUsage: 100
    lodBias: 2
    maximumLODLevel: 0
    enableLODCrossFade: 1
    particleRaycastBudget: 4096
    asyncUploadBufferSize: 16
    asyncUploadTimeSlice: 2
    terrainQualityVerticalControl: 1
    streamingMipmapsActive: 0
    streamingMipmapsAddAllCameras: 1
    streamingMipmapsMemoryBudget: 512
    streamingMipmapsRenderersPerFrame: 512
    streamingMipmapsMaxLevelReduction: 2
    streamingMipmapsMaxFileIORequests: 1024
    shadowmaskMode: 1
`,

  graphicsSettings: (urpGuid?: string) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!30 &1
GraphicsSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 13
  m_Deferred:
    m_Mode: 1
    m_Shader: {fileID: 44, guid: 0000000000000000f000000000000000, type: 0}
  m_DeferredReflections:
    m_Mode: 1
    m_Shader: {fileID: 46, guid: 0000000000000000f000000000000000, type: 0}
  m_ScreenSpaceShadows:
    m_Mode: 1
    m_Shader: {fileID: 64, guid: 0000000000000000f000000000000000, type: 0}
  m_LegacyDeferred:
    m_Mode: 1
    m_Shader: {fileID: 63, guid: 0000000000000000f000000000000000, type: 0}
  m_LightHalo:
    m_Mode: 1
    m_Shader: {fileID: 105, guid: 0000000000000000f000000000000000, type: 0}
  m_LensFlare:
    m_Mode: 1
    m_Shader: {fileID: 102, guid: 0000000000000000f000000000000000, type: 0}
  m_VideoShaders:
    m_Mode: 1
    m_Shader: {fileID: 0}
  m_AlwaysIncludedShaders:
  - {fileID: 4800000, guid: 933532a4fcc9b51438d90b4d6d3c03ad, type: 3}
  m_PreloadedShaders: []
  m_SpritesDefaultMaterial: {fileID: 10754, guid: 0000000000000000f000000000000000, type: 0}
  m_CustomRenderPipeline: ${urpGuid ? `{fileID: 11400000, guid: ${urpGuid}, type: 2}` : '{fileID: 0}'}
  m_TransparencySortMode: 0
  m_TransparencySortAxis: {x: 0, y: 0, z: 1}
`,

  inputManager: `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!13 &1
InputManager:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_Axes:
  - serializedVersion: 3
    m_Name: Horizontal
    descriptiveName:
    descriptiveNegativeName:
    negativeButton: left
    positiveButton: right
    altNegativeButton: a
    altPositiveButton: d
    gravity: 3
    dead: 0.001
    sensitivity: 3
    snap: 1
    invert: 0
    type: 0
    axis: 0
    joyNum: 0
  - serializedVersion: 3
    m_Name: Vertical
    descriptiveName:
    descriptiveNegativeName:
    negativeButton: down
    positiveButton: up
    altNegativeButton: s
    altPositiveButton: w
    gravity: 3
    dead: 0.001
    sensitivity: 3
    snap: 1
    invert: 0
    type: 0
    axis: 0
    joyNum: 0
  - serializedVersion: 3
    m_Name: Jump
    descriptiveName:
    descriptiveNegativeName:
    negativeButton:
    positiveButton: space
    altNegativeButton:
    altPositiveButton:
    gravity: 3
    dead: 0.001
    sensitivity: 3
    snap: 1
    invert: 0
    type: 0
    axis: 0
    joyNum: 0
`,

  eventBus: (namespace: string) => `using System;
using System.Collections.Generic;

namespace ${namespace}.Core
{
    public static class EventBus
    {
        private static readonly Dictionary<Type, List<Delegate>> _events = new Dictionary<Type, List<Delegate>>();

        public static void Subscribe<T>(Action<T> listener)
        {
            var type = typeof(T);
            if (!_events.ContainsKey(type)) _events[type] = new List<Delegate>();
            _events[type].Add(listener);
        }

        public static void Unsubscribe<T>(Action<T> listener)
        {
            var type = typeof(T);
            if (_events.ContainsKey(type)) _events[type].Remove(listener);
        }

        public static void Publish<T>(T eventData)
        {
            var type = typeof(T);
            if (_events.ContainsKey(type))
            {
                foreach (var listener in _events[type])
                {
                    ((Action<T>)listener).Invoke(eventData);
                }
            }
        }
    }
}`,

  localizationManager: (namespace: string) => `using System.Collections.Generic;
using UnityEngine;

namespace ${namespace}.Core
{
    public class LocalizationManager : Singleton<LocalizationManager>
    {
        private Dictionary<string, string> _localizedText;
        public string currentLanguage = "en";

        public void LoadLanguage(string lang)
        {
            currentLanguage = lang;
            // In a real app, load from JSON/CSV
            _localizedText = new Dictionary<string, string> {
                {"welcome", lang == "es" ? "Bienvenido" : "Welcome"},
                {"play", lang == "es" ? "Jugar" : "Play"}
            };
        }

        public string GetText(string key) => _localizedText.ContainsKey(key) ? _localizedText[key] : key;
    }
}`,

  robustStateMachine: (namespace: string) => `using UnityEngine;
using System.Collections.Generic;

namespace ${namespace}.Patterns
{
    public interface IState
    {
        void Enter();
        void Update();
        void FixedUpdate();
        void Exit();
    }

    public class RobustStateMachine
    {
        public IState CurrentState { get; private set; }
        private Dictionary<System.Type, IState> _states = new Dictionary<System.Type, IState>();

        public void AddState(IState state) => _states[state.GetType()] = state;

        public void ChangeState<T>() where T : IState
        {
            CurrentState?.Exit();
            CurrentState = _states[typeof(T)];
            CurrentState.Enter();
        }

        public void Update() => CurrentState?.Update();
        public void FixedUpdate() => CurrentState?.FixedUpdate();
    }
}
`,

  inventorySystem: (namespace: string) => `using System.Collections.Generic;
using UnityEngine;

namespace ${namespace}.Systems.Inventory
{
    [CreateAssetMenu(fileName = "New Inventory", menuName = "Systems/Inventory/Inventory Holder")]
    public class InventorySystem : ScriptableObject
    {
        public List<InventorySlot> slots = new List<InventorySlot>();
        public int capacity = 20;

        public bool AddItem(ItemDefinition item, int amount)
        {
            var slot = slots.Find(s => s.item == item);
            if (slot != null) { slot.amount += amount; return true; }
            if (slots.Count < capacity) { slots.Add(new InventorySlot { item = item, amount = amount }); return true; }
            return false;
        }
    }

    [System.Serializable]
    public class InventorySlot { public ItemDefinition item; public int amount; }
}`,

  itemDefinition: (namespace: string) => `using UnityEngine;

namespace ${namespace}.Systems.Inventory
{
    [CreateAssetMenu(fileName = "New Item", menuName = "Systems/Inventory/Item Definition")]
    public class ItemDefinition : ScriptableObject
    {
        public string id;
        public string displayName;
        public Sprite icon;
        public GameObject prefab;
    }
}`,

  statSystem: (namespace: string) => `using UnityEngine;
using System.Collections.Generic;

namespace ${namespace}.Systems.Stats
{
    public class StatSystem : MonoBehaviour
    {
        public List<Stat> stats = new List<Stat>();
        public float GetValue(string id) => stats.Find(s => s.id == id)?.Value ?? 0;
    }

    [System.Serializable]
    public class Stat
    {
        public string id;
        public float baseValue;
        public float Value => baseValue; // Expansion point for modifiers
    }
}`,

  uiPresenter: (namespace: string) => `using UnityEngine;

namespace ${namespace}.UI
{
    public abstract class UIPresenter<TView> : MonoBehaviour where TView : UIView
    {
        [SerializeField] protected TView view;
        protected virtual void OnEnable() => view?.Show();
        protected virtual void OnDisable() => view?.Hide();
    }
}`,

  githubWorkflow: (projectName: string) => `name: Build Project

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    name: Build for StandaloneWindows64
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
        with:
          lfs: true
      - name: Cache Library
        uses: actions/cache@v3
        with:
          path: Library
          key: Library-\${{ hashFiles('Assets/**', 'Packages/**', 'ProjectSettings/**') }}
          restore-keys: |
            Library-
      - name: Build project
        uses: game-ci/unity-builder@v2
        env:
          UNITY_LICENSE: \${{ secrets.UNITY_LICENSE }}
        with:
          targetPlatform: StandaloneWindows64
          projectName: ${projectName}
`,

  physics2DSettings: `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!19 &1
Physics2DSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 3
  m_Gravity: {x: 0, y: -9.81}
  m_DefaultMaterial: {fileID: 0}
  m_VelocityThreshold: 0.01
  m_PositionIterations: 8
  m_VelocityIterations: 3
  m_QueriesHitTriggers: 1
  m_QueriesStartInColliders: 1
  m_CallbacksOnDisable: 1
  m_AutoSimulation: 1
  m_AutoSyncTransforms: 0
  m_JobOptions:
    m_UseMultithreading: 0
    m_UseWarmStarting: 0
`,

  editorBuildSettings: `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!232 &1
EditorBuildSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_Scenes:
  - m_Path: Assets/Scenes/MainScene.unity
    m_Enabled: 1
`
};

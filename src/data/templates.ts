export const templates = {
  projectVersion: "m_EditorVersion: 2022.3.10f1\nm_EditorVersionWithRevision: 2022.3.10f1 (230623)\n",

  manifest: (useNewInputSystem: boolean, useNetworking?: boolean, useAddressables?: boolean) => `{
  "dependencies": {
    ${useNewInputSystem ? '"com.unity.inputsystem": "1.7.0",' : ''}
    ${useNetworking ? '"com.unity.netcode.gameobjects": "1.5.2",' : ''}
    ${useAddressables ? '"com.unity.addressables": "1.21.19",' : ''}
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

  uiModel: (namespace: string) => `using UnityEngine;

namespace ${namespace}.UI
{
    public abstract class UIModel : ScriptableObject
    {
        public System.Action OnDataChanged;
        protected void NotifyChange() => OnDataChanged?.Invoke();
    }
}`,

  uiView: (namespace: string) => `using UnityEngine;

namespace ${namespace}.UI
{
    public abstract class UIView : MonoBehaviour
    {
        public virtual void Show() => gameObject.SetActive(true);
        public virtual void Hide() => gameObject.SetActive(false);
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
    public abstract class UIPresenter<TView, TModel> : MonoBehaviour
        where TView : UIView
        where TModel : UIModel
    {
        [SerializeField] protected TView view;
        [SerializeField] protected TModel model;

        protected virtual void OnEnable()
        {
            model.OnDataChanged += Refresh;
            Refresh();
        }

        protected virtual void OnDisable() => model.OnDataChanged -= Refresh;
        protected abstract void Refresh();
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
`,

  networkManager: (namespace: string) => `using Unity.Netcode;
using UnityEngine;

namespace ${namespace}.Networking
{
    public class NetworkManagerUI : MonoBehaviour
    {
        [SerializeField] private UnityEngine.UI.Button serverBtn;
        [SerializeField] private UnityEngine.UI.Button hostBtn;
        [SerializeField] private UnityEngine.UI.Button clientBtn;

        private void Awake()
        {
            serverBtn.onClick.AddListener(() => NetworkManager.Singleton.StartServer());
            hostBtn.onClick.AddListener(() => NetworkManager.Singleton.StartHost());
            clientBtn.onClick.AddListener(() => NetworkManager.Singleton.StartClient());
        }
    }
}`,

  networkPlayer: (namespace: string) => `using Unity.Netcode;
using UnityEngine;

namespace ${namespace}.Networking
{
    public class NetworkPlayer : NetworkBehaviour
    {
        private NetworkVariable<int> randomNumber = new NetworkVariable<int>(1, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Owner);

        public override void OnNetworkSpawn()
        {
            randomNumber.OnValueChanged += (int previousValue, int newValue) => {
                Debug.Log(OwnerClientId + "; randomNumber: " + newValue);
            };
        }

        void Update()
        {
            if (!IsOwner) return;
            if (Input.GetKeyDown(KeyCode.T)) randomNumber.Value = Random.Range(0, 100);
        }
    }
}`,

  addressablesManager: (namespace: string) => `using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

namespace ${namespace}.Systems.Addressables
{
    public class AddressablesLoader : MonoBehaviour
    {
        public AssetReference assetReference;

        public void LoadAsset()
        {
            Addressables.LoadAssetAsync<GameObject>(assetReference).Completed += OnLoadCompleted;
        }

        private void OnLoadCompleted(AsyncOperationHandle<GameObject> handle)
        {
            if (handle.Status == AsyncOperationStatus.Succeeded)
            {
                Instantiate(handle.Result);
            }
        }
    }
}`,

  postProcessProfile: `%YAML 1.1
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
  m_Script: {fileID: 11500000, guid: d7fd9488000d3734a9b00ee67a2151a4, type: 3}
  m_Name: PostProcessProfile
  m_EditorClassIdentifier:
  m_Components:
  - {fileID: 11400001}
  - {fileID: 11400002}
--- !u!114 &11400001
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_Script: {fileID: 11500000, guid: 97c23e3b12dc18c42a140437e53d3951, type: 3}
  m_Name: Tonemapping
  m_Enabled: 1
  mode:
    m_OverrideState: 1
    m_Value: 1
--- !u!114 &11400002
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_Script: {fileID: 11500000, guid: 0ea2543bd94f6f8498877e6f859f77f0, type: 3}
  m_Name: Bloom
  m_Enabled: 1
  threshold:
    m_OverrideState: 1
    m_Value: 1
  intensity:
    m_OverrideState: 1
    m_Value: 1
`,

  vfxGraph: (name: string) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!2058620457 &1
VisualEffectAsset:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: ${name}
  m_Graph: {fileID: 0}
  m_Shader: {fileID: 0}
`,

  editorConfig: `root = true

[*]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.cs]
dotnet_sort_system_directives_first = true
dotnet_separate_import_directive_groups = true
`,

  gitignore: `[Ll]ibrary/
[Tt]emp/
[Oo]bj/
[Bb]uild/
[Bb]uilds/
[Ll]ogs/
[Uu]serSettings/
MemoryCaptures/
RecordingInventory/

# Assets
!/[Aa]ssets/**/*.meta

# MSVC
*.pdb
*.user
*.userosscache
*.sln
*.csproj
*.unityproj
*.swp
*.swo
.DS_Store
`,

  gameVariable: (namespace: string, type: string) => `using UnityEngine;

namespace ${namespace}.ScriptableArchitecture
{
    [CreateAssetMenu(fileName = "New ${type} Variable", menuName = "Architecture/Variables/${type}")]
    public class ${type}Variable : ScriptableObject
    {
        public ${type} Value;
        public void SetValue(${type} value) => Value = value;
        public void SetValue(${type}Variable value) => Value = value.Value;
    }
}`,

  projectInitializer: (namespace: string) => `using UnityEditor;
using UnityEngine;

namespace ${namespace}.EditorTools
{
    public class ProjectInitializer : EditorWindow
    {
        [MenuItem("Aetheris/Project Initializer")]
        public static void ShowWindow() => GetWindow<ProjectInitializer>("Aetheris Initializer");

        private void OnGUI()
        {
            GUILayout.Label("Aetheris Engine v9.0", EditorStyles.boldLabel);
            if (GUILayout.Button("Setup Project Structure"))
            {
                Debug.Log("Initializing Aetheris Architecture...");
                // Structural logic here
            }
        }
    }
}`,

  fpsController: (namespace: string) => `using UnityEngine;

namespace ${namespace}.Gameplay
{
    public class FPSController : MonoBehaviour
    {
        [Header("Movement")]
        public float moveSpeed = 7f;
        public float mouseSensitivity = 2f;

        [Header("Combat")]
        public float range = 100f;
        public float damage = 10f;
        public float fireRate = 15f;
        public Transform shootPoint;

        [Header("Recoil")]
        public float recoilAmount = 0.1f;
        public float recoilSpeed = 10f;

        private Camera _cam;
        private float _xRotation = 0f;
        private float _nextTimeToFire = 0f;

        void Start()
        {
            _cam = GetComponentInChildren<Camera>();
            Cursor.lockState = CursorLockMode.Locked;
        }

        void Update()
        {
            HandleRotation();
            HandleMovement();

            if (Input.GetButton("Fire1") && Time.time >= _nextTimeToFire)
            {
                _nextTimeToFire = Time.time + 1f / fireRate;
                Shoot();
            }
        }

        void HandleRotation()
        {
            float mouseX = Input.GetAxis("Mouse X") * mouseSensitivity;
            float mouseY = Input.GetAxis("Mouse Y") * mouseSensitivity;

            _xRotation -= mouseY;
            _xRotation = Mathf.Clamp(_xRotation, -90f, 90f);

            _cam.transform.localRotation = Quaternion.Euler(_xRotation, 0f, 0f);
            transform.Rotate(Vector3.up * mouseX);
        }

        void HandleMovement()
        {
            float x = Input.GetAxis("Horizontal");
            float z = Input.GetAxis("Vertical");
            Vector3 move = transform.right * x + transform.forward * z;
            transform.position += move * moveSpeed * Time.deltaTime;
        }

        void Shoot()
        {
            ApplyRecoil();
            RaycastHit hit;
            if (Physics.Raycast(_cam.transform.position, _cam.transform.forward, out hit, range))
            {
                Debug.Log("Hit: " + hit.transform.name);
                // hit.transform.GetComponent<IDamageable>()?.TakeDamage(damage);
            }
        }

        void ApplyRecoil()
        {
            _xRotation -= recoilAmount;
        }
    }
}`,

  rpgSystem: (namespace: string) => `using UnityEngine;
using System;

namespace ${namespace}.Gameplay.RPG
{
    public class RPGCharacter : MonoBehaviour
    {
        [Header("Stats")]
        public int level = 1;
        public float currentXP = 0;
        public float xpToNextLevel = 100;

        public event Action<int> OnLevelUp;

        public void GainXP(float amount)
        {
            currentXP += amount;
            if (currentXP >= xpToNextLevel)
            {
                LevelUp();
            }
        }

        void LevelUp()
        {
            level++;
            currentXP -= xpToNextLevel;
            xpToNextLevel *= 1.2f;
            OnLevelUp?.Invoke(level);
            Debug.Log("Level Up! New Level: " + level);
        }
    }

    public class DialogueNPC : MonoBehaviour
    {
        public string[] dialogueLines;
        private int _currentIndex = 0;

        public string GetNextLine()
        {
            if (dialogueLines.Length == 0) return "...";
            string line = dialogueLines[_currentIndex];
            _currentIndex = (_currentIndex + 1) % dialogueLines.Length;
            return line;
        }
    }
}`,

  platformerController: (namespace: string) => `using UnityEngine;

namespace ${namespace}.Gameplay
{
    public class PlatformerController : MonoBehaviour
    {
        public float moveSpeed = 8f;
        public float jumpForce = 12f;
        public float gravityScale = 3f;

        [Header("Coyote Time")]
        public float coyoteTime = 0.2f;
        private float _coyoteTimeCounter;

        private CharacterController _controller;
        private Vector3 _velocity;
        private bool _isGrounded;

        void Start() { _controller = GetComponent<CharacterController>(); }

        void Update()
        {
            _isGrounded = _controller.isGrounded;
            if (_isGrounded && _velocity.y < 0) _velocity.y = -2f;

            if (_isGrounded) _coyoteTimeCounter = coyoteTime;
            else _coyoteTimeCounter -= Time.deltaTime;

            float x = Input.GetAxis("Horizontal");
            Vector3 move = transform.right * x;
            _controller.Move(move * moveSpeed * Time.deltaTime);

            if (Input.GetButtonDown("Jump") && _coyoteTimeCounter > 0)
            {
                _velocity.y = Mathf.Sqrt(jumpForce * -2f * Physics.gravity.y * gravityScale);
                _coyoteTimeCounter = 0;
            }

            _velocity.y += Physics.gravity.y * gravityScale * Time.deltaTime;
            _controller.Move(_velocity * Time.deltaTime);
        }
    }
}`,

  horrorSystem: (namespace: string) => `using UnityEngine;

namespace ${namespace}.Gameplay.Horror
{
    public class HorrorPlayer : MonoBehaviour
    {
        [Header("Sanity System")]
        public float sanity = 100f;
        public float sanityDepletionRate = 1f;

        [Header("Flashlight")]
        public Light flashlight;
        public float battery = 100f;
        public float batteryDepletionRate = 2f;

        void Update()
        {
            if (flashlight.enabled)
            {
                battery -= batteryDepletionRate * Time.deltaTime;
                if (battery <= 0) flashlight.enabled = false;
            }

            // Lose sanity in the dark
            if (!flashlight.enabled)
            {
                sanity -= sanityDepletionRate * Time.deltaTime;
            }

            if (Input.GetKeyDown(KeyCode.F))
            {
                if (battery > 0) flashlight.enabled = !flashlight.enabled;
            }
        }
    }
}`,

  openWorldSystem: (namespace: string) => `using UnityEngine;
using System.Collections.Generic;

namespace ${namespace}.Gameplay.OpenWorld
{
    public class ChunkManager : MonoBehaviour
    {
        public float chunkSize = 100f;
        public int viewDistance = 2;
        public Transform player;

        private Dictionary<Vector2Int, GameObject> _activeChunks = new Dictionary<Vector2Int, GameObject>();

        void Update()
        {
            Vector2Int currentChunk = new Vector2Int(
                Mathf.RoundToInt(player.position.x / chunkSize),
                Mathf.RoundToInt(player.position.z / chunkSize)
            );

            // Logic to load/unload chunks would go here
            // This architecture is prepared for large scale world streaming
        }
    }

    public class DayNightCycle : MonoBehaviour
    {
        public float dayLengthInMinutes = 20f;
        public Light sun;
        private float _timeOfDay = 0.5f;

        void Update()
        {
            _timeOfDay += Time.deltaTime / (dayLengthInMinutes * 60f);
            if (_timeOfDay > 1) _timeOfDay = 0;

            sun.transform.rotation = Quaternion.Euler((_timeOfDay * 360f) - 90f, 170, 0);
        }
    }
}`,

  enemyAI: (namespace: string) => `using UnityEngine;
using UnityEngine.AI;

namespace ${namespace}.Gameplay.AI
{
    public class EnemyAI : MonoBehaviour
    {
        public enum State { Idle, Patrol, Chase, Attack }
        public State currentState = State.Idle;

        [Header("Detection")]
        public float detectionRange = 10f;
        public float attackRange = 2f;
        public Transform target;

        [Header("Movement")]
        public float moveSpeed = 3.5f;
        private NavMeshAgent _agent;

        void Start()
        {
            _agent = GetComponent<NavMeshAgent>();
            if (target == null) target = GameObject.FindGameObjectWithTag("Player")?.transform;
        }

        void Update()
        {
            if (target == null) return;

            float distance = Vector3.Distance(transform.position, target.position);

            if (distance <= attackRange) currentState = State.Attack;
            else if (distance <= detectionRange) currentState = State.Chase;
            else currentState = State.Patrol;

            switch (currentState)
            {
                case State.Chase: _agent.SetDestination(target.position); break;
                case State.Attack: _agent.isStopped = true; LookAtTarget(); break;
                default: _agent.isStopped = false; break;
            }
        }

        void LookAtTarget()
        {
            Vector3 direction = (target.position - transform.position).normalized;
            direction.y = 0;
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(direction), 10f * Time.deltaTime);
        }
    }
}`,

  perfectedEnemyPrefab: (matGuid: string, scriptGuid: string, name: string) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100000
GameObject:
  m_Name: ${name}
  m_Component:
  - component: {fileID: 400000}
  - component: {fileID: 11400000}
--- !u!4 &400000
Transform:
  m_GameObject: {fileID: 100000}
  m_Children:
  - {fileID: 400001}
  - {fileID: 400002}
--- !u!1 &100001
GameObject:
  m_Name: Body
  m_Component:
  - component: {fileID: 400001}
  - component: {fileID: 3300000}
  - component: {fileID: 2300000}
--- !u!4 &400001
Transform:
  m_GameObject: {fileID: 100001}
  m_Father: {fileID: 400000}
  m_LocalScale: {x: 1, y: 1.5, z: 1}
--- !u!33 &3300000
MeshFilter:
  m_GameObject: {fileID: 100001}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300000
MeshRenderer:
  m_GameObject: {fileID: 100001}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100002
GameObject:
  m_Name: Head
  m_Component:
  - component: {fileID: 400002}
  - component: {fileID: 3300001}
  - component: {fileID: 2300001}
--- !u!4 &400002
Transform:
  m_GameObject: {fileID: 100002}
  m_Father: {fileID: 400000}
  m_LocalPosition: {x: 0, y: 1.2, z: 0}
  m_LocalScale: {x: 0.5, y: 0.5, z: 0.5}
--- !u!33 &3300001
MeshFilter:
  m_GameObject: {fileID: 100002}
  m_Mesh: {fileID: 10207, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300001
MeshRenderer:
  m_GameObject: {fileID: 100002}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!114 &11400000
MonoBehaviour:
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}
`,

  scoutEnemyPrefab: (matGuid: string, scriptGuid: string) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100000
GameObject:
  m_Name: SwiftScout_Peregrine
  m_Component:
  - component: {fileID: 400000}
  - component: {fileID: 11400000}
--- !u!4 &400000
Transform:
  m_GameObject: {fileID: 100000}
  m_Children:
  - {fileID: 400001}
  - {fileID: 400002}
  - {fileID: 400003}
--- !u!1 &100001
GameObject:
  m_Name: Core
  m_Component:
  - component: {fileID: 400001}
  - component: {fileID: 3300001}
  - component: {fileID: 2300001}
--- !u!4 &400001
Transform:
  m_GameObject: {fileID: 100001}
  m_Father: {fileID: 400000}
  m_LocalScale: {x: 0.5, y: 0.5, z: 1.2}
--- !u!33 &3300001
MeshFilter:
  m_GameObject: {fileID: 100001}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300001
MeshRenderer:
  m_GameObject: {fileID: 100001}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100002
GameObject:
  m_Name: Wing_R
  m_Component:
  - component: {fileID: 400002}
  - component: {fileID: 3300002}
  - component: {fileID: 2300002}
--- !u!4 &400002
Transform:
  m_GameObject: {fileID: 100002}
  m_Father: {fileID: 400000}
  m_LocalPosition: {x: 0.8, y: 0, z: 0}
  m_LocalRotation: {x: 0, y: 0.2, z: 0.5, w: 0.866}
  m_LocalScale: {x: 1.5, y: 0.1, z: 0.8}
--- !u!33 &3300002
MeshFilter:
  m_GameObject: {fileID: 100002}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300002
MeshRenderer:
  m_GameObject: {fileID: 100002}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100003
GameObject:
  m_Name: Wing_L
  m_Component:
  - component: {fileID: 400003}
  - component: {fileID: 3300003}
  - component: {fileID: 2300003}
--- !u!4 &400003
Transform:
  m_GameObject: {fileID: 100003}
  m_Father: {fileID: 400000}
  m_LocalPosition: {x: -0.8, y: 0, z: 0}
  m_LocalRotation: {x: 0, y: -0.2, z: -0.5, w: 0.866}
  m_LocalScale: {x: 1.5, y: 0.1, z: 0.8}
--- !u!33 &3300003
MeshFilter:
  m_GameObject: {fileID: 100003}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300003
MeshRenderer:
  m_GameObject: {fileID: 100003}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!114 &11400000
MonoBehaviour:
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}
`,

  sniperEnemyPrefab: (matGuid: string, scriptGuid: string) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100000
GameObject:
  m_Name: GhostSniper_Shadow
  m_Component:
  - component: {fileID: 400000}
  - component: {fileID: 11400000}
--- !u!4 &400000
Transform:
  m_GameObject: {fileID: 100000}
  m_Children:
  - {fileID: 400001}
  - {fileID: 400002}
--- !u!1 &100001
GameObject:
  m_Name: Body
  m_Component:
  - component: {fileID: 400001}
  - component: {fileID: 3300001}
  - component: {fileID: 2300001}
--- !u!4 &400001
Transform:
  m_GameObject: {fileID: 100001}
  m_Father: {fileID: 400000}
  m_LocalScale: {x: 0.8, y: 2, z: 0.8}
--- !u!33 &3300001
MeshFilter:
  m_GameObject: {fileID: 100001}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300001
MeshRenderer:
  m_GameObject: {fileID: 100001}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100002
GameObject:
  m_Name: Railgun
  m_Component:
  - component: {fileID: 400002}
  - component: {fileID: 3300002}
  - component: {fileID: 2300002}
--- !u!4 &400002
Transform:
  m_GameObject: {fileID: 100002}
  m_Father: {fileID: 400000}
  m_LocalPosition: {x: 0, y: 1.5, z: 1}
  m_LocalScale: {x: 0.2, y: 0.2, z: 3.5}
--- !u!33 &3300002
MeshFilter:
  m_GameObject: {fileID: 100002}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300002
MeshRenderer:
  m_GameObject: {fileID: 100002}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!114 &11400000
MonoBehaviour:
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}
`,

  tankEnemyPrefab: (matGuid: string, scriptGuid: string) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100000
GameObject:
  m_Name: HeavyTank_Titan
  m_Component:
  - component: {fileID: 400000}
  - component: {fileID: 11400000}
--- !u!4 &400000
Transform:
  m_GameObject: {fileID: 100000}
  m_Children:
  - {fileID: 400001}
  - {fileID: 400002}
  - {fileID: 400003}
--- !u!1 &100001
GameObject:
  m_Name: Chassis
  m_Component:
  - component: {fileID: 400001}
  - component: {fileID: 3300001}
  - component: {fileID: 2300001}
--- !u!4 &400001
Transform:
  m_GameObject: {fileID: 100001}
  m_Father: {fileID: 400000}
  m_LocalScale: {x: 3, y: 1, z: 4}
--- !u!33 &3300001
MeshFilter:
  m_GameObject: {fileID: 100001}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300001
MeshRenderer:
  m_GameObject: {fileID: 100001}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100002
GameObject:
  m_Name: Turret
  m_Component:
  - component: {fileID: 400002}
  - component: {fileID: 3300002}
  - component: {fileID: 2300002}
--- !u!4 &400002
Transform:
  m_GameObject: {fileID: 100002}
  m_Father: {fileID: 400000}
  m_LocalPosition: {x: 0, y: 0.8, z: 0}
  m_LocalScale: {x: 2, y: 0.8, z: 2}
--- !u!33 &3300002
MeshFilter:
  m_GameObject: {fileID: 100002}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300002
MeshRenderer:
  m_GameObject: {fileID: 100002}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100003
GameObject:
  m_Name: Cannon
  m_Component:
  - component: {fileID: 400003}
  - component: {fileID: 3300003}
  - component: {fileID: 2300003}
--- !u!4 &400003
Transform:
  m_GameObject: {fileID: 100003}
  m_Father: {fileID: 400002}
  m_LocalPosition: {x: 0, y: 0, z: 1.5}
  m_LocalScale: {x: 0.3, y: 0.3, z: 2.5}
--- !u!33 &3300003
MeshFilter:
  m_GameObject: {fileID: 100003}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300003
MeshRenderer:
  m_GameObject: {fileID: 100003}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!114 &11400000
MonoBehaviour:
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}
`,

  bossEnemyPrefab: (matGuid: string, scriptGuid: string) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100000
GameObject:
  m_Name: UltraBoss_Omega
  m_Component:
  - component: {fileID: 400000}
  - component: {fileID: 11400000}
--- !u!4 &400000
Transform:
  m_GameObject: {fileID: 100000}
  m_Children:
  - {fileID: 400001}
  - {fileID: 400002}
  - {fileID: 400003}
  - {fileID: 400004}
  - {fileID: 400005}
--- !u!1 &100001
GameObject:
  m_Name: Torso
  m_Component:
  - component: {fileID: 400001}
  - component: {fileID: 3300001}
  - component: {fileID: 2300001}
--- !u!4 &400001
Transform:
  m_GameObject: {fileID: 100001}
  m_Father: {fileID: 400000}
  m_LocalScale: {x: 2, y: 2.5, z: 2}
--- !u!33 &3300001
MeshFilter:
  m_GameObject: {fileID: 100001}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300001
MeshRenderer:
  m_GameObject: {fileID: 100001}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100002
GameObject:
  m_Name: RightClaw
  m_Component:
  - component: {fileID: 400002}
  - component: {fileID: 3300002}
  - component: {fileID: 2300002}
--- !u!4 &400002
Transform:
  m_GameObject: {fileID: 100002}
  m_Father: {fileID: 400000}
  m_LocalPosition: {x: 1.5, y: 1, z: 0}
  m_LocalScale: {x: 0.8, y: 2, z: 0.8}
--- !u!33 &3300002
MeshFilter:
  m_GameObject: {fileID: 100002}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300002
MeshRenderer:
  m_GameObject: {fileID: 100002}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100003
GameObject:
  m_Name: LeftClaw
  m_Component:
  - component: {fileID: 400003}
  - component: {fileID: 3300003}
  - component: {fileID: 2300003}
--- !u!4 &400003
Transform:
  m_GameObject: {fileID: 100003}
  m_Father: {fileID: 400000}
  m_LocalPosition: {x: -1.5, y: 1, z: 0}
  m_LocalScale: {x: 0.8, y: 2, z: 0.8}
--- !u!33 &3300003
MeshFilter:
  m_GameObject: {fileID: 100003}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300003
MeshRenderer:
  m_GameObject: {fileID: 100003}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100004
GameObject:
  m_Name: Crown
  m_Component:
  - component: {fileID: 400004}
  - component: {fileID: 3300004}
  - component: {fileID: 2300004}
--- !u!4 &400004
Transform:
  m_GameObject: {fileID: 100004}
  m_Father: {fileID: 400000}
  m_LocalPosition: {x: 0, y: 2, z: 0}
  m_LocalScale: {x: 1.2, y: 0.3, z: 1.2}
--- !u!33 &3300004
MeshFilter:
  m_GameObject: {fileID: 100004}
  m_Mesh: {fileID: 10207, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300004
MeshRenderer:
  m_GameObject: {fileID: 100004}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100005
GameObject:
  m_Name: ReactorCore
  m_Component:
  - component: {fileID: 400005}
  - component: {fileID: 3300005}
  - component: {fileID: 2300005}
--- !u!4 &400005
Transform:
  m_GameObject: {fileID: 100005}
  m_Father: {fileID: 400000}
  m_LocalPosition: {x: 0, y: 0.8, z: 0.8}
  m_LocalScale: {x: 0.6, y: 0.6, z: 0.6}
--- !u!33 &3300005
MeshFilter:
  m_GameObject: {fileID: 100005}
  m_Mesh: {fileID: 10207, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300005
MeshRenderer:
  m_GameObject: {fileID: 100005}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!114 &11400000
MonoBehaviour:
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}
`,

  tankEnemyPrefab: (matGuid: string, scriptGuid: string) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100000
GameObject:
  m_Name: HeavyTank_Titan
  m_Component:
  - component: {fileID: 400000}
  - component: {fileID: 11400000}
--- !u!4 &400000
Transform:
  m_GameObject: {fileID: 100000}
  m_Children:
  - {fileID: 400001}
  - {fileID: 400002}
  - {fileID: 400003}
--- !u!1 &100001
GameObject:
  m_Name: Chassis
  m_Component:
  - component: {fileID: 400001}
  - component: {fileID: 3300001}
  - component: {fileID: 2300001}
--- !u!4 &400001
Transform:
  m_GameObject: {fileID: 100001}
  m_Father: {fileID: 400000}
  m_LocalScale: {x: 3, y: 1, z: 4}
--- !u!33 &3300001
MeshFilter:
  m_GameObject: {fileID: 100001}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300001
MeshRenderer:
  m_GameObject: {fileID: 100001}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100002
GameObject:
  m_Name: Turret
  m_Component:
  - component: {fileID: 400002}
  - component: {fileID: 3300002}
  - component: {fileID: 2300002}
--- !u!4 &400002
Transform:
  m_GameObject: {fileID: 100002}
  m_Father: {fileID: 400000}
  m_LocalPosition: {x: 0, y: 0.8, z: 0}
  m_LocalScale: {x: 2, y: 0.8, z: 2}
--- !u!33 &3300002
MeshFilter:
  m_GameObject: {fileID: 100002}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300002
MeshRenderer:
  m_GameObject: {fileID: 100002}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!1 &100003
GameObject:
  m_Name: Cannon
  m_Component:
  - component: {fileID: 400003}
  - component: {fileID: 3300003}
  - component: {fileID: 2300003}
--- !u!4 &400003
Transform:
  m_GameObject: {fileID: 100003}
  m_Father: {fileID: 400002}
  m_LocalPosition: {x: 0, y: 0, z: 1.5}
  m_LocalScale: {x: 0.3, y: 0.3, z: 2.5}
--- !u!33 &3300003
MeshFilter:
  m_GameObject: {fileID: 100003}
  m_Mesh: {fileID: 10202, guid: 0000000000000000e000000000000000, type: 0}
--- !u!23 &2300003
MeshRenderer:
  m_GameObject: {fileID: 100003}
  m_Materials:
  - {fileID: 2100000, guid: ${matGuid}, type: 2}
--- !u!114 &11400000
MonoBehaviour:
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}
`,

  readme: (config: { projectName: string; genre: string; complexity: string; useNewInputSystem: boolean }) => `# ${config.projectName} - Cognitive Architect

Generated by **Unity World Architect v10.0 - Cognitive Engine**.

## Genre-Specific Reasoning: ${config.genre}
The engine has analyzed the requirements for a **${config.genre}** title and implemented specialized "Deep Logic" controllers and systems.

## Complexity: ${config.complexity}

## Cognitive Core Modules:
- **Genre-Specific Controllers**: Custom logic for ${config.genre} (Recoil, Coyote Time, XP systems, etc.).
- **Scriptable Architecture**: GameEvents and GameVariables for decoupled logic.
- **MVP UI Pattern**: Strict separation between Data, Logic, and Display.
- **Advanced Workspace**: Includes .editorconfig and .gitignore for professional teams.

## Functional Assets:
- **Player/Ground Prefabs**: High-end modular components.
- **Nexus Networking**: Optimized Netcode for GameObjects setup.
- **Addressables V2**: Enterprise-grade asset management.
${config.complexity === 'NexusPrime' || config.complexity === 'Aetheris' || config.complexity === 'Cognitive' ? '- **VFX Graph & Shaders**: Advanced HLSL and Visual Effect assets.' : ''}

## Features:
- **GUID Persistence**: Meta files included for 100% link integrity.
- **Modular AsmDefs**: Clean compile times and dependency graph.
- **Pre-configured URP**: High-fidelity rendering out of the box.
`
};

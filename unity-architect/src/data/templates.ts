export const templates = {
  projectVersion: "m_EditorVersion: 2022.3.10f1\nm_EditorVersionWithRevision: 2022.3.10f1 (230623)\n",

  manifest: `{
  "dependencies": {
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

  readme: (config: {projectName: string, genre: string}) => `# ${config.projectName} - Pro World

Generated by **Unity Project Architect Pro v3.0**.

## Genre: ${config.genre}

## Functional Assets Included:
- **Player Prefab**: Fully set up with CharacterController and Material.
- **Ground Prefab**: Modular ground piece.
- **CameraController**: Smooth target tracking.
- **WorldManager**: Singleton level and environment controller.

## Features:
- GUID-matched assets for immediate link persistence.
- Layered architecture (Core, Managers, Gameplay).
- Scene pre-populated with basic world elements.
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
  - Interactable
  - Obstacle
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
`
};

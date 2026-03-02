export const templates = {
  projectVersion: "m_EditorVersion: 2022.3.10f1\nm_EditorVersionWithRevision: 2022.3.10f1 (230623)\n",

  manifest: `{
  "dependencies": {
    "com.unity.feature.2d": "2.0.0",
    "com.unity.ide.visualstudio": "2.0.22",
    "com.unity.modules.ai": "1.0.0",
    "com.unity.modules.androiddeviceprowler": "1.0.0",
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
    /// <summary>
    /// Thread-safe Singleton implementation for MonoBehaviours.
    /// </summary>
    public abstract class Singleton<T> : MonoBehaviour where T : MonoBehaviour
    {
        private static T _instance;
        private static readonly object _lock = new object();
        private static bool _applicationIsQuitting = false;

        public static T Instance
        {
            get
            {
                if (_applicationIsQuitting)
                {
                    Debug.LogWarning("[Singleton] Instance '" + typeof(T) + "' already destroyed on application quit. Won't create again - returning null.");
                    return null;
                }

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
                if (transform.parent == null)
                {
                    DontDestroyOnLoad(gameObject);
                }
            }
            else if (_instance != this)
            {
                Destroy(gameObject);
            }
        }

        private void OnApplicationQuit()
        {
            _applicationIsQuitting = true;
        }

        private void OnDestroy()
        {
            // Reset instance if this specific object is destroyed (and it was the instance)
            if (_instance == this)
            {
                _instance = null;
            }
        }
    }
}`,

  gameEvent: (namespace: string) => `using System.Collections.Generic;
using UnityEngine;

namespace ${namespace}.Events
{
    [CreateAssetMenu(fileName = "New Game Event", menuName = "Events/Game Event")]
    public class GameEvent : ScriptableObject
    {
        private readonly List<GameEventListener> _listeners = new List<GameEventListener>();

        public void Raise()
        {
            for (int i = _listeners.Count - 1; i >= 0; i--)
            {
                _listeners[i].OnEventRaised();
            }
        }

        public void RegisterListener(GameEventListener listener)
        {
            if (!_listeners.Contains(listener))
                _listeners.Add(listener);
        }

        public void UnregisterListener(GameEventListener listener)
        {
            if (_listeners.Contains(listener))
                _listeners.Remove(listener);
        }
    }
}`,

  eventListener: (namespace: string) => `using UnityEngine;
using UnityEngine.Events;

namespace ${namespace}.Events
{
    public class GameEventListener : MonoBehaviour
    {
        [Tooltip("Event to register with.")]
        public GameEvent Event;

        [Tooltip("Response to raise when Event is raised.")]
        public UnityEvent Response;

        private void OnEnable()
        {
            if (Event != null)
                Event.RegisterListener(this);
        }

        private void OnDisable()
        {
            if (Event != null)
                Event.UnregisterListener(this);
        }

        public void OnEventRaised()
        {
            Response.Invoke();
        }
    }
}`,

  stateMachine: (namespace: string) => `using System.Collections.Generic;
using UnityEngine;

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

        public void SetState(State newState)
        {
            if (currentState != null)
                currentState.Exit();

            currentState = newState;

            if (currentState != null)
                currentState.Enter();
        }

        protected virtual void Update()
        {
            if (currentState != null)
                currentState.Update();
        }
    }
}`,

  asmdef: (name: string) => `{
    "name": "${name}",
    "rootNamespace": "",
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

  readme: (config: {projectName: string, genre: string}) => `# ${config.projectName}

Generated by **Unity Project Architect Pro**.

## Genre: ${config.genre}

## Project Structure
This project follows professional Unity standards with modular Assembly Definitions and a robust ScriptableObject-based event system.

### Architecture Highlights
- **Core Singleton Pattern**: Thread-safe implementation for managers.
- **ScriptableObject Events**: Decoupled communication between systems.
- **State Machine**: Clean logic for character and game states.
- **AsmDefs**: Modularized codebase for faster compilation and clean dependencies.

## Setup Instructions
1. Open this folder in **Unity 2022.3 LTS**.
2. Go to \`Assets/Scenes/MainScene.unity\`.
3. Press Play!

## Technical Stack
- **Render Pipeline**: URP (Universal Render Pipeline)
- **Input System**: New Input System (Package)
- **UI Framework**: UGUI + TextMeshPro
`,

  gameManager: (namespace: string) => `using UnityEngine;
using ${namespace}.Core;
using ${namespace}.Events;

namespace ${namespace}.Managers
{
    public class GameManager : Singleton<GameManager>
    {
        [Header("Global Events")]
        public GameEvent onGameStart;
        public GameEvent onGameOver;

        [Header("Game State")]
        public bool isGameOver = false;
        public float score = 0;

        protected override void Awake()
        {
            base.Awake();
            Debug.Log("GameManager Initialized");
        }

        public void StartGame()
        {
            isGameOver = false;
            score = 0;
            if (onGameStart != null) onGameStart.Raise();
        }

        public void AddScore(float amount)
        {
            score += amount;
        }

        public void GameOver()
        {
            isGameOver = true;
            Debug.Log("Game Over!");
            if (onGameOver != null) onGameOver.Raise();
        }
    }
}`,

  playerController: (namespace: string) => `using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace ${namespace}.Player
{
    [RequireComponent(typeof(CharacterController))]
    public class PlayerController : MonoBehaviour
    {
        [Header("Movement Settings")]
        public float moveSpeed = 5f;
        public float rotationSpeed = 10f;

        private CharacterController _controller;
        private Vector2 _moveInput;

        void Start()
        {
            _controller = GetComponent<CharacterController>();
        }

        void Update()
        {
#if ENABLE_INPUT_SYSTEM
            // Logic handled via Input System callbacks if enabled
#else
            float horizontal = Input.GetAxis("Horizontal");
            float vertical = Input.GetAxis("Vertical");
            _moveInput = new Vector2(horizontal, vertical);
#endif
            HandleMovement();
        }

        private void HandleMovement()
        {
            Vector3 direction = new Vector3(_moveInput.x, 0, _moveInput.y).normalized;

            if (direction.magnitude >= 0.1f)
            {
                float targetAngle = Mathf.Atan2(direction.x, direction.z) * Mathf.Rad2Deg;
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.Euler(0, targetAngle, 0), rotationSpeed * Time.deltaTime);

                _controller.Move(direction * moveSpeed * Time.deltaTime);
            }
        }

#if ENABLE_INPUT_SYSTEM
        public void OnMove(InputValue value)
        {
            _moveInput = value.Get<Vector2>();
        }
#endif
    }
}`,

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
  m_AmbientEquatorColor: {r: 0.114, g: 0.125, b: 0.133, a: 1}
  m_AmbientGroundColor: {r: 0.047, g: 0.043, b: 0.035, a: 1}
  m_AmbientIntensity: 1
  m_AmbientMode: 0
  m_SubtractiveShadowColor: {r: 0.42, g: 0.478, b: 0.627, a: 1}
  m_SkyboxMaterial: {fileID: 10304, guid: 0000000000000000f000000000000000, type: 0}
  m_HaloStrength: 0.5
  m_FlareStrength: 1
  m_FlareFadeSpeed: 3
  m_HaloTexture: {fileID: 0}
  m_SpotCookie: {fileID: 10001, guid: 0000000000000000e000000000000000, type: 0}
  m_DefaultReflectionMode: 0
  m_DefaultReflectionResolution: 128
  m_ReflectionIntensity: 1
  m_CustomReflection: {fileID: 0}
  m_Sun: {fileID: 0}
  m_IndirectSpecularColor: {r: 0.44657844, g: 0.49641222, b: 0.57481694, a: 1}
  m_UseRadianceAmbientProbe: 0
--- !u!157 &3
LightmapSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 12
  m_GIWorkflowMode: 1
  m_GISettings:
    predictedCPUUsage: 80
    realtimeResolution: 2
    bakedResolution: 40
    atlasSize: 1024
    compressionQuality: 1
    ambientOcclusion: 0
    ambientOcclusionMaxDistance: 6
    lightprobeSampleCountMultiplier: 4
    showResolutionOverlay: 1
    profitAndLoss: 0
    bootstrapResolution: 2
    fullImageResolution: 256
    samplingMethod: 1
    indirectPUPoissonSamplingMultiplier: 1
    indirectPUPoissonSamplingStrength: 1
    directPUPoissonSamplingMultiplier: 1
    directPUPoissonSamplingStrength: 1
    aoPUPoissonSamplingMultiplier: 1
    aoPUPoissonSamplingStrength: 1
    bouncePUPoissonSamplingMultiplier: 1
    bouncePUPoissonSamplingStrength: 1
    irradianceSampleCount: 1024
    irradianceSampleMethod: 1
    indirectSampleCount: 1024
    directSampleCount: 1024
    atlasPackingMethod: 0
    aoResolution: 1
    aoTextureResolution: 256
    aoBakeTexture: {fileID: 0}
    aoPUPoissonSampleCount: 1024
    irradiancePUPoissonSampleCount: 1024
    bouncePUPoissonSampleCount: 1024
    aoSampleMethod: 1
    irradiancePUPoissonSamplingStrength: 1
    directPUPoissonSampleCount: 1024
    indirectPUPoissonSampleCount: 1024
    aoPUPoissonSampleCount: 1024
    irradiancePUPoissonSampleCount: 1024
    bouncePUPoissonSampleCount: 1024
    aoSampleMethod: 1
    irradiancePUPoissonSamplingStrength: 1
  m_LightProbeAsset: {fileID: 0}
  m_LightingDataAsset: {fileID: 0}
  m_LightingSettings: {fileID: 0}
--- !u!196 &4
NavMeshSettings:
  serializedVersion: 2
  m_ObjectHideFlags: 0
  m_BuildSettings:
    serializedVersion: 3
    agentRadius: 0.5
    agentHeight: 2
    agentSlope: 45
    agentClimb: 0.4
    ledgeDropHeight: 0
    maxJumpAcrossDistance: 0
    accuratePlacement: 0
    numTilesX: 0
    numTilesY: 0
    debug:
      m_Flags: 0
  m_NavMeshData: {fileID: 0}
`
};

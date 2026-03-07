using UnityEngine;
using RPGProject.World;
using System.Collections;

namespace RPGProject.Environment
{
    /// <summary>
    /// A modular script to attach to specific local lights (e.g. Altar point light).
    /// Listens to a specific world flag to turn on/off or change color smoothly.
    /// </summary>
    [RequireComponent(typeof(Light))]
    public class ReactiveLight : MonoBehaviour
    {
        [Header("Trigger Condition")]
        [SerializeField] private string _targetFlag = "env_altar_dressed";

        [Header("Settings")]
        [SerializeField] private float _activeIntensity = 2f;
        [SerializeField] private float _fadeDuration = 2f;
        [SerializeField] private bool _startOff = true;

        private Light _localLight;
        private Coroutine _fadeRoutine;

        private void Awake()
        {
            _localLight = GetComponent<Light>();
            if (_startOff && _localLight != null)
            {
                _localLight.intensity = 0f;
            }
        }

        private void OnEnable()
        {
            if (WorldStateManager.Instance != null)
            {
                WorldStateManager.Instance.OnFlagChanged += HandleFlagChanged;
            }
        }

        private void OnDisable()
        {
            if (WorldStateManager.Instance != null)
            {
                WorldStateManager.Instance.OnFlagChanged -= HandleFlagChanged;
            }
        }

        private void Start()
        {
            if (WorldStateManager.Instance != null)
            {
                bool isFlagMet = WorldStateManager.Instance.GetFlag(_targetFlag);
                if (_localLight != null)
                {
                    _localLight.intensity = isFlagMet ? _activeIntensity : 0f;
                }
            }
        }

        private void HandleFlagChanged(string flagName, bool value)
        {
            if (flagName == _targetFlag && value == true)
            {
                if (WorldStateManager.Instance.IsLoading)
                {
                    if (_localLight != null) _localLight.intensity = _activeIntensity;
                    return;
                }

                if (_fadeRoutine != null) StopCoroutine(_fadeRoutine);
                _fadeRoutine = StartCoroutine(FadeLightRoutine());
            }
        }

        private IEnumerator FadeLightRoutine()
        {
            if (_localLight == null) yield break;

            float elapsedTime = 0f;
            float startIntensity = _localLight.intensity;

            while (elapsedTime < _fadeDuration)
            {
                elapsedTime += Time.deltaTime;
                _localLight.intensity = Mathf.Lerp(startIntensity, _activeIntensity, elapsedTime / _fadeDuration);
                yield return null;
            }

            _localLight.intensity = _activeIntensity;
        }
    }
}

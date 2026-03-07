using UnityEngine;
using RPGProject.World;
using System.Collections;

namespace RPGProject.Environment
{
    /// <summary>
    /// Master controller for the Chapel's reactive atmosphere.
    /// Adjusts global lighting, skybox colors (simulated), and ambient audio
    /// based on the World State flags to create a contemplative progression.
    /// </summary>
    public class ReactiveAtmosphereController : MonoBehaviour
    {
        [Header("Global Lighting Configuration")]
        [SerializeField] private Light _directionalLight;
        [SerializeField] private Color _coldLightColor = new Color(0.8f, 0.85f, 0.95f);
        [SerializeField] private Color _warmLightColor = new Color(1f, 0.9f, 0.8f);
        [SerializeField] private float _transitionDuration = 3f;

        [Header("Ambient Audio")]
        [SerializeField] private AudioSource _ambientAudioSource;
        [SerializeField] private float _baseVolume = 0.3f;
        [SerializeField] private float _completedVolume = 0.6f;

        [Header("Event Audio Hooks")]
        [SerializeField] private AudioSource _sfxAudioSource;
        [SerializeField] private AudioClip _questCompletedBell;

        private Coroutine _atmosphereTransitionRoutine;
        private bool _isChapelCompleted = false;

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
                // Initial Sync on load
                bool isCompleted = WorldStateManager.Instance.GetFlag("quest_prep_capilla_completed");
                ApplyAtmosphereInstantly(isCompleted);
            }
        }

        private void HandleFlagChanged(string flagName, bool value)
        {
            // React to the completion of the chapel quest
            if (flagName == "quest_prep_capilla_completed" && value == true)
            {
                if (!_isChapelCompleted)
                {
                    _isChapelCompleted = true;
                    TriggerAtmosphereShift();
                }
            }

            // React to Padre Elias interaction (e.g. slight audio change or peace hook)
            if (flagName == "event_spoke_to_padre_elias" && value == true)
            {
                Debug.Log("[Atmosphere] Padre Elías ha dado su bendición. La atmósfera alcanza su máxima paz.");
                // Future: Could trigger a subtle wind sound or dust particles.
            }
        }

        private void TriggerAtmosphereShift()
        {
            if (WorldStateManager.Instance.IsLoading)
            {
                ApplyAtmosphereInstantly(true);
                return;
            }

            if (_atmosphereTransitionRoutine != null)
                StopCoroutine(_atmosphereTransitionRoutine);

            _atmosphereTransitionRoutine = StartCoroutine(TransitionAtmosphereRoutine());

            if (_sfxAudioSource != null && _questCompletedBell != null)
            {
                _sfxAudioSource.PlayOneShot(_questCompletedBell, 0.7f);
            }
        }

        private IEnumerator TransitionAtmosphereRoutine()
        {
            float elapsedTime = 0f;

            Color initialColor = _directionalLight != null ? _directionalLight.color : _coldLightColor;
            float initialVolume = _ambientAudioSource != null ? _ambientAudioSource.volume : _baseVolume;

            while (elapsedTime < _transitionDuration)
            {
                elapsedTime += Time.deltaTime;
                float t = elapsedTime / _transitionDuration;

                if (_directionalLight != null)
                {
                    _directionalLight.color = Color.Lerp(initialColor, _warmLightColor, t);
                }

                if (_ambientAudioSource != null)
                {
                    _ambientAudioSource.volume = Mathf.Lerp(initialVolume, _completedVolume, t);
                }

                yield return null;
            }
        }

        private void ApplyAtmosphereInstantly(bool isCompleted)
        {
            _isChapelCompleted = isCompleted;

            if (_directionalLight != null)
            {
                _directionalLight.color = isCompleted ? _warmLightColor : _coldLightColor;
            }

            if (_ambientAudioSource != null)
            {
                _ambientAudioSource.volume = isCompleted ? _completedVolume : _baseVolume;
            }
        }
    }
}

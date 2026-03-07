using UnityEngine;
using RPGProject.World;

namespace RPGProject.Environment
{
    /// <summary>
    /// A modular script to play specific Audio One-Shots when a flag is triggered.
    /// Useful for decoupling objects (like the cloth or well) from having their own AudioSources.
    /// </summary>
    [RequireComponent(typeof(AudioSource))]
    public class ReactiveAudio : MonoBehaviour
    {
        [Header("Trigger Conditions")]
        [Tooltip("The flag that triggers the audio.")]
        [SerializeField] private string _targetFlag = "player_has_altar_cloth";

        [Header("Settings")]
        [SerializeField] private AudioClip _triggerClip;
        [SerializeField] [Range(0f, 1f)] private float _volume = 1f;

        private AudioSource _audioSource;

        private void Awake()
        {
            _audioSource = GetComponent<AudioSource>();
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

        private void HandleFlagChanged(string flagName, bool value)
        {
            // Do not play SFX during the initial load spike
            if (WorldStateManager.Instance.IsLoading) return;

            if (flagName == _targetFlag && value == true)
            {
                if (_audioSource != null && _triggerClip != null)
                {
                    _audioSource.PlayOneShot(_triggerClip, _volume);
                }
            }
        }
    }
}

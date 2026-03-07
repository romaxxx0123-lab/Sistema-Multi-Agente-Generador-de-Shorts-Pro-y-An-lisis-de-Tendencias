using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// A simple test object to verify the Interaction system works.
    /// Place this on a Cube with a Collider on the "Interactable" layer.
    /// </summary>
    public class DummyInteractable : InteractableBase
    {
        [SerializeField] private Color _interactColor = Color.green;

        private MeshRenderer _renderer;
        private Color _originalColor;

        private void Awake()
        {
            _renderer = GetComponent<MeshRenderer>();
            if (_renderer != null)
            {
                _originalColor = _renderer.material.color;
            }
        }

        protected override bool OnInteract(GameObject interactor)
        {
            Debug.Log($"[DummyInteractable] Interacted by {interactor.name}!");

            if (_renderer != null)
            {
                // Toggle color as visual feedback
                _renderer.material.color = _renderer.material.color == _originalColor ? _interactColor : _originalColor;
            }

            return true;
        }
    }
}

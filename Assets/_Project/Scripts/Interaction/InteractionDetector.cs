using RPGProject.Player;
using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Attaches to the player to detect IInteractable objects within a trigger sphere.
    /// Provides interaction candidates to the UI prompt system and listens to input.
    /// </summary>
    [RequireComponent(typeof(PlayerInputReader))]
    public class InteractionDetector : MonoBehaviour
    {
        [SerializeField] private float _interactionRadius = 2.5f;
        [SerializeField] private LayerMask _interactableMask;

        private Collider[] _colliders = new Collider[3];
        private IInteractable _closestInteractable;
        private PlayerInputReader _input;

        public IInteractable ClosestInteractable => _closestInteractable;

        private void Awake()
        {
            _input = GetComponent<PlayerInputReader>();
        }

        private void OnEnable()
        {
            _input.OnInteractEvent += HandleInteraction;
        }

        private void OnDisable()
        {
            _input.OnInteractEvent -= HandleInteraction;
        }

        private void Update()
        {
            FindClosestInteractable();
        }

        private void HandleInteraction()
        {
            if (_closestInteractable != null)
            {
                _closestInteractable.Interact(gameObject);
            }
        }

        private void FindClosestInteractable()
        {
            int numFound = Physics.OverlapSphereNonAlloc(transform.position, _interactionRadius, _colliders, _interactableMask);

            if (numFound > 0)
            {
                var interactable = _colliders[0].GetComponent<IInteractable>();

                if (interactable != null)
                {
                    _closestInteractable = interactable;
                    return;
                }
            }

            _closestInteractable = null;
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = Color.yellow;
            Gizmos.DrawWireSphere(transform.position, _interactionRadius);
        }
    }
}

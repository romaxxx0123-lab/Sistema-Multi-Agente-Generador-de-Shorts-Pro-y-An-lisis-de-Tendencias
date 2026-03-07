using UnityEngine;
using UnityEngine.InputSystem;

namespace RPGProject.Player
{
    [RequireComponent(typeof(CharacterController))]
    public class PlayerController : MonoBehaviour
    {
        [Header("Movement Settings")]
        [SerializeField] private float _moveSpeed = 4f;
        [SerializeField] private float _rotationSpeed = 10f;
        [SerializeField] private float _gravity = -9.81f;

        private CharacterController _controller;
        private Vector2 _inputVector;
        private Vector3 _velocity;

        // Caching camera transform for relative movement in future iterations
        private Transform _mainCameraTransform;

        private void Awake()
        {
            _controller = GetComponent<CharacterController>();
            if (Camera.main != null)
            {
                _mainCameraTransform = Camera.main.transform;
            }
        }

        private void Update()
        {
            HandleMovement();
            ApplyGravity();
        }

        /// <summary>
        /// Hook for Unity's New Input System 'Send Messages' or via C# events.
        /// </summary>
        public void OnMove(InputAction.CallbackContext context)
        {
            _inputVector = context.ReadValue<Vector2>();
        }

        private void HandleMovement()
        {
            if (_inputVector.sqrMagnitude < 0.01f) return;

            Vector3 moveDirection = new Vector3(_inputVector.x, 0f, _inputVector.y).normalized;

            // Simple movement (Can be updated to camera relative)
            _controller.Move(moveDirection * (_moveSpeed * Time.deltaTime));

            // Smoothly rotate the player model towards the move direction
            if (moveDirection != Vector3.zero)
            {
                Quaternion targetRotation = Quaternion.LookRotation(moveDirection, Vector3.up);
                transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, _rotationSpeed * Time.deltaTime);
            }
        }

        private void ApplyGravity()
        {
            if (_controller.isGrounded && _velocity.y < 0)
            {
                _velocity.y = -2f; // Keep grounded force
            }

            _velocity.y += _gravity * Time.deltaTime;
            _controller.Move(_velocity * Time.deltaTime);
        }
    }
}

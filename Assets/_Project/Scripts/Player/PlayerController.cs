using UnityEngine;

namespace RPGProject.Player
{
    [RequireComponent(typeof(CharacterController))]
    [RequireComponent(typeof(PlayerInputReader))]
    [RequireComponent(typeof(PlayerStats))]
    public class PlayerController : MonoBehaviour
    {
        [Header("Movement Settings")]
        [SerializeField] private float _walkSpeed = 4f;
        [SerializeField] private float _sprintSpeed = 7f;
        [SerializeField] private float _rotationSpeed = 10f;
        [SerializeField] private float _jumpForce = 5f;
        [SerializeField] private float _gravity = -9.81f;

        [Header("Stamina Settings")]
        [SerializeField] private float _sprintStaminaCost = 10f;

        private CharacterController _controller;
        private PlayerInputReader _input;
        private PlayerStats _stats;

        private Vector3 _velocity;
        private Transform _mainCameraTransform;

        private void Awake()
        {
            _controller = GetComponent<CharacterController>();
            _input = GetComponent<PlayerInputReader>();
            _stats = GetComponent<PlayerStats>();

            if (Camera.main != null)
            {
                _mainCameraTransform = Camera.main.transform;
            }
        }

        private void OnEnable()
        {
            _input.OnJumpEvent += HandleJump;
        }

        private void OnDisable()
        {
            _input.OnJumpEvent -= HandleJump;
        }

        private void Update()
        {
            HandleMovement();
            ApplyGravity();
        }

        private void HandleMovement()
        {
            Vector2 inputVector = _input.MoveInput;
            if (inputVector.sqrMagnitude < 0.01f) return;

            // Calculate movement direction relative to camera
            Vector3 forward = _mainCameraTransform.forward;
            Vector3 right = _mainCameraTransform.right;

            // Project onto XZ plane to ignore camera pitch
            forward.y = 0f;
            right.y = 0f;
            forward.Normalize();
            right.Normalize();

            Vector3 moveDirection = (forward * inputVector.y + right * inputVector.x).normalized;

            // Handle Sprinting and Stamina Drain
            float currentSpeed = _walkSpeed;
            if (_input.IsSprinting && _stats.Stamina.CurrentStamina > 0)
            {
                if (_stats.Stamina.UseStamina(_sprintStaminaCost * Time.deltaTime))
                {
                    currentSpeed = _sprintSpeed;
                }
            }

            // Move
            _controller.Move(moveDirection * (currentSpeed * Time.deltaTime));

            // Smoothly rotate the player model towards the move direction
            if (moveDirection != Vector3.zero)
            {
                Quaternion targetRotation = Quaternion.LookRotation(moveDirection, Vector3.up);
                transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, _rotationSpeed * Time.deltaTime);
            }
        }

        private void HandleJump()
        {
            if (_controller.isGrounded && _stats.Stamina.UseStamina(15f))
            {
                _velocity.y = Mathf.Sqrt(_jumpForce * -2f * _gravity);
            }
        }

        private void ApplyGravity()
        {
            if (_controller.isGrounded && _velocity.y < 0)
            {
                _velocity.y = -2f; // Keep player snapped to ground
            }

            _velocity.y += _gravity * Time.deltaTime;
            _controller.Move(_velocity * Time.deltaTime);
        }
    }
}

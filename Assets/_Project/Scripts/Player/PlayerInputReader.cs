using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace RPGProject.Player
{
    /// <summary>
    /// Decouples raw Unity Input System logic from the PlayerController.
    /// Exposes simple events and properties for movement, looking, and actions.
    /// </summary>
    public class PlayerInputReader : MonoBehaviour
    {
        public Vector2 MoveInput { get; private set; }
        public Vector2 LookInput { get; private set; }
        public bool IsSprinting { get; private set; }

        public event Action OnJumpEvent;
        public event Action OnInteractEvent;

        private void Update()
        {
            // For rapid prototyping without serialized .inputactions assets,
            // we use the direct Keyboard/Mouse APIs.
            // In a production environment, this should be replaced with an InputActionAsset.

            if (Keyboard.current == null || Mouse.current == null) return;

            ReadMovement();
            ReadLook();
            ReadActions();
        }

        private void ReadMovement()
        {
            Vector2 input = Vector2.zero;

            if (Keyboard.current.wKey.isPressed) input.y += 1f;
            if (Keyboard.current.sKey.isPressed) input.y -= 1f;
            if (Keyboard.current.aKey.isPressed) input.x -= 1f;
            if (Keyboard.current.dKey.isPressed) input.x += 1f;

            MoveInput = input.normalized;
            IsSprinting = Keyboard.current.leftShiftKey.isPressed;
        }

        private void ReadLook()
        {
            LookInput = Mouse.current.delta.ReadValue();
        }

        private void ReadActions()
        {
            if (Keyboard.current.spaceKey.wasPressedThisFrame)
            {
                OnJumpEvent?.Invoke();
            }

            if (Keyboard.current.eKey.wasPressedThisFrame)
            {
                OnInteractEvent?.Invoke();
            }
        }
    }
}

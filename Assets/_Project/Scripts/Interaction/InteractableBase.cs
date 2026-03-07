using UnityEngine;

namespace RPGProject.Interaction
{
    /// <summary>
    /// Base class for simple interactive objects in the world.
    /// Can be extended for complex interactions like dialogs or opening chests.
    /// </summary>
    public abstract class InteractableBase : MonoBehaviour, IInteractable
    {
        [SerializeField] protected string _promptMessage = "Interact";
        [SerializeField] protected bool _isInteractable = true;

        public string InteractionPrompt => _promptMessage;

        public bool Interact(GameObject interactor)
        {
            if (!_isInteractable) return false;

            return OnInteract(interactor);
        }

        protected abstract bool OnInteract(GameObject interactor);
    }
}

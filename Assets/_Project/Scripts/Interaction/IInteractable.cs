namespace RPGProject.Interaction
{
    /// <summary>
    /// Contract for any object that can be interacted with by the player.
    /// This decouples the interactor from specific implementations like doors, NPCs, etc.
    /// </summary>
    public interface IInteractable
    {
        string InteractionPrompt { get; }

        bool Interact(UnityEngine.GameObject interactor);
    }
}

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { templates } from '../data/templates';

export interface ProjectConfig {
  projectName: string;
  namespace: string;
  genre: string;
  useAsmDef: boolean;
  useURP: boolean;
  useNewInputSystem: boolean;
  complexity: 'Simple' | 'Medium' | 'High' | 'Enterprise' | 'UltimatePro';
}

const generateGuid = () => {
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[x]/g, () => {
    return (Math.random() * 16 | 0).toString(16);
  });
};

export const generateUnityProject = async (config: ProjectConfig) => {
  const zip = new JSZip();
  const { projectName, namespace } = config;

  // Root folders
  const assets = zip.folder("Assets");
  const projectSettings = zip.folder("ProjectSettings");
  const packages = zip.folder("Packages");

  zip.file("README.md", templates.readme(config));
  zip.file("LICENSE", "MIT License\n\nCopyright (c) 2025 " + namespace);

  // Project Settings
  projectSettings?.file("ProjectVersion.txt", templates.projectVersion);
  projectSettings?.file("TagManager.asset", templates.tagManager);

  // Packages
  packages?.file("manifest.json", templates.manifest);

  // Guids for Assets
  const guids = {
    playerMat: generateGuid(),
    groundMat: generateGuid(),
    playerPrefab: generateGuid(),
    groundPrefab: generateGuid(),
    mainScene: generateGuid(),
    singletonScript: generateGuid(),
    gameManagerScript: generateGuid(),
    playerControllerScript: generateGuid(),
    cameraControllerScript: generateGuid(),
    worldManagerScript: generateGuid(),
  };

  // Assets Structure
  if (assets) {
    assets.folder("Animations");
    assets.folder("Editor");

    const materials = assets.folder("Materials");
    if (materials) {
      materials.file("PlayerMat.mat", templates.material(0.2, 0.5, 0.9));
      materials.file("PlayerMat.mat.meta", templates.meta(guids.playerMat));
      materials.file("GroundMat.mat", templates.material(0.3, 0.3, 0.3));
      materials.file("GroundMat.mat.meta", templates.meta(guids.groundMat));
    }

    assets.folder("Models");

    const prefabs = assets.folder("Prefabs");
    if (prefabs) {
      prefabs.file("Player.prefab", templates.prefab("", guids.playerMat, "Player"));
      prefabs.file("Player.prefab.meta", templates.meta(guids.playerPrefab));
      prefabs.file("Ground.prefab", templates.prefab("", guids.groundMat, "Ground"));
      prefabs.file("Ground.prefab.meta", templates.meta(guids.groundPrefab));
    }

    assets.folder("Resources");

    const scenes = assets.folder("Scenes");
    if (scenes) {
      scenes.file("MainScene.unity", templates.sceneTemplate);
      scenes.file("MainScene.unity.meta", templates.meta(guids.mainScene));
    }

    if (config.complexity === 'Enterprise') {
      const data = assets.folder("Data");
      data?.file("ItemDatabase.asset", templates.itemData(namespace));
      data?.file("ItemDatabase.asset.meta", templates.meta(generateGuid()));
    }

    const scripts = assets.folder("Scripts");
    if (scripts) {
      const core = scripts.folder("Core");
      core?.file("Singleton.cs", templates.singleton(namespace));
      core?.file("Singleton.cs.meta", templates.meta(guids.singletonScript));
      core?.file("CameraController.cs", templates.cameraController(namespace));
      core?.file("CameraController.cs.meta", templates.meta(guids.cameraControllerScript));

      if (config.complexity === 'Enterprise' || config.complexity === 'UltimatePro') {
        core?.file("ServiceLocator.cs", templates.serviceLocator(namespace));
        core?.file("ServiceLocator.cs.meta", templates.meta(generateGuid()));
        core?.file("ObjectPooler.cs", templates.objectPooler(namespace));
        core?.file("ObjectPooler.cs.meta", templates.meta(generateGuid()));
        core?.file("SaveSystem.cs", templates.saveSystem(namespace));
        core?.file("SaveSystem.cs.meta", templates.meta(generateGuid()));
      }

      if (config.useAsmDef) core?.file(`${namespace}.Core.asmdef`, templates.asmdef(`${namespace}.Core`));

      const managers = scripts.folder("Managers");
      managers?.file("GameManager.cs", templates.gameManager(namespace));
      managers?.file("GameManager.cs.meta", templates.meta(guids.gameManagerScript));
      managers?.file("WorldManager.cs", templates.worldManager(namespace));
      managers?.file("WorldManager.cs.meta", templates.meta(guids.worldManagerScript));

      if (config.complexity === 'Enterprise' || config.complexity === 'UltimatePro') {
        managers?.file("AudioManager.cs", templates.audioManager(namespace));
        managers?.file("AudioManager.cs.meta", templates.meta(generateGuid()));
      }

      if (config.useAsmDef) managers?.file(`${namespace}.Managers.asmdef`, templates.asmdef(`${namespace}.Managers`));

      const gameplay = scripts.folder("Gameplay");
      gameplay?.file("PlayerController.cs", templates.playerController(namespace));
      gameplay?.file("PlayerController.cs.meta", templates.meta(guids.playerControllerScript));
      gameplay?.file("Interactable.cs", templates.interactable(namespace));
      gameplay?.file("Interactable.cs.meta", templates.meta(generateGuid()));

      if (config.complexity === 'UltimatePro') {
        const abilities = gameplay?.folder("Abilities");
        abilities?.file("Ability.cs", templates.abilitySystem(namespace));
        abilities?.file("Ability.cs.meta", templates.meta(generateGuid()));
      }

      if (config.useAsmDef) gameplay?.file(`${namespace}.Gameplay.asmdef`, templates.asmdef(`${namespace}.Gameplay`));

      // Advanced Patterns for High/Enterprise/UltimatePro Complexity
      if (config.complexity === 'High' || config.complexity === 'Enterprise' || config.complexity === 'UltimatePro') {
        const patterns = scripts.folder("Patterns");
        patterns?.file("StateMachine.cs", templates.stateMachine(namespace));
        patterns?.file("StateMachine.cs.meta", templates.meta(generateGuid()));
        patterns?.file("GameEvent.cs", templates.gameEvent(namespace));
        patterns?.file("GameEvent.cs.meta", templates.meta(generateGuid()));
        patterns?.file("GameEventListener.cs", templates.gameEventListener(namespace));
        patterns?.file("GameEventListener.cs.meta", templates.meta(generateGuid()));
      }

      if (config.complexity === 'UltimatePro') {
        const ai = scripts.folder("AI");
        ai?.file("BehaviorTree.cs", templates.behaviorTree(namespace));
        ai?.file("BehaviorTree.cs.meta", templates.meta(generateGuid()));

        const ui = scripts.folder("UI");
        ui?.file("UIManager.cs", templates.uiView(namespace));
        ui?.file("UIManager.cs.meta", templates.meta(generateGuid()));
      }
    }

    if (config.complexity === 'UltimatePro') {
      const editor = assets.folder("Editor");
      editor?.file("ProToolsEditor.cs", templates.customEditor(namespace));
      editor?.file("ProToolsEditor.cs.meta", templates.meta(generateGuid()));

      const tests = assets.folder("Tests");
      tests?.file("CoreSystemsTests.cs", templates.unitTest(namespace));
      tests?.file("CoreSystemsTests.cs.meta", templates.meta(generateGuid()));
    }

    if (config.useURP) {
      const settings = assets.folder("Settings");
      const urp = settings?.folder("URP");
      urp?.file("HighQualitySettings.asset", templates.urpAsset);
      urp?.file("HighQualitySettings.asset.meta", templates.meta(generateGuid()));
    }

    if (config.useNewInputSystem) {
      const input = assets.folder("Input");
      input?.file("GameActions.inputactions", templates.inputActions);
      input?.file("GameActions.inputactions.meta", templates.meta(generateGuid()));
    }

    assets.folder("Textures");
  }

  const content = await zip.generateAsync({ type: "blob" });
  let version = 'v4';
  if (config.complexity === 'Enterprise') version = 'v4_Enterprise';
  if (config.complexity === 'UltimatePro') version = 'v5_UltimatePro';
  saveAs(content, `${projectName.replace(/\s+/g, '_')}_UnityProject_${version}.zip`);
};

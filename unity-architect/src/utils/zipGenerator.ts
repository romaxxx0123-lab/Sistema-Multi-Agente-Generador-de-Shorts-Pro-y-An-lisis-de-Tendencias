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
  complexity: 'Simple' | 'Medium' | 'High';
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

    const scripts = assets.folder("Scripts");
    if (scripts) {
      const core = scripts.folder("Core");
      core?.file("Singleton.cs", templates.singleton(namespace));
      core?.file("Singleton.cs.meta", templates.meta(guids.singletonScript));
      core?.file("CameraController.cs", templates.cameraController(namespace));
      core?.file("CameraController.cs.meta", templates.meta(guids.cameraControllerScript));
      if (config.useAsmDef) core?.file(`${namespace}.Core.asmdef`, templates.asmdef(`${namespace}.Core`));

      const managers = scripts.folder("Managers");
      managers?.file("GameManager.cs", templates.gameManager(namespace));
      managers?.file("GameManager.cs.meta", templates.meta(guids.gameManagerScript));
      managers?.file("WorldManager.cs", templates.worldManager(namespace));
      managers?.file("WorldManager.cs.meta", templates.meta(guids.worldManagerScript));
      if (config.useAsmDef) managers?.file(`${namespace}.Managers.asmdef`, templates.asmdef(`${namespace}.Managers`));

      const gameplay = scripts.folder("Gameplay");
      gameplay?.file("PlayerController.cs", templates.playerController(namespace));
      gameplay?.file("PlayerController.cs.meta", templates.meta(guids.playerControllerScript));
      gameplay?.file("Interactable.cs", templates.interactable(namespace));
      gameplay?.file("Interactable.cs.meta", templates.meta(generateGuid()));
      if (config.useAsmDef) gameplay?.file(`${namespace}.Gameplay.asmdef`, templates.asmdef(`${namespace}.Gameplay`));

      // Advanced Patterns for High Complexity
      if (config.complexity === 'High') {
        const patterns = scripts.folder("Patterns");
        patterns?.file("StateMachine.cs", templates.stateMachine(namespace));
        patterns?.file("StateMachine.cs.meta", templates.meta(generateGuid()));
        patterns?.file("GameEvent.cs", templates.gameEvent(namespace));
        patterns?.file("GameEvent.cs.meta", templates.meta(generateGuid()));
        patterns?.file("GameEventListener.cs", templates.gameEventListener(namespace));
        patterns?.file("GameEventListener.cs.meta", templates.meta(generateGuid()));
      }
    }

    if (config.useURP) {
      const settings = assets.folder("Settings");
      settings?.folder("URP");
    }

    assets.folder("Textures");
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `${projectName.replace(/\s+/g, '_')}_UnityProject_v3.zip`);
};

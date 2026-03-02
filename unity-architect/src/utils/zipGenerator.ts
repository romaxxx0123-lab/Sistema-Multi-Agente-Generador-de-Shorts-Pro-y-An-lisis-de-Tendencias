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
}

export const generateUnityProject = async (config: ProjectConfig) => {
  const zip = new JSZip();
  const { projectName, namespace } = config;

  // Root folders
  const assets = zip.folder("Assets");
  const projectSettings = zip.folder("ProjectSettings");
  const packages = zip.folder("Packages");

  // README and License at root
  zip.file("README.md", templates.readme(config));
  zip.file("LICENSE", "MIT License\n\nCopyright (c) 2025 " + namespace);

  // Project Settings
  projectSettings?.file("ProjectVersion.txt", templates.projectVersion);

  // Packages
  packages?.file("manifest.json", templates.manifest);

  // Assets Structure
  if (assets) {
    assets.folder("Animations");
    assets.folder("Editor");
    assets.folder("Materials");
    assets.folder("Models");
    assets.folder("Prefabs");
    assets.folder("Resources");
    assets.folder("Scenes")?.file("MainScene.unity", templates.sceneTemplate);

    const scripts = assets.folder("Scripts");
    if (scripts) {
      const core = scripts.folder("Core");
      core?.file("Singleton.cs", templates.singleton(namespace));
      if (config.useAsmDef) core?.file(`${namespace}.Core.asmdef`, templates.asmdef(`${namespace}.Core`));

      const events = scripts.folder("Events");
      events?.file("GameEvent.cs", templates.gameEvent(namespace));
      events?.file("GameEventListener.cs", templates.eventListener(namespace));
      if (config.useAsmDef) events?.file(`${namespace}.Events.asmdef`, templates.asmdef(`${namespace}.Events`));

      const stateMachine = scripts.folder("StateMachine");
      stateMachine?.file("StateMachine.cs", templates.stateMachine(namespace));
      if (config.useAsmDef) stateMachine?.file(`${namespace}.StateMachine.asmdef`, templates.asmdef(`${namespace}.StateMachine`));

      const managers = scripts.folder("Managers");
      managers?.file("GameManager.cs", templates.gameManager(namespace));
      if (config.useAsmDef) managers?.file(`${namespace}.Managers.asmdef`, templates.asmdef(`${namespace}.Managers`));

      const player = scripts.folder("Player");
      player?.file("PlayerController.cs", templates.playerController(namespace));
      if (config.useAsmDef) player?.file(`${namespace}.Player.asmdef`, templates.asmdef(`${namespace}.Player`));

      scripts.folder("UI");
      scripts.folder("Utils");
    }

    if (config.useURP) {
      const settings = assets.folder("Settings");
      settings?.folder("URP");
    }

    assets.folder("Textures");
  }

  // Generate the zip file
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `${projectName.replace(/\s+/g, '_')}_UnityProject.zip`);
};

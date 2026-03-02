import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { templates } from '../data/templates';

export interface ProjectConfig {
  projectName: string;
  namespace: string;
  genre: string;
}

export const generateUnityProject = async (config: ProjectConfig) => {
  const zip = new JSZip();
  const { projectName, namespace } = config;

  // Root folders
  const assets = zip.folder("Assets");
  const projectSettings = zip.folder("ProjectSettings");
  const packages = zip.folder("Packages");

  // Project Settings
  projectSettings?.file("ProjectVersion.txt", templates.projectVersion);

  // Packages
  packages?.file("manifest.json", templates.manifest);

  // Assets Structure
  if (assets) {
    assets.folder("Animations");
    assets.folder("Materials");
    assets.folder("Prefabs");
    assets.folder("Scenes")?.file("MainScene.unity", templates.sceneTemplate);

    const scripts = assets.folder("Scripts");
    if (scripts) {
      scripts.folder("Core")?.file("Singleton.cs", templates.singleton(namespace));
      scripts.folder("Managers")?.file("GameManager.cs", templates.gameManager(namespace));
      scripts.folder("Player")?.file("PlayerController.cs", templates.playerController(namespace));
      scripts.folder("UI");
      scripts.folder("Utils");
    }

    assets.folder("Settings");
    assets.folder("Textures");
  }

  // Generate the zip file
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `${projectName.replace(/\s+/g, '_')}_UnityProject.zip`);
};

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
  complexity: 'Simple' | 'Medium' | 'High' | 'Enterprise' | 'UltimatePro' | 'OmniArchitect' | 'NexusPrime' | 'Aetheris' | 'Cognitive';
  useInventory: boolean;
  useStats: boolean;
  useCICD: boolean;
  useNetworking?: boolean;
  useAddressables?: boolean;
  usePostProcessing?: boolean;
  useGitIgnore?: boolean;
  useEditorConfig?: boolean;
  architecturePreset?: 'Modular' | 'Monolithic' | 'DataOriented';
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
  const assets = zip.folder("Assets")!;
  const projectSettings = zip.folder("ProjectSettings")!;

  if (config.useCICD) {
    const github = zip.folder(".github")!;
    const workflows = github.folder("workflows")!;
    workflows.file("unity-build.yml", templates.githubWorkflow(projectName));
  }

  if (config.useGitIgnore || config.complexity === 'Aetheris' || config.complexity === 'Cognitive') {
    zip.file(".gitignore", templates.gitignore);
  }

  if (config.useEditorConfig || config.complexity === 'Aetheris' || config.complexity === 'Cognitive') {
    zip.file(".editorconfig", templates.editorConfig);
  }

  const packages = zip.folder("Packages")!;
  zip.folder("Plugins")!;
  zip.file("Plugins.meta", templates.meta(generateGuid()));
  zip.folder("Docs")!;
  zip.file("Docs.meta", templates.meta(generateGuid()));
  zip.folder("UserSettings")!;
  zip.folder("Builds")!;

  zip.file("README.md", templates.readme(config));
  zip.file("README.md.meta", templates.meta(generateGuid()));
  zip.file("LICENSE", "MIT License\n\nCopyright (c) 2025 " + namespace);
  zip.file("LICENSE.meta", templates.meta(generateGuid()));

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
    urpAsset: generateGuid(),
    enemyAiScript: generateGuid(),
    enemyMat: generateGuid(),
    bossMat: generateGuid(),
    tankMat: generateGuid(),
    scoutMat: generateGuid(),
    sniperMat: generateGuid(),
    carPaintMat: generateGuid(),
    wheelMat: generateGuid(),
    buildingMat: generateGuid(),
    glassMat: generateGuid(),
    woodMat: generateGuid(),
    leafMat: generateGuid(),
  };

  // Project Settings
  projectSettings.file("ProjectVersion.txt", templates.projectVersion);
  projectSettings.file("TagManager.asset", templates.tagManager);
  projectSettings.file("TagManager.asset.meta", templates.meta(generateGuid()));
  projectSettings.file("QualitySettings.asset", templates.qualitySettings);
  projectSettings.file("QualitySettings.asset.meta", templates.meta(generateGuid()));
  projectSettings.file("GraphicsSettings.asset", templates.graphicsSettings(config.useURP ? guids.urpAsset : undefined));
  projectSettings.file("GraphicsSettings.asset.meta", templates.meta(generateGuid()));
  projectSettings.file("InputManager.asset", templates.inputManager);
  projectSettings.file("InputManager.asset.meta", templates.meta(generateGuid()));
  projectSettings.file("Physics2DSettings.asset", templates.physics2DSettings);
  projectSettings.file("Physics2DSettings.asset.meta", templates.meta(generateGuid()));
  projectSettings.file("EditorBuildSettings.asset", templates.editorBuildSettings);
  projectSettings.file("EditorBuildSettings.asset.meta", templates.meta(generateGuid()));

  // Packages
  packages.file("manifest.json", templates.manifest(config.useNewInputSystem, config.useNetworking, config.useAddressables));
  packages.file("manifest.json.meta", templates.meta(generateGuid()));

  // Assets Structure
  assets.file(".meta", templates.meta(generateGuid()));

  // Standard Assets Subfolders with Metas
  const subfolders = ["Animations", "Audio", "Editor", "Models", "Resources", "Textures", "Settings", "Input", "Docs"];
  subfolders.forEach(folder => {
    assets.folder(folder);
    assets.file(`${folder}.meta`, templates.meta(generateGuid()));
  });

  const materials = assets.folder("Materials")!;
  assets.file("Materials.meta", templates.meta(generateGuid()));
  materials.file("PlayerMat.mat", templates.material(0.2, 0.5, 0.9));
  materials.file("PlayerMat.mat.meta", templates.meta(guids.playerMat));
  materials.file("GroundMat.mat", templates.material(0.3, 0.3, 0.3));
  materials.file("GroundMat.mat.meta", templates.meta(guids.groundMat));

  if (config.complexity === 'Cognitive') {
    materials.file("EnemyMat.mat", templates.material(0.8, 0.1, 0.1));
    materials.file("EnemyMat.mat.meta", templates.meta(guids.enemyMat));
    materials.file("BossMat.mat", templates.material(1, 0.8, 0));
    materials.file("BossMat.mat.meta", templates.meta(guids.bossMat));
    materials.file("TankMat.mat", templates.material(0.2, 0.2, 0.2));
    materials.file("TankMat.mat.meta", templates.meta(guids.tankMat));
    materials.file("ScoutMat.mat", templates.material(0, 0.8, 0.8));
    materials.file("ScoutMat.mat.meta", templates.meta(guids.scoutMat));
    materials.file("SniperMat.mat", templates.material(0.5, 0, 0.5));
    materials.file("SniperMat.mat.meta", templates.meta(guids.sniperMat));

    // Pro Materials
    materials.file("CarPaint.mat", templates.carPaintMaterial());
    materials.file("CarPaint.mat.meta", templates.meta(guids.carPaintMat));
    materials.file("Wheel.mat", templates.material(0.1, 0.1, 0.1, 0.2, 0.0));
    materials.file("Wheel.mat.meta", templates.meta(guids.wheelMat));
    materials.file("BuildingBase.mat", templates.material(0.7, 0.7, 0.7, 0.1, 0.0));
    materials.file("BuildingBase.mat.meta", templates.meta(guids.buildingMat));
    materials.file("Glass.mat", templates.glassMaterial());
    materials.file("Glass.mat.meta", templates.meta(guids.glassMat));
    materials.file("Wood.mat", templates.woodMaterial());
    materials.file("Wood.mat.meta", templates.meta(guids.woodMat));
    materials.file("Leaves.mat", templates.leafMaterial());
    materials.file("Leaves.mat.meta", templates.meta(guids.leafMat));
  }

  const prefabs = assets.folder("Prefabs")!;
  assets.file("Prefabs.meta", templates.meta(generateGuid()));
  prefabs.file("Player.prefab", templates.prefab("", guids.playerMat, "Player"));
  prefabs.file("Player.prefab.meta", templates.meta(guids.playerPrefab));
  prefabs.file("Ground.prefab", templates.prefab("", guids.groundMat, "Ground"));
  prefabs.file("Ground.prefab.meta", templates.meta(guids.groundPrefab));

  if (config.complexity === 'Cognitive') {
    const enemyFolder = prefabs.folder("Enemies")!;
    prefabs.file("Enemies.meta", templates.meta(generateGuid()));

    enemyFolder.file("SlasherEnemy.prefab", templates.perfectedEnemyPrefab(guids.enemyMat, guids.enemyAiScript, "SlasherEnemy"));
    enemyFolder.file("SlasherEnemy.prefab.meta", templates.meta(generateGuid()));
    enemyFolder.file("DroneEnemy.prefab", templates.perfectedEnemyPrefab(guids.enemyMat, guids.enemyAiScript, "DroneEnemy"));
    enemyFolder.file("DroneEnemy.prefab.meta", templates.meta(generateGuid()));
    enemyFolder.file("OmegaBoss.prefab", templates.bossEnemyPrefab(guids.bossMat, guids.enemyAiScript));
    enemyFolder.file("OmegaBoss.prefab.meta", templates.meta(generateGuid()));
    enemyFolder.file("TitanTank.prefab", templates.tankEnemyPrefab(guids.tankMat, guids.enemyAiScript));
    enemyFolder.file("TitanTank.prefab.meta", templates.meta(generateGuid()));
    enemyFolder.file("PeregrineScout.prefab", templates.scoutEnemyPrefab(guids.scoutMat, guids.enemyAiScript));
    enemyFolder.file("PeregrineScout.prefab.meta", templates.meta(generateGuid()));
    enemyFolder.file("ShadowSniper.prefab", templates.sniperEnemyPrefab(guids.sniperMat, guids.enemyAiScript));
    enemyFolder.file("ShadowSniper.prefab.meta", templates.meta(generateGuid()));

    // Pro Folders
    const vehicleFolder = prefabs.folder("Vehicles")!;
    prefabs.file("Vehicles.meta", templates.meta(generateGuid()));
    vehicleFolder.file("ProVehicle_GT.prefab", templates.carPrefab(guids.carPaintMat, guids.wheelMat));
    vehicleFolder.file("ProVehicle_GT.prefab.meta", templates.meta(generateGuid()));

    const envFolder = prefabs.folder("Environment")!;
    prefabs.file("Environment.meta", templates.meta(generateGuid()));
    envFolder.file("ProBuilding_Modular.prefab", templates.buildingPrefab(guids.buildingMat, guids.glassMat));
    envFolder.file("ProBuilding_Modular.prefab.meta", templates.meta(generateGuid()));
    envFolder.file("ProNature_Oak.prefab", templates.treePrefab(guids.woodMat, guids.leafMat));
    envFolder.file("ProNature_Oak.prefab.meta", templates.meta(generateGuid()));

    const propFolder = prefabs.folder("Props")!;
    prefabs.file("Props.meta", templates.meta(generateGuid()));
    propFolder.file("ProProp_Crate.prefab", templates.cratePrefab(guids.woodMat));
    propFolder.file("ProProp_Crate.prefab.meta", templates.meta(generateGuid()));
  }

  const scenes = assets.folder("Scenes")!;
  assets.file("Scenes.meta", templates.meta(generateGuid()));
  scenes.file("MainScene.unity", templates.sceneTemplate);
  scenes.file("MainScene.unity.meta", templates.meta(guids.mainScene));

  if (config.complexity === 'Enterprise' || config.complexity === 'UltimatePro') {
    const data = assets.folder("Data")!;
    assets.file("Data.meta", templates.meta(generateGuid()));
    data.file("ItemDatabase.asset", templates.itemData(namespace));
    data.file("ItemDatabase.asset.meta", templates.meta(generateGuid()));
  }

  const scripts = assets.folder("Scripts")!;
  assets.file("Scripts.meta", templates.meta(generateGuid()));

  const core = scripts.folder("Core")!;
  scripts.file("Core.meta", templates.meta(generateGuid()));
  core.file("Singleton.cs", templates.singleton(namespace));
  core.file("Singleton.cs.meta", templates.meta(guids.singletonScript));
  core.file("CameraController.cs", templates.cameraController(namespace));
  core.file("CameraController.cs.meta", templates.meta(guids.cameraControllerScript));
  core.file("EventBus.cs", templates.eventBus(namespace));
  core.file("EventBus.cs.meta", templates.meta(generateGuid()));

  if (config.complexity === 'Enterprise' || config.complexity === 'UltimatePro') {
    core.file("ServiceLocator.cs", templates.serviceLocator(namespace));
    core.file("ServiceLocator.cs.meta", templates.meta(generateGuid()));
    core.file("ObjectPooler.cs", templates.objectPooler(namespace));
    core.file("ObjectPooler.cs.meta", templates.meta(generateGuid()));
    core.file("SaveSystem.cs", templates.saveSystem(namespace));
    core.file("SaveSystem.cs.meta", templates.meta(generateGuid()));
    core.file("LocalizationManager.cs", templates.localizationManager(namespace));
    core.file("LocalizationManager.cs.meta", templates.meta(generateGuid()));
  }

  if (config.useAsmDef) {
    core.file(`${namespace}.Core.asmdef`, templates.asmdef(`${namespace}.Core`));
    core.file(`${namespace}.Core.asmdef.meta`, templates.meta(generateGuid()));
  }

  if (config.complexity === 'Aetheris' || config.complexity === 'Cognitive') {
    const arch = scripts.folder("Architecture")!;
    scripts.file("Architecture.meta", templates.meta(generateGuid()));

    const events = arch.folder("Events")!;
    events.file("GameEvent.cs", templates.gameEvent(namespace));
    events.file("GameEvent.cs.meta", templates.meta(generateGuid()));
    events.file("GameEventListener.cs", templates.gameEventListener(namespace));
    events.file("GameEventListener.cs.meta", templates.meta(generateGuid()));

    const variables = arch.folder("Variables")!;
    variables.file("FloatVariable.cs", templates.gameVariable(namespace, "float"));
    variables.file("FloatVariable.cs.meta", templates.meta(generateGuid()));
    variables.file("IntVariable.cs", templates.gameVariable(namespace, "int"));
    variables.file("IntVariable.cs.meta", templates.meta(generateGuid()));
    variables.file("BoolVariable.cs", templates.gameVariable(namespace, "bool"));
    variables.file("BoolVariable.cs.meta", templates.meta(generateGuid()));
  }

  const managers = scripts.folder("Managers")!;
  scripts.file("Managers.meta", templates.meta(generateGuid()));
  managers.file("GameManager.cs", templates.gameManager(namespace));
  managers.file("GameManager.cs.meta", templates.meta(guids.gameManagerScript));
  managers.file("WorldManager.cs", templates.worldManager(namespace));
  managers.file("WorldManager.cs.meta", templates.meta(guids.worldManagerScript));

  if (config.complexity === 'Enterprise' || config.complexity === 'UltimatePro') {
    managers.file("AudioManager.cs", templates.audioManager(namespace));
    managers.file("AudioManager.cs.meta", templates.meta(generateGuid()));
  }

  if (config.useAsmDef) {
    managers.file(`${namespace}.Managers.asmdef`, templates.asmdef(`${namespace}.Managers`));
    managers.file(`${namespace}.Managers.asmdef.meta`, templates.meta(generateGuid()));
  }

  const gameplay = scripts.folder("Gameplay")!;
  scripts.file("Gameplay.meta", templates.meta(generateGuid()));
  gameplay.file("PlayerController.cs", templates.playerController(namespace));
  gameplay.file("PlayerController.cs.meta", templates.meta(guids.playerControllerScript));
  gameplay.file("Interactable.cs", templates.interactable(namespace));
  gameplay.file("Interactable.cs.meta", templates.meta(generateGuid()));

  if (config.complexity === 'UltimatePro') {
    const abilities = gameplay.folder("Abilities")!;
    gameplay.file("Abilities.meta", templates.meta(generateGuid()));
    abilities.file("Ability.cs", templates.abilitySystem(namespace));
    abilities.file("Ability.cs.meta", templates.meta(generateGuid()));
  }

  if (config.useAsmDef) {
    gameplay.file(`${namespace}.Gameplay.asmdef`, templates.asmdef(`${namespace}.Gameplay`));
    gameplay.file(`${namespace}.Gameplay.asmdef.meta`, templates.meta(generateGuid()));
  }

  if (config.complexity === 'High' || config.complexity === 'Enterprise' || config.complexity === 'UltimatePro') {
    const patterns = scripts.folder("Patterns")!;
    scripts.file("Patterns.meta", templates.meta(generateGuid()));
    patterns.file("StateMachine.cs", templates.stateMachine(namespace));
    patterns.file("StateMachine.cs.meta", templates.meta(generateGuid()));
    patterns.file("RobustStateMachine.cs", templates.robustStateMachine(namespace));
    patterns.file("RobustStateMachine.cs.meta", templates.meta(generateGuid()));
    patterns.file("GameEvent.cs", templates.gameEvent(namespace));
    patterns.file("GameEvent.cs.meta", templates.meta(generateGuid()));
    patterns.file("GameEventListener.cs", templates.gameEventListener(namespace));
    patterns.file("GameEventListener.cs.meta", templates.meta(generateGuid()));
  }

  if (config.complexity === 'UltimatePro' || config.complexity === 'OmniArchitect' || config.complexity === 'NexusPrime' || config.complexity === 'Aetheris' || config.complexity === 'Cognitive') {
    const ai = scripts.folder("AI")!;
    scripts.file("AI.meta", templates.meta(generateGuid()));
    ai.file("BehaviorTree.cs", templates.behaviorTree(namespace));
    ai.file("BehaviorTree.cs.meta", templates.meta(generateGuid()));

    const ui = scripts.folder("UI")!;
    scripts.file("UI.meta", templates.meta(generateGuid()));

    if (config.complexity === 'Aetheris' || config.complexity === 'Cognitive') {
        ui.file("UIModel.cs", templates.uiModel(namespace));
        ui.file("UIModel.cs.meta", templates.meta(generateGuid()));
        ui.file("UIView.cs", templates.uiView(namespace));
        ui.file("UIView.cs.meta", templates.meta(generateGuid()));
        ui.file("UIPresenter.cs", templates.uiPresenter(namespace));
        ui.file("UIPresenter.cs.meta", templates.meta(generateGuid()));
    } else {
        ui.file("UIManager.cs", templates.uiView(namespace));
        ui.file("UIManager.cs.meta", templates.meta(generateGuid()));
        ui.file("UIPresenter.cs", templates.uiPresenter(namespace));
        ui.file("UIPresenter.cs.meta", templates.meta(generateGuid()));
    }
  }

  if (config.useInventory || config.complexity === 'OmniArchitect' || config.complexity === 'NexusPrime') {
    const systems = scripts.folder("Systems")!;
    scripts.file("Systems.meta", templates.meta(generateGuid()));
    const inventory = systems.folder("Inventory")!;
    inventory.file("InventorySystem.cs", templates.inventorySystem(namespace));
    inventory.file("InventorySystem.cs.meta", templates.meta(generateGuid()));
    inventory.file("ItemDefinition.cs", templates.itemDefinition(namespace));
    inventory.file("ItemDefinition.cs.meta", templates.meta(generateGuid()));
  }

  if (config.useStats || config.complexity === 'OmniArchitect' || config.complexity === 'NexusPrime') {
    const systems = zip.folder("Assets/Scripts/Systems") || scripts.folder("Systems")!;
    const stats = systems.folder("Stats")!;
    stats.file("StatSystem.cs", templates.statSystem(namespace));
    stats.file("StatSystem.cs.meta", templates.meta(generateGuid()));
  }

  if (config.complexity === 'UltimatePro') {
    const editor = assets.folder("Editor")!;
    editor.file("ProToolsEditor.cs", templates.customEditor(namespace));
    editor.file("ProToolsEditor.cs.meta", templates.meta(generateGuid()));

    const tests = assets.folder("Tests")!;
    assets.file("Tests.meta", templates.meta(generateGuid()));
    tests.file("CoreSystemsTests.cs", templates.unitTest(namespace));
    tests.file("CoreSystemsTests.cs.meta", templates.meta(generateGuid()));
  }

  if (config.useURP) {
    const settings = assets.folder("Settings")!;
    const urp = settings.folder("URP")!;
    settings.file("URP.meta", templates.meta(generateGuid()));
    urp.file("HighQualitySettings.asset", templates.urpAsset);
    urp.file("HighQualitySettings.asset.meta", templates.meta(guids.urpAsset));

    if (config.usePostProcessing || config.complexity === 'NexusPrime') {
      const profiles = urp.folder("Profiles")!;
      urp.file("Profiles.meta", templates.meta(generateGuid()));
      profiles.file("MainScenePostProcess.asset", templates.postProcessProfile);
      profiles.file("MainScenePostProcess.asset.meta", templates.meta(generateGuid()));
    }
  }

  if (config.useNetworking || config.complexity === 'NexusPrime') {
    const networking = scripts.folder("Networking")!;
    scripts.file("Networking.meta", templates.meta(generateGuid()));
    networking.file("NetworkManagerUI.cs", templates.networkManager(namespace));
    networking.file("NetworkManagerUI.cs.meta", templates.meta(generateGuid()));
    networking.file("NetworkPlayer.cs", templates.networkPlayer(namespace));
    networking.file("NetworkPlayer.cs.meta", templates.meta(generateGuid()));
  }

  if (config.useAddressables || config.complexity === 'NexusPrime') {
    const systems = zip.folder("Assets/Scripts/Systems") || scripts.folder("Systems")!;
    const addressables = systems.folder("Addressables")!;
    addressables.file("AddressablesLoader.cs", templates.addressablesManager(namespace));
    addressables.file("AddressablesLoader.cs.meta", templates.meta(generateGuid()));

    const addrData = assets.folder("AddressableAssetsData")!;
    assets.file("AddressableAssetsData.meta", templates.meta(generateGuid()));
  }

  if (config.complexity === 'NexusPrime' || config.complexity === 'Aetheris' || config.complexity === 'Cognitive') {
    const shaders = assets.folder("Shaders")!;
    assets.file("Shaders.meta", templates.meta(generateGuid()));
    const vfx = assets.folder("VFX")!;
    assets.file("VFX.meta", templates.meta(generateGuid()));
    vfx.file("NexusExplosion.vfx", templates.vfxGraph("NexusExplosion"));
    vfx.file("NexusExplosion.vfx.meta", templates.meta(generateGuid()));
  }

  if (config.complexity === 'Aetheris' || config.complexity === 'Cognitive') {
    const editor = assets.folder("Editor")!;
    editor.file("ProjectInitializer.cs", templates.projectInitializer(namespace));
    editor.file("ProjectInitializer.cs.meta", templates.meta(generateGuid()));
  }

  if (config.complexity === 'Cognitive') {
    const cognitive = scripts.folder("Cognitive")!;
    scripts.file("Cognitive.meta", templates.meta(generateGuid()));

    const ai = cognitive.folder("AI")!;
    cognitive.file("AI.meta", templates.meta(generateGuid()));
    ai.file("EnemyAI.cs", templates.enemyAI(namespace));
    ai.file("EnemyAI.cs.meta", templates.meta(guids.enemyAiScript));

    switch(config.genre) {
      case 'FPS':
        cognitive.file("FPSController.cs", templates.fpsController(namespace));
        cognitive.file("FPSController.cs.meta", templates.meta(generateGuid()));
        break;
      case 'RPG':
        cognitive.file("RPGSystem.cs", templates.rpgSystem(namespace));
        cognitive.file("RPGSystem.cs.meta", templates.meta(generateGuid()));
        break;
      case 'Action':
        cognitive.file("PlatformerController.cs", templates.platformerController(namespace));
        cognitive.file("PlatformerController.cs.meta", templates.meta(generateGuid()));
        break;
      case 'Horror':
        cognitive.file("HorrorSystem.cs", templates.horrorSystem(namespace));
        cognitive.file("HorrorSystem.cs.meta", templates.meta(generateGuid()));
        break;
      case 'OpenWorld':
        cognitive.file("OpenWorldSystem.cs", templates.openWorldSystem(namespace));
        cognitive.file("OpenWorldSystem.cs.meta", templates.meta(generateGuid()));
        break;
    }
  }

  if (config.useNewInputSystem) {
    const input = assets.folder("Input")!;
    input.file("GameActions.inputactions", templates.inputActions);
    input.file("GameActions.inputactions.meta", templates.meta(generateGuid()));
  }

  const content = await zip.generateAsync({ type: "blob" });
  let version = 'v7_Omni';
  if (config.complexity === 'NexusPrime') version = 'v8_Nexus';
  if (config.complexity === 'Aetheris') version = 'v9_Aetheris';
  if (config.complexity === 'Cognitive') version = 'v10_Cognitive';

  saveAs(content, `${projectName.replace(/\s+/g, '_')}_UnityProject_${version}.zip`);
};

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  Layout,
  Layers,
  Zap,
  ShieldCheck,
  Cpu,
  Monitor,
  FolderOpen,
  FileJson,
  Database,
  Terminal,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { generateUnityProject, generateZipFromManifest } from './utils/zipGenerator';
import type { ProjectConfig, ProjectManifest } from './utils/zipGenerator';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function App() {
  const [useAI, setUseAI] = useState(false);
  const [model, setModel] = useState('qwen2.5-coder');
  const [config, setConfig] = useState<ProjectConfig>({
    projectName: 'HyperMegaGame',
    namespace: 'Company.Games',
    genre: 'Action',
    useAsmDef: true,
    useURP: true,
    useNewInputSystem: true,
    complexity: 'Cognitive',
    useInventory: true,
    useStats: true,
    useCICD: false,
    useNetworking: true,
    useAddressables: true,
    usePostProcessing: true,
    useGitIgnore: true,
    useEditorConfig: true,
    architecturePreset: 'Modular'
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);

  const addTerminalLine = (line: string) => {
    setTerminalLines(prev => [...prev.slice(-5), line]);
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    setProgress(5);
    setTerminalLines([useAI ? "[SYSTEM] Initializing AI Orchestrator v1.0..." : "[SYSTEM] Initializing Cognitive Engine v10.3..."]);

    try {
      if (useAI) {
        const response = await fetch('/api/generate-manifest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config, model })
        });

        if (!response.ok) throw new Error("Server not reachable");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("SSE Stream failure");

        const decoder = new TextDecoder();
        let manifest: ProjectManifest | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              if (data.reasoning) {
                data.reasoning.forEach((r: string) => addTerminalLine(r));
              }
              if (data.step) {
                const stepMap: Record<string, number> = { interpret: 20, plan: 40, manifest: 60, validate: 80, repair: 85, complete: 95 };
                setProgress(stepMap[data.step] || progress);
              }
              if (data.manifest) {
                manifest = data.manifest;
              }
              if (data.error) {
                throw new Error(data.error);
              }
            }
          }
        }

        if (manifest) {
          await generateZipFromManifest(manifest);
        } else {
          throw new Error("No manifest generated");
        }
      } else {
        const reasoningSteps = [
          `[COGNITIVE] Analyzing ${config.genre} mechanics...`,
          `[ARCHITECT] Designing core architecture for ${config.projectName}...`,
          `[SYSTEM] Calculating physics constants for ${config.genre}...`,
          "[DATA] Injecting ScriptableObject Variable system...",
          "[UI] Mapping Model-View-Presenter delegates...",
          `[LOGIC] Generating Deep-Logic ${config.genre} Controller...`,
          config.complexity === 'Cognitive' ? "[AI] Training perfected Enemy AI models..." : null,
          config.complexity === 'Cognitive' ? "[MODELS] Constructing Ultra-Detailed Enemy Prefabs..." : null,
          config.complexity === 'Cognitive' ? "[PRO] Synthesizing High-Fidelity Vehicles and Props..." : null,
          "[ASSETS] Linking persistent GUIDs to Meta files...",
          "[VCS] Optimizing Git ignore patterns...",
          "[FINALIZING] Compiling hyper-detailed structure..."
        ];

        for (let i = 0; i < reasoningSteps.length; i++) {
          const step = reasoningSteps[i];
          if (!step) continue;
          await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));
          addTerminalLine(step);
          setProgress(10 + (i * 10));
        }

        await generateUnityProject(config);
      }
      addTerminalLine("[SUCCESS] Project deployed successfully.");
      setProgress(100);
      setTimeout(() => {
        setProgress(0);
        setTerminalLines([]);
      }, 3000);
    } catch (error) {
      addTerminalLine("[ERROR] Deployment failed.");
      console.error('Failed to generate project:', error);
      setProgress(0);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleFeature = (key: keyof Pick<ProjectConfig, 'useAsmDef' | 'useURP' | 'useNewInputSystem' | 'useInventory' | 'useStats' | 'useCICD' | 'useNetworking' | 'useAddressables' | 'usePostProcessing' | 'useGitIgnore' | 'useEditorConfig'>) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen w-full bg-[#070709] text-slate-200 font-sans selection:bg-purple-500/30 overflow-x-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[140px] rounded-full opacity-50" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-600/10 blur-[140px] rounded-full opacity-50" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 lg:py-20">
        <header className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold mb-6 tracking-widest uppercase"
          >
            <Zap size={14} className="fill-indigo-400" />
            <span>Unity World Architect v10.3 - Pro Architect</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-6xl md:text-8xl font-black bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-200 to-slate-600 mb-8 tracking-tighter leading-none"
          >
            Ultimate Unity <br/> Architect
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-slate-400 text-xl md:text-2xl max-w-3xl mx-auto leading-relaxed font-medium"
          >
            Genera proyectos de Unity listos para abrir. <br/>
            <span className="text-indigo-400">Arquitectura completa, GUIDs vinculados y carpetas hyper-detalladas.</span>
          </motion.p>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch">
          {/* Config Column */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="xl:col-span-7"
          >
            <div className="bg-slate-900/30 backdrop-blur-2xl border border-white/5 rounded-[40px] p-8 md:p-12 shadow-3xl flex flex-col h-full">
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20 shadow-inner">
                    <Settings size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight uppercase">Configuración Maestro</h2>
                    <p className="text-sm text-slate-500 font-bold">Arquitectura y Metadatos</p>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-950/50 rounded-xl border border-white/5">
                   <Clock size={16} className="text-slate-500"/>
                   <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Generación Estructural Profunda</span>
                </div>
              </div>

              <div className="space-y-8 flex-1">
                {/* AI Toggle Panel */}
                <div className="p-6 rounded-[32px] bg-indigo-500/5 border border-indigo-500/10 mb-8">
                  <div className="flex flex-wrap items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-3 rounded-2xl transition-all",
                        useAI ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-950 text-slate-500"
                      )}>
                        <Cpu size={24} />
                      </div>
                      <div>
                        <h3 className="font-black text-white text-sm uppercase tracking-widest">Modo IA Real (Ollama)</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Orquestación Multi-Fase</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        disabled={!useAI}
                        className="bg-slate-950 border border-white/5 rounded-xl px-4 py-2 text-xs font-bold text-slate-400 focus:outline-none focus:border-indigo-500/40 disabled:opacity-50"
                      >
                        <option value="qwen2.5-coder">qwen2.5-coder</option>
                        <option value="llama3.2">llama3.2</option>
                        <option value="mistral">mistral</option>
                      </select>

                      <button
                        onClick={() => setUseAI(!useAI)}
                        className={cn(
                          "relative w-14 h-8 rounded-full transition-all duration-300",
                          useAI ? "bg-indigo-500" : "bg-slate-800"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-all duration-300 shadow-sm",
                          useAI ? "translate-x-6" : "translate-x-0"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Nombre del Proyecto</label>
                    <div className="relative group">
                      <FolderOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={20} />
                      <input
                        id="projectName"
                        type="text"
                        value={config.projectName}
                        onChange={(e) => setConfig({ ...config, projectName: e.target.value })}
                        className="w-full bg-slate-950/40 border border-white/5 rounded-2xl py-5 pl-12 pr-4 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/40 transition-all text-white font-bold text-lg placeholder:text-slate-700 shadow-inner"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Nivel de Detalle</label>
                    <div className="relative group">
                      <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={20} />
                      <select
                        id="complexity"
                        value={config.complexity}
                        onChange={(e) => setConfig({ ...config, complexity: e.target.value as ProjectConfig['complexity'] })}
                        className="w-full bg-slate-950/40 border border-white/5 rounded-2xl py-5 pl-12 pr-4 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/40 transition-all text-white font-bold text-lg appearance-none shadow-inner"
                      >
                        <option value="Simple">Estructura Base</option>
                        <option value="Medium">Mundo Estándar</option>
                        <option value="High">Entorno Completo</option>
                        <option value="Enterprise">Arquitectura Enterprise</option>
                        <option value="UltimatePro">Ultimate Pro Engine (V6.0)</option>
                        <option value="OmniArchitect">Omni-Architect (V7.0)</option>
                        <option value="NexusPrime">Nexus Prime (V8.0)</option>
                        <option value="Aetheris">Aetheris Engine (V9.0)</option>
                        <option value="Cognitive">Cognitive Pro (V10.3)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Namespace Profesional</label>
                    <div className="relative group">
                      <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-400 transition-colors" size={20} />
                      <input
                        type="text"
                        value={config.namespace}
                        onChange={(e) => setConfig({ ...config, namespace: e.target.value })}
                        className="w-full bg-slate-950/40 border border-white/5 rounded-2xl py-5 pl-12 pr-4 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/40 transition-all text-white font-bold text-lg shadow-inner"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Género del Gameplay</label>
                    <div className="relative group">
                      <Monitor className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-green-400 transition-colors" size={20} />
                      <select
                        id="genre"
                        value={config.genre}
                        onChange={(e) => setConfig({ ...config, genre: e.target.value })}
                        className="w-full bg-slate-950/40 border border-white/5 rounded-2xl py-5 pl-12 pr-4 focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-500/40 transition-all text-white font-bold text-lg appearance-none shadow-inner"
                      >
                        <option value="Action">Action Platformer</option>
                        <option value="RPG">RPG Adventure</option>
                        <option value="FPS">FPS Shooter</option>
                        <option value="OpenWorld">Open World Sandbox</option>
                        <option value="Horror">Horror Survival</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-600 uppercase tracking-[0.3em] ml-1 mb-4 flex items-center gap-2">
                    <Terminal size={14}/> Motores de Integración
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FeatureButton
                      active={config.useAsmDef}
                      onClick={() => toggleFeature('useAsmDef')}
                      icon={<Layers size={20} />}
                      label="AsmDefs"
                      desc="Optimización Modular"
                      color="purple"
                    />
                    <FeatureButton
                      active={config.useURP}
                      onClick={() => toggleFeature('useURP')}
                      icon={<Zap size={20} />}
                      label="High URP"
                      desc="Renderizado Pro"
                      color="indigo"
                    />
                    <FeatureButton
                      active={config.useNewInputSystem}
                      onClick={() => toggleFeature('useNewInputSystem')}
                      icon={<Cpu size={20} />}
                      label="Inputs V2"
                      desc="Acciones Dinámicas"
                      color="emerald"
                    />
                    <FeatureButton
                      active={config.useInventory}
                      onClick={() => toggleFeature('useInventory')}
                      icon={<Database size={20} />}
                      label="Inventory"
                      desc="Scriptable System"
                      color="indigo"
                    />
                    <FeatureButton
                      active={config.useStats}
                      onClick={() => toggleFeature('useStats')}
                      icon={<Zap size={20} />}
                      label="Stats"
                      desc="Modulable Stats"
                      color="purple"
                    />
                    <FeatureButton
                      active={config.useCICD}
                      onClick={() => toggleFeature('useCICD')}
                      icon={<ShieldCheck size={20} />}
                      label="CI/CD"
                      desc="GitHub Actions"
                      color="emerald"
                    />
                    <FeatureButton
                      active={config.useNetworking}
                      onClick={() => toggleFeature('useNetworking')}
                      icon={<Cpu size={20} />}
                      label="Netcode"
                      desc="Nexus Multiplayer"
                      color="indigo"
                    />
                    <FeatureButton
                      active={config.useAddressables}
                      onClick={() => toggleFeature('useAddressables')}
                      icon={<Database size={20} />}
                      label="Assets"
                      desc="Addressables V2"
                      color="purple"
                    />
                    <FeatureButton
                      active={config.usePostProcessing}
                      onClick={() => toggleFeature('usePostProcessing')}
                      icon={<Zap size={20} />}
                      label="Render"
                      desc="Post-Processing Pro"
                      color="emerald"
                    />
                    <FeatureButton
                      active={config.useGitIgnore}
                      onClick={() => toggleFeature('useGitIgnore')}
                      icon={<ShieldCheck size={20} />}
                      label="GitIgnore"
                      desc="VCS Optimization"
                      color="indigo"
                    />
                    <FeatureButton
                      active={config.useEditorConfig}
                      onClick={() => toggleFeature('useEditorConfig')}
                      icon={<Terminal size={20} />}
                      label="EditorCfg"
                      desc="Format Standard"
                      color="purple"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-12 space-y-4">
                {progress > 0 && (
                  <div className="space-y-4 mb-6">
                    <div className="bg-slate-950 rounded-2xl p-4 border border-white/5 font-mono text-[10px] space-y-1 h-32 flex flex-col justify-end overflow-hidden shadow-inner">
                      {terminalLines.map((line, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -5 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={cn(
                            "flex items-center gap-2",
                            line.includes('[ERROR]') ? "text-red-400" :
                            line.includes('[SUCCESS]') ? "text-emerald-400" :
                            line.includes('[COGNITIVE]') ? "text-indigo-400" : "text-slate-500"
                          )}
                        >
                          <div className="w-1 h-1 rounded-full bg-current opacity-50" />
                          {line}
                        </motion.div>
                      ))}
                    </div>
                    <div className="w-full bg-slate-950/50 rounded-full h-2 overflow-hidden border border-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"
                      />
                    </div>
                  </div>
                )}
                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDownload}
                  disabled={isGenerating}
                  className={cn(
                    "w-full flex items-center justify-center gap-4 py-6 rounded-[30px] font-black text-2xl shadow-4xl transition-all uppercase tracking-tight relative overflow-hidden group",
                    isGenerating ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-white text-black"
                  )}
                >
                  <span className="relative z-10">{isGenerating ? "Generando Arquitectura..." : "Desplegar Proyecto Hyper-Detallado"}</span>
                  {!isGenerating && (
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  )}
                  {!isGenerating && <span className="relative z-10 group-hover:text-white transition-colors duration-300">🚀</span>}
                </motion.button>
                <p className="text-center text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                  Compatible con Unity 2022.3.10f1+ y superiores
                </p>
              </div>
            </div>
          </motion.div>

          {/* Asset Preview Column */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="xl:col-span-5"
          >
            <div className="bg-[#0c0c0e] border border-white/5 rounded-[40px] p-8 md:p-10 h-full shadow-inner relative flex flex-col group overflow-hidden">
              {/* Decorative scanline effect */}
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none opacity-20" />

              <div className="flex items-center justify-between mb-10 relative">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20 shadow-inner">
                    <Layout size={28} />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-xl tracking-tight uppercase">Jerarquía de Proyecto</h3>
                    <p className="text-xs text-slate-500 font-black uppercase tracking-widest">Generación en Tiempo Real</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-[10px] font-black text-emerald-500/80 uppercase">Live Preview</span>
                </div>
              </div>

              <div className="flex-1 space-y-4 font-mono text-sm overflow-y-auto pr-4 custom-scrollbar relative">
                <div className="flex items-center gap-3 group/root transition-all hover:translate-x-1 cursor-default">
                  <span className="text-indigo-500 font-bold">📂</span>
                  <span className="text-indigo-400 font-black uppercase tracking-wider">{config.projectName}</span>
                  <span className="text-[10px] text-slate-700 italic font-medium ml-auto">Root Project</span>
                </div>

                <div className="pl-6 space-y-3 border-l-2 border-slate-900/50 ml-2">
                  {(config.useGitIgnore || config.complexity === 'Aetheris') && (
                    <div className="flex items-center gap-3 text-slate-500 hover:text-white transition-colors cursor-default">
                      <span className="text-sm">📄</span>
                      <span className="text-xs font-bold uppercase">.gitignore</span>
                    </div>
                  )}
                  {(config.useEditorConfig || config.complexity === 'Aetheris') && (
                    <div className="flex items-center gap-3 text-slate-500 hover:text-white transition-colors cursor-default">
                      <span className="text-sm">📄</span>
                      <span className="text-xs font-bold uppercase">.editorconfig</span>
                    </div>
                  )}
                  {config.useCICD && (
                    <HierarchyFolder icon="📁" name=".github" color="slate">
                      <div className="pl-6 space-y-2 border-l border-white/5 ml-2 mt-2">
                         <HierarchyFile name="workflows/" color="blue" items={['unity-build.yml']} />
                      </div>
                    </HierarchyFolder>
                  )}

                  <HierarchyFolder icon="📁" name="Assets" color="blue" meta>
                    <div className="pl-6 space-y-2 border-l border-white/5 ml-2 mt-2">
                      <HierarchyFolder icon="📁" name="Plugins" color="slate" meta desc="Librerías externas" />
                      <HierarchyFolder icon="📁" name="Settings" color="indigo" meta desc="URP/Quality assets" />

                      <HierarchyFolder icon="📁" name="Scripts" color="purple" meta>
                        <div className="pl-6 space-y-1.5 border-l border-purple-500/20 ml-2 mt-2">
                          <HierarchyFile name="Core/" color="blue" items={['EventBus.cs', 'Singleton.cs', 'Localization.cs']} />
                          <HierarchyFile name="Managers/" color="yellow" items={['GameManager.cs', 'AudioManager.cs']} />
                          {(config.complexity === 'UltimatePro' || config.complexity === 'OmniArchitect' || config.complexity === 'Enterprise') && (
                            <>
                              <HierarchyFile name="AI/" color="red" items={['BehaviorTree.cs']} />
                              <HierarchyFile name="Patterns/" color="green" items={['RobustStateMachine.cs']} />
                            </>
                          )}
                          {(config.complexity === 'UltimatePro' || config.complexity === 'OmniArchitect') && (
                            <HierarchyFile name="UI/" color="green" items={['UIManager.cs', 'UIPresenter.cs']} />
                          )}
                          {(config.useInventory || config.useStats || config.complexity === 'OmniArchitect' || config.complexity === 'NexusPrime') && (
                            <HierarchyFile name="Systems/" color="blue" items={['InventorySystem.cs', 'StatSystem.cs']} />
                          )}
                          {(config.useAddressables || config.complexity === 'NexusPrime') && (
                            <HierarchyFile name="Addressables/" color="purple" items={['AddressablesLoader.cs']} />
                          )}
                          {(config.useNetworking || config.complexity === 'NexusPrime' || config.complexity === 'Aetheris' || config.complexity === 'Cognitive') && (
                            <HierarchyFile name="Networking/" color="red" items={['NetworkManagerUI.cs', 'NetworkPlayer.cs']} />
                          )}
                          {(config.complexity === 'Aetheris' || config.complexity === 'Cognitive') && (
                            <HierarchyFile name="Architecture/" color="indigo" items={['GameEvent.cs', 'FloatVariable.cs']} />
                          )}
                          {config.complexity === 'Cognitive' && (
                            <>
                              <HierarchyFile name="AI/" color="red" items={['EnemyAI.cs']} />
                              <HierarchyFile name="Cognitive/" color="emerald" items={[`${config.genre}Controller.cs`]} />
                            </>
                          )}
                        </div>
                      </HierarchyFolder>

                      <HierarchyFolder icon="📁" name="Prefabs" color="yellow" meta desc="Player/Environment">
                        {config.complexity === 'Cognitive' && (
                          <div className="pl-6 space-y-2 mt-2 border-l border-white/5 ml-2">
                            <HierarchyFolder icon="📁" name="Enemies" color="red">
                              <div className="pl-4 space-y-1 mt-1 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                                <div>OmegaBoss.prefab</div>
                                <div>TitanTank.prefab</div>
                                <div>PeregrineScout.prefab</div>
                                <div>ShadowSniper.prefab</div>
                                <div>SlasherEnemy.prefab</div>
                                <div>DroneEnemy.prefab</div>
                              </div>
                            </HierarchyFolder>
                            <HierarchyFolder icon="📁" name="Vehicles" color="blue">
                              <div className="pl-4 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                                <div>ProVehicle_GT.prefab</div>
                              </div>
                            </HierarchyFolder>
                            <HierarchyFolder icon="📁" name="Environment" color="green">
                              <div className="pl-4 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                                <div>ProBuilding_Modular.prefab</div>
                                <div>ProNature_Oak.prefab</div>
                              </div>
                            </HierarchyFolder>
                            <HierarchyFolder icon="📁" name="Props" color="yellow">
                              <div className="pl-4 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                                <div>ProProp_Crate.prefab</div>
                              </div>
                            </HierarchyFolder>
                          </div>
                        )}
                      </HierarchyFolder>
                      <HierarchyFolder icon="📁" name="Scenes" color="green" meta desc="MainScene.unity" />

                      {(config.complexity === 'NexusPrime' || config.complexity === 'Aetheris') && (
                        <>
                          <HierarchyFolder icon="📁" name="Shaders" color="indigo" meta desc="HLSL/ShaderGraph" />
                          <HierarchyFolder icon="📁" name="VFX" color="purple" meta desc="VFXGraph Library" />
                        </>
                      )}

                      {(config.complexity === 'UltimatePro' || config.complexity === 'Aetheris' || config.complexity === 'Cognitive') && (
                        <HierarchyFolder icon="📁" name="Tests" color="red" meta desc="NUnit Core Tests" />
                      )}
                      {(config.complexity === 'Aetheris' || config.complexity === 'Cognitive') && (
                        <HierarchyFolder icon="📁" name="Editor" color="slate" meta desc="Architect Tools" />
                      )}
                    </div>
                  </HierarchyFolder>

                  <HierarchyFolder icon="⚙️" name="ProjectSettings" color="slate" meta>
                     <div className="pl-6 space-y-1 mt-2 text-[11px] text-slate-500 font-bold uppercase tracking-tighter">
                        <div>TagManager.asset</div>
                        <div>QualitySettings.asset</div>
                        <div>InputManager.asset</div>
                     </div>
                  </HierarchyFolder>

                  <HierarchyFolder icon="📦" name="Packages" color="indigo">
                     <div className="pl-6 mt-1 text-[11px] text-slate-600">manifest.json</div>
                  </HierarchyFolder>

                  <div className="flex items-center gap-3 text-slate-600 mt-4 border-t border-white/5 pt-4">
                    <FileJson size={14}/>
                    <span className="text-xs font-bold">README.md</span>
                    <CheckCircle2 size={12} className="text-emerald-500 ml-auto opacity-50"/>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-6 rounded-[30px] bg-slate-950/50 border border-white/[0.03] shadow-inner relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Database size={40} className="text-indigo-400" />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <ShieldCheck size={16} className="text-indigo-400" />
                  </div>
                  <span className="text-sm font-black text-white uppercase tracking-widest">GUID Integrity System</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-bold italic pr-12">
                  "Generación automática de metadatos (.meta) vinculando materiales y scripts de forma persistente."
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Floating Status Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 px-6 py-3 bg-slate-950/80 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl z-50">
         <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Engine Stable</span>
         </div>
         <div className="w-px h-4 bg-white/10" />
         <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Build</span>
            <span className="text-[10px] font-black text-white px-1.5 py-0.5 bg-white/5 rounded">10.3.0-PRO</span>
         </div>
         <div className="w-px h-4 bg-white/10" />
         <button className="text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:text-white transition-colors">
            Docs
         </button>
      </div>
    </div>
  );
}

function FeatureButton({ active, onClick, icon, label, desc, color }: {
  active: boolean,
  onClick: () => void,
  icon: React.ReactNode,
  label: string,
  desc: string,
  color: 'purple' | 'indigo' | 'emerald'
}) {
  const colors = {
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-100 ring-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]",
    indigo: "bg-indigo-500/10 border-indigo-500/30 text-indigo-100 ring-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-100 ring-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
  };

  return (
    <motion.button
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={cn(
        "p-5 rounded-3xl border-2 transition-all text-left relative overflow-hidden group",
        active ? colors[color] : "bg-slate-950/30 border-white/5 text-slate-500 hover:border-white/10"
      )}
    >
      <div className={cn("mb-3 transition-transform duration-300 group-hover:scale-110", active ? "text-white" : "text-slate-700")}>
        {icon}
      </div>
      <div className="text-xs font-black uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter group-hover:text-slate-500 transition-colors">{desc}</div>
      {active && (
        <div className="absolute top-2 right-2">
           <CheckCircle2 size={12} className="text-white/40" />
        </div>
      )}
    </motion.button>
  );
}

function HierarchyFolder({ icon, name, color, meta, desc, children }: {
  icon: string,
  name: string,
  color: 'blue' | 'indigo' | 'purple' | 'yellow' | 'green' | 'red' | 'slate',
  meta?: boolean,
  desc?: string,
  children?: React.ReactNode
}) {
  const colorClasses = {
    blue: "text-blue-400 bg-blue-500/5 border-blue-500/10",
    indigo: "text-indigo-400 bg-indigo-500/5 border-indigo-500/10",
    purple: "text-purple-400 bg-purple-500/5 border-purple-500/10",
    yellow: "text-yellow-400 bg-yellow-500/5 border-yellow-500/10",
    green: "text-green-400 bg-green-500/5 border-green-500/10",
    red: "text-red-400 bg-red-500/5 border-red-500/10",
    slate: "text-slate-400 bg-slate-500/5 border-slate-500/10"
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 group/folder transition-all hover:translate-x-1 cursor-default">
        <span className="text-lg">{icon}</span>
        <span className={cn("px-2 py-0.5 rounded-lg border font-bold text-xs uppercase tracking-tight", colorClasses[color])}>
          {name}
        </span>
        {desc && <span className="text-[10px] text-slate-700 italic font-medium ml-2">{desc}</span>}
        {meta && <span className="text-[8px] font-black text-slate-800 uppercase tracking-widest ml-auto px-1.5 py-0.5 bg-slate-950 rounded">+ META</span>}
      </div>
      {children}
    </div>
  );
}

function HierarchyFile({ name, color, items }: { name: string, color: 'blue' | 'yellow' | 'red' | 'green', items: string[] }) {
  const dotColors = {
    blue: "bg-blue-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    green: "bg-green-500"
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-tighter">
        <div className={cn("w-1 h-1 rounded-full", dotColors[color])} />
        {name}
      </div>
      <div className="pl-3 space-y-1">
        {items.map(item => (
          <div key={item} className="flex items-center justify-between group/file">
            <span className="text-[11px] text-slate-400 font-medium group-hover/file:text-white transition-colors">{item}</span>
            <div className="h-px bg-white/5 flex-1 mx-3" />
            <span className="text-[8px] text-slate-800 font-black">CS</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;

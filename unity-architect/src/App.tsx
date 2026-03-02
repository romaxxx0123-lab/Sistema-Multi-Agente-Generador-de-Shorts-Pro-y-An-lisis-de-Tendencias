import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Settings,
  Code,
  Layout,
  Layers,
  Zap,
  ShieldCheck,
  Cpu,
  Globe,
  Monitor
} from 'lucide-react';
import { generateUnityProject } from './utils/zipGenerator';
import type { ProjectConfig } from './utils/zipGenerator';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function App() {
  const [config, setConfig] = useState<ProjectConfig>({
    projectName: 'HyperMegaGame',
    namespace: 'Company.Games',
    genre: 'Action',
    useAsmDef: true,
    useURP: true,
    useNewInputSystem: true,
    complexity: 'Medium'
  });

  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      await generateUnityProject(config);
    } catch (error) {
      console.error('Failed to generate project:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleFeature = (key: keyof Pick<ProjectConfig, 'useAsmDef' | 'useURP' | 'useNewInputSystem'>) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0c] text-slate-200 font-sans selection:bg-purple-500/30 overflow-x-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <header className="mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-4"
          >
            <Globe size={14} />
            <span>Unity World Builder v4.0 - Enterprise Edition</span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-500 mb-6 tracking-tight"
          >
            Ultimate Unity Architect
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-slate-400 text-xl max-w-3xl mx-auto leading-relaxed"
          >
            Genera mundos completos y funcionales. Scripts, Prefabs y Materiales
            conectados y listos para ejecutar.
          </motion.p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-7 space-y-6"
          >
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20">
                  <Settings size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Configuración del Mundo</h2>
                  <p className="text-sm text-slate-500">Define la identidad y escala de tu proyecto</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="projectName" className="text-sm font-semibold text-slate-400 ml-1">Nombre</label>
                    <input
                      id="projectName"
                      type="text"
                      value={config.projectName}
                      onChange={(e) => setConfig({ ...config, projectName: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50 transition-all text-white font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="complexity" className="text-sm font-semibold text-slate-400 ml-1">Complejidad de Escena</label>
                    <select
                      id="complexity"
                      value={config.complexity}
                      onChange={(e) => setConfig({ ...config, complexity: e.target.value as ProjectConfig['complexity'] })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50 transition-all text-white font-medium appearance-none"
                    >
                      <option value="Simple">Prototipo Rápido</option>
                      <option value="Medium">Mundo Estándar</option>
                      <option value="High">Entorno Completo</option>
                      <option value="Enterprise">Arquitectura Enterprise</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="namespace" className="text-sm font-semibold text-slate-400 ml-1">Namespace</label>
                    <input
                      id="namespace"
                      type="text"
                      value={config.namespace}
                      onChange={(e) => setConfig({ ...config, namespace: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all text-white font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="genre" className="text-sm font-semibold text-slate-400 ml-1">Género</label>
                    <select
                      id="genre"
                      value={config.genre}
                      onChange={(e) => setConfig({ ...config, genre: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all text-white font-medium appearance-none"
                    >
                      <option value="Action">Action Platformer</option>
                      <option value="RPG">RPG Adventure</option>
                      <option value="FPS">First Person Shooter</option>
                      <option value="OpenWorld">Open World Sandbox</option>
                      <option value="RTS">Real-Time Strategy</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest ml-1">Sistemas Profesionales</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button onClick={() => toggleFeature('useAsmDef')} className={cn("p-4 rounded-2xl border transition-all text-left", config.useAsmDef ? "bg-purple-500/10 border-purple-500/40 text-purple-100" : "bg-slate-950/50 border-slate-800 text-slate-500")}>
                      <Layers size={18} className="mb-2" />
                      <div className="text-xs font-bold uppercase">AsmDefs</div>
                    </button>
                    <button onClick={() => toggleFeature('useURP')} className={cn("p-4 rounded-2xl border transition-all text-left", config.useURP ? "bg-blue-500/10 border-blue-500/40 text-blue-100" : "bg-slate-950/50 border-slate-800 text-slate-500")}>
                      <Zap size={18} className="mb-2" />
                      <div className="text-xs font-bold uppercase">URP</div>
                    </button>
                    <button onClick={() => toggleFeature('useNewInputSystem')} className={cn("p-4 rounded-2xl border transition-all text-left", config.useNewInputSystem ? "bg-green-500/10 border-green-500/40 text-green-100" : "bg-slate-950/50 border-slate-800 text-slate-500")}>
                      <Cpu size={18} className="mb-2" />
                      <div className="text-xs font-bold uppercase">Inputs</div>
                    </button>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleDownload}
                  disabled={isGenerating}
                  className={cn(
                    "w-full mt-6 flex items-center justify-center gap-3 py-5 rounded-2xl font-black text-xl shadow-2xl transition-all uppercase tracking-tighter",
                    isGenerating ? "bg-slate-800 text-slate-500" : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                  )}
                >
                  {isGenerating ? "Generando..." : "Desplegar Mundo Funcional"}
                </motion.button>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-5 space-y-6"
          >
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 h-full shadow-2xl overflow-hidden relative flex flex-col">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2.5 bg-green-500/10 rounded-xl text-green-400 border border-green-500/20">
                  <Layout size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg text-left">Contenido del Assets</h3>
                  <p className="text-xs text-slate-500 font-medium">Archivos funcionales vinculados</p>
                </div>
              </div>

              <div className="flex-1 space-y-3 font-mono text-sm text-slate-400 text-left">
                <div className="flex items-center gap-2"><span className="text-blue-500">📁</span> Assets</div>
                <div className="pl-6 space-y-2 border-l border-slate-800 ml-2">
                  {config.complexity === 'Enterprise' && (
                    <div className="flex items-center gap-2 text-red-400"><Layers size={14}/> Data/ <span className="text-[10px] text-slate-600 italic">Items.asset</span></div>
                  )}
                  <div className="flex items-center gap-2 text-yellow-400"><Box size={14}/> Prefabs/ <span className="text-[10px] text-slate-600 italic">Player.prefab</span></div>
                  <div className="flex items-center gap-2 text-indigo-400"><Monitor size={14}/> Materials/ <span className="text-[10px] text-slate-600 italic">Ground.mat</span></div>
                  <div className="flex items-center gap-2 text-purple-400"><Code size={14}/> Scripts/</div>
                  <div className="pl-6 space-y-1 border-l border-purple-500/20 ml-2">
                     <div className="text-xs text-slate-300">CameraController.cs</div>
                     <div className="text-xs text-slate-300">WorldManager.cs</div>
                     <div className="text-xs text-slate-300">PlayerController.cs</div>
                     {config.complexity === 'Enterprise' && (
                       <>
                         <div className="text-xs text-blue-400">ServiceLocator.cs</div>
                         <div className="text-xs text-blue-400">ObjectPooler.cs</div>
                         <div className="text-xs text-blue-400">SaveSystem.cs</div>
                       </>
                     )}
                  </div>
                  <div className="flex items-center gap-2 text-green-400"><Globe size={14}/> Scenes/ <span className="text-[10px] text-slate-600 italic">Main.unity</span></div>
                </div>
              </div>

              <div className="mt-8 p-5 rounded-2xl bg-slate-950/50 border border-white/[0.05]">
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck size={16} className="text-blue-400" />
                  <span className="text-sm font-bold text-white">GUID Persistence</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed italic">
                  Todos los archivos incluyen sus respectivos .meta para que los Prefabs mantengan sus scripts y materiales al abrir Unity.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export default App;

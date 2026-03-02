import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Download,
  Settings,
  Code,
  Layout,
  Sparkles,
  Gamepad2,
  Layers,
  CheckCircle2,
  Zap,
  ShieldCheck,
  Cpu
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
    useNewInputSystem: true
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
      {/* Background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <header className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium mb-4"
          >
            <Sparkles size={14} />
            <span>Unity Architect Pro v2.0 - Enterprise Edition</span>
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
            Construye la base de tu próximo éxito comercial con arquitectura modular,
            sistemas desacoplados y estándares de la industria.
          </motion.p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column - Configuration */}
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
                  <h2 className="text-xl font-bold text-white">Configuración del Proyecto</h2>
                  <p className="text-sm text-slate-500">Parámetros globales y de identidad</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="projectName" className="text-sm font-semibold text-slate-400 ml-1">Nombre del Proyecto</label>
                  <div className="relative group">
                    <Box className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-purple-400 transition-colors" size={18} />
                    <input
                      id="projectName"
                      type="text"
                      value={config.projectName}
                      onChange={(e) => setConfig({ ...config, projectName: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50 transition-all text-white font-medium"
                      placeholder="My Awesome Game"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="namespace" className="text-sm font-semibold text-slate-400 ml-1">Namespace Base</label>
                    <div className="relative group">
                      <Code className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                      <input
                        id="namespace"
                        type="text"
                        value={config.namespace}
                        onChange={(e) => setConfig({ ...config, namespace: e.target.value })}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all text-white font-medium"
                        placeholder="Company.Games"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="genre" className="text-sm font-semibold text-slate-400 ml-1">Género / Template</label>
                    <div className="relative group">
                      <Gamepad2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-green-400 transition-colors" size={18} />
                      <select
                        id="genre"
                        value={config.genre}
                        onChange={(e) => setConfig({ ...config, genre: e.target.value })}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-10 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all text-white font-medium appearance-none"
                      >
                        <option value="Action">Action / Platformer</option>
                        <option value="RPG">RPG / Adventure</option>
                        <option value="Simulation">Simulation / Tycoon</option>
                        <option value="Strategy">Strategy / RTS</option>
                        <option value="FPS">First Person Shooter</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest ml-1 mb-4">Módulos Avanzados</h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      onClick={() => toggleFeature('useAsmDef')}
                      className={cn(
                        "p-4 rounded-2xl border transition-all text-left flex flex-col gap-3",
                        config.useAsmDef
                          ? "bg-purple-500/10 border-purple-500/40 text-purple-100"
                          : "bg-slate-950/50 border-slate-800 text-slate-500 hover:border-slate-700"
                      )}
                    >
                      <Layers size={20} className={config.useAsmDef ? "text-purple-400" : "text-slate-600"} />
                      <div>
                        <div className="text-sm font-bold">AsmDefs</div>
                        <div className="text-[10px] opacity-60">Compilación Modular</div>
                      </div>
                    </button>

                    <button
                      onClick={() => toggleFeature('useURP')}
                      className={cn(
                        "p-4 rounded-2xl border transition-all text-left flex flex-col gap-3",
                        config.useURP
                          ? "bg-blue-500/10 border-blue-500/40 text-blue-100"
                          : "bg-slate-950/50 border-slate-800 text-slate-500 hover:border-slate-700"
                      )}
                    >
                      <Zap size={20} className={config.useURP ? "text-blue-400" : "text-slate-600"} />
                      <div>
                        <div className="text-sm font-bold">URP Support</div>
                        <div className="text-[10px] opacity-60">Gráficos Modernos</div>
                      </div>
                    </button>

                    <button
                      onClick={() => toggleFeature('useNewInputSystem')}
                      className={cn(
                        "p-4 rounded-2xl border transition-all text-left flex flex-col gap-3",
                        config.useNewInputSystem
                          ? "bg-green-500/10 border-green-500/40 text-green-100"
                          : "bg-slate-950/50 border-slate-800 text-slate-500 hover:border-slate-700"
                      )}
                    >
                      <Cpu size={20} className={config.useNewInputSystem ? "text-green-400" : "text-slate-600"} />
                      <div>
                        <div className="text-sm font-bold">New Input</div>
                        <div className="text-[10px] opacity-60">Multi-dispositivo</div>
                      </div>
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
                    isGenerating
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:shadow-purple-500/25 text-white"
                  )}
                >
                  {isGenerating ? (
                    <div className="w-6 h-6 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Download size={24} strokeWidth={3} />
                      Desplegar Arquitectura
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Right Column - Manifest / Preview */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-5 space-y-6"
          >
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 h-full shadow-2xl overflow-hidden relative flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-400 border border-purple-500/20">
                    <Layout size={22} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">Estructura de Activos</h3>
                    <p className="text-xs text-slate-500 font-medium">Standards-compliant hierarchy</p>
                  </div>
                </div>
                <div className="text-[10px] font-bold bg-slate-800 px-2 py-1 rounded text-slate-400">
                  LTS 2022.3
                </div>
              </div>

              <div className="flex-1 space-y-4 font-mono text-sm text-slate-400 select-none">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-blue-500">📁</span> Assets
                </div>
                <div className="pl-6 space-y-3 border-l-2 border-slate-800/50 ml-2">
                  <div className="flex items-center gap-2"><span className="text-slate-600">📁</span> Editor</div>
                  <div className="flex items-center gap-2"><span className="text-slate-600">📁</span> Prefabs</div>
                  <div className="flex items-center gap-2 text-purple-400">
                    <span className="text-purple-600">📁</span> Scripts
                  </div>
                  <div className="pl-6 space-y-3 border-l-2 border-purple-500/20 ml-2">
                    <div className="flex items-center gap-2 text-slate-300">
                      <ShieldCheck size={14} className="text-green-500" /> Core <span className="text-[10px] text-slate-600">{config.useAsmDef && '.asmdef'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Zap size={14} className="text-yellow-500" /> Events <span className="text-[10px] text-slate-600">{config.useAsmDef && '.asmdef'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Layers size={14} className="text-blue-500" /> StateMachine <span className="text-[10px] text-slate-600">{config.useAsmDef && '.asmdef'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2"><span className="text-slate-600">📁</span> Resources</div>
                  {config.useURP && (
                    <div className="flex items-center gap-2 text-blue-400/80 italic">
                      <span className="text-blue-600">📁</span> Settings/URP
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-slate-500 italic">
                  <CheckCircle2 size={14} className="text-slate-700" /> README.md
                </div>
                <div className="flex items-center gap-2 text-slate-500 italic">
                  <CheckCircle2 size={14} className="text-slate-700" /> LICENSE
                </div>
              </div>

              <div className="mt-12 p-5 rounded-2xl bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-white/[0.05]">
                <div className="flex items-center gap-3 mb-2">
                  <Sparkles size={16} className="text-purple-400" />
                  <span className="text-sm font-bold text-white">Architect Wisdom</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed italic">
                  "Un juego exitoso no se escribe una vez; se mantiene durante años. Esta estructura permite escalar de un prototipo a un equipo de 20 personas sin fricción."
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        <footer className="mt-24 py-12 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            System Ready for Deployment
          </div>
          <div className="text-slate-600 text-xs font-mono">
            BUILD_ID: ARCH-2025-PRO-X
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;

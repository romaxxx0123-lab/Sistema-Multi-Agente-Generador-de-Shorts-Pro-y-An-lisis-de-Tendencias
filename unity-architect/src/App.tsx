import { useState } from 'react';
import { motion } from 'framer-motion';
import { Box, Download, Settings, Code, Layout, Sparkles, Gamepad2, Layers } from 'lucide-react';
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
    genre: 'Action'
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

  return (
    <div className="min-h-screen w-full bg-[#0a0a0c] text-slate-200 font-sans selection:bg-purple-500/30 overflow-x-hidden">
      {/* Background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        <header className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium mb-4"
          >
            <Sparkles size={14} />
            <span>Unity Architect Pro v1.0</span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-4"
          >
            Unity Project Architect
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed"
          >
            Genera proyectos de Unity hiperdetallados con arquitectura profesional,
            patrones de diseño listos y estructura de carpetas estándar en segundos.
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
                  <h2 className="text-xl font-semibold text-white">Configuración Global</h2>
                  <p className="text-sm text-slate-500">Define los cimientos de tu juego</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="projectName" className="text-sm font-medium text-slate-400 ml-1">Nombre del Proyecto</label>
                  <div className="relative">
                    <Box className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                      id="projectName"
                      type="text"
                      value={config.projectName}
                      onChange={(e) => setConfig({ ...config, projectName: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50 transition-all text-white placeholder:text-slate-700"
                      placeholder="My Awesome Game"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="namespace" className="text-sm font-medium text-slate-400 ml-1">Namespace (C#)</label>
                    <div className="relative">
                      <Code className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                      <input
                        id="namespace"
                        type="text"
                        value={config.namespace}
                        onChange={(e) => setConfig({ ...config, namespace: e.target.value })}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50 transition-all text-white placeholder:text-slate-700"
                        placeholder="Company.Games"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="genre" className="text-sm font-medium text-slate-400 ml-1">Género Base</label>
                    <div className="relative">
                      <Gamepad2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                      <select
                        id="genre"
                        value={config.genre}
                        onChange={(e) => setConfig({ ...config, genre: e.target.value })}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-3.5 pl-12 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50 transition-all text-white appearance-none"
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

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDownload}
                  disabled={isGenerating}
                  className={cn(
                    "w-full mt-4 flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-lg shadow-lg transition-all",
                    isGenerating
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-purple-500/20"
                  )}
                >
                  {isGenerating ? (
                    <div className="w-6 h-6 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Download size={20} />
                      Generar Proyecto Detallado
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
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 h-full shadow-2xl overflow-hidden relative group">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-400 border border-purple-500/20">
                  <Layout size={22} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Estructura Generada</h3>
                  <p className="text-xs text-slate-500">Arquitectura de grado industrial</p>
                </div>
              </div>

              <div className="space-y-3 font-mono text-[13px] text-slate-400 select-none">
                <div className="flex items-center gap-2 group-hover:text-blue-400 transition-colors">
                  <span className="text-slate-600">📂</span> Assets/
                </div>
                <div className="pl-6 space-y-2 border-l border-slate-800 ml-2">
                  <div className="flex items-center gap-2"><span className="text-slate-600">📂</span> Animations/</div>
                  <div className="flex items-center gap-2"><span className="text-slate-600">📂</span> Prefabs/</div>
                  <div className="flex items-center gap-2"><span className="text-slate-600">📂</span> Scenes/</div>
                  <div className="flex items-center gap-2 group-hover:text-purple-400 transition-colors">
                    <span className="text-slate-600">📂</span> Scripts/
                  </div>
                  <div className="pl-6 space-y-2 border-l border-slate-800 ml-2">
                    <div className="flex items-center gap-2 text-slate-500 group-hover:text-slate-300 transition-colors">
                      <Layers size={12} /> Core/ <span className="text-[10px] text-slate-700 italic">Singleton.cs</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 group-hover:text-slate-300 transition-colors">
                      <Layers size={12} /> Managers/ <span className="text-[10px] text-slate-700 italic">GameManager.cs</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 group-hover:text-slate-300 transition-colors">
                      <Layers size={12} /> Player/ <span className="text-[10px] text-slate-700 italic">PlayerController.cs</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">📂</span> ProjectSettings/
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">📂</span> Packages/
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />

              <div className="mt-8 space-y-4">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-start gap-4">
                  <div className="bg-yellow-500/10 p-2 rounded-lg text-yellow-500">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Unity 2022.3 LTS Ready</h4>
                    <p className="text-xs text-slate-500">Configurado para máxima compatibilidad y estabilidad.</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <footer className="mt-24 pt-12 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-sm italic">
            "La diferencia entre un prototipo y un producto es la arquitectura."
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;

import { motion } from 'framer-motion';
import { ChevronLeft, Volume2, Monitor, Info, RotateCcw, Save } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';

export function SettingsScreen() {
  const { settings, updateSettings, goBack } = useGameStore();

  return (
    <div className="w-full h-full flex flex-col p-10">

      {/* Header */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-6">
            <motion.button onClick={goBack} className="p-3 bg-white/5 rounded-full border border-white/10">
                <ChevronLeft size={24} />
            </motion.button>
            <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter">AJUSTES</h2>
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full space-y-10">

          {/* Audio Section */}
          <section className="space-y-6">
              <div className="flex items-center gap-3 text-white/40 uppercase font-black text-xs tracking-widest">
                  <Volume2 size={16} /> Audio & Sonido
              </div>

              <div className="space-y-8 bg-white/5 p-8 rounded-3xl border border-white/10">
                  <SliderRow
                    label="Música"
                    value={settings.volumeMusic}
                    onChange={(v) => updateSettings({ volumeMusic: v })}
                  />
                  <SliderRow
                    label="Efectos (SFX)"
                    value={settings.volumeSFX}
                    onChange={(v) => updateSettings({ volumeSFX: v })}
                  />
              </div>
          </section>

          {/* Graphics Section */}
          <section className="space-y-6">
              <div className="flex items-center gap-3 text-white/40 uppercase font-black text-xs tracking-widest">
                  <Monitor size={16} /> Gráficos & Rendimiento
              </div>

              <div className="bg-white/5 p-8 rounded-3xl border border-white/10 space-y-4">
                  <ToggleRow
                    label="Calidad Alta"
                    description="Activa sombras y post-procesado avanzado."
                    active={settings.qualityHigh}
                    onToggle={() => updateSettings({ qualityHigh: !settings.qualityHigh })}
                  />
              </div>
          </section>

          {/* About Section */}
          <section className="space-y-6">
              <div className="flex items-center gap-3 text-white/40 uppercase font-black text-xs tracking-widest">
                  <Info size={16} /> Información
              </div>
              <div className="bg-white/5 p-8 rounded-3xl border border-white/10 text-sm text-white/40 leading-relaxed font-mono">
                  RONIN SURVIVOR - ALPHA v0.6.0<br/>
                  ENGINE: REACT + THREE.JS (RAPIER)<br/>
                  BUILD: 2024.11.23<br/>
                  <span className="text-cyan-500/50 mt-4 block italic">Desarrollado para la excelencia en combate.</span>
              </div>
          </section>

          {/* Footer Actions */}
          <div className="pt-10 flex gap-4">
               <UIButton variant="secondary" className="flex-1 !min-w-0 flex items-center justify-center gap-3" onClick={() => {
                   if(confirm("¿Seguro que quieres borrar todo el progreso?")) {
                       localStorage.clear();
                       window.location.reload();
                   }
               }}>
                   <RotateCcw size={18} /> RESETEAR PROGRESO
               </UIButton>
               <UIButton onClick={goBack} className="flex-1 !min-w-0 flex items-center justify-center gap-3">
                   <Save size={18} /> GUARDAR Y SALIR
               </UIButton>
          </div>
      </div>

    </div>
  );
}

function SliderRow({ label, value, onChange }: any) {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-end">
                <span className="text-sm font-black text-white uppercase italic">{label}</span>
                <span className="text-xs font-bold text-cyan-400">{value}%</span>
            </div>
            <input
                type="range"
                min="0"
                max="100"
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
            />
        </div>
    );
}

function ToggleRow({ label, description, active, onToggle }: any) {
    return (
        <div className="flex items-center justify-between p-2">
            <div>
                <h4 className="text-sm font-black text-white uppercase italic">{label}</h4>
                <p className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">{description}</p>
            </div>
            <button
                onClick={onToggle}
                className={`w-14 h-7 rounded-full transition-all relative ${active ? 'bg-cyan-500' : 'bg-white/10'}`}
            >
                <motion.div
                    animate={{ x: active ? 30 : 4 }}
                    className="absolute top-1 left-0 w-5 h-5 bg-white rounded-full shadow-lg"
                />
            </button>
        </div>
    );
}

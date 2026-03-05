import { motion } from 'framer-motion';
import { ChevronLeft, Shield, Sword, Zap, Heart, Play } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';

const PERKS = [
    { id: 'perk_hp', title: 'ESCUDO DE ALMA', description: '+20% Salud Máxima', icon: <Heart size={20} className="text-red-500" /> },
    { id: 'perk_dmg', title: 'FILO MÍSTICO', description: '+15% Daño Base', icon: <Sword size={20} className="text-orange-500" /> },
    { id: 'perk_speed', title: 'PASO VELOZ', description: '+10% Velocidad de Movimiento', icon: <Zap size={20} className="text-cyan-400" /> },
];

export function LoadoutScreen() {
  const { selectedCharacter, loadoutPerk, selectPerk, goBack, setMenuScreen, startRun } = useGameStore();

  return (
    <div className="w-full h-full flex flex-col p-10">

      {/* Header */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-6">
            <motion.button onClick={goBack} className="p-3 bg-white/5 rounded-full border border-white/10">
                <ChevronLeft size={24} />
            </motion.button>
            <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter">LOADOUT</h2>
        </div>
      </div>

      <div className="flex-1 flex gap-12">

          {/* Left: Character Selection Summary */}
          <div className="flex-1 flex flex-col gap-6">
              <div className="bg-white/5 rounded-3xl p-8 border border-white/10">
                  <span className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-4 block">GUERRERO SELECCIONADO</span>
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                          <div className="w-20 h-20 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
                               <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selectedCharacter}`} alt="char" className="w-16 h-16 opacity-50" />
                          </div>
                          <div>
                              <h3 className="text-2xl font-black italic text-white uppercase">{selectedCharacter}</h3>
                              <p className="text-xs text-cyan-400 font-bold uppercase tracking-widest">Nivel 12 Master</p>
                          </div>
                      </div>
                      <UIButton variant="secondary" className="!min-w-0 !px-6 !py-3 !text-xs" onClick={() => setMenuScreen('characters')}>
                          CAMBIAR
                      </UIButton>
                  </div>
              </div>

              {/* Perks Selection */}
              <div className="flex-1 flex flex-col gap-4">
                  <span className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-2 block">HABILIDAD PASIVA (PERK)</span>
                  <div className="grid grid-cols-1 gap-3">
                      {PERKS.map(perk => (
                          <motion.div
                            key={perk.id}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => selectPerk(perk.id === loadoutPerk ? null : perk.id)}
                            className={`
                                p-5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all
                                ${loadoutPerk === perk.id ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.15)]' : 'bg-white/5 border-white/10 hover:border-white/20'}
                            `}
                          >
                              <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center border border-white/5">
                                      {perk.icon}
                                  </div>
                                  <div>
                                      <h4 className="font-black italic text-white text-sm uppercase">{perk.title}</h4>
                                      <p className="text-xs text-white/50">{perk.description}</p>
                                  </div>
                              </div>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${loadoutPerk === perk.id ? 'border-cyan-400' : 'border-white/20'}`}>
                                  {loadoutPerk === perk.id && <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />}
                              </div>
                          </motion.div>
                      ))}
                  </div>
              </div>
          </div>

          {/* Right: Summary & Action */}
          <div className="w-[380px] flex flex-col gap-6">
              <div className="bg-black/40 rounded-3xl p-8 border border-white/5 flex-1">
                   <h3 className="text-white/40 font-black uppercase text-[10px] mb-6 tracking-widest">Resumen de Atributos</h3>

                   <div className="space-y-6">
                       <StatRow label="Vitalidad" value={100} bonus={loadoutPerk === 'perk_hp' ? 20 : 0} color="red" />
                       <StatRow label="Potencia" value={100} bonus={loadoutPerk === 'perk_dmg' ? 15 : 0} color="orange" />
                       <StatRow label="Agilidad" value={100} bonus={loadoutPerk === 'perk_speed' ? 10 : 0} color="cyan" />
                   </div>

                   <div className="mt-12 pt-8 border-t border-white/5">
                        <p className="text-[10px] text-white/30 uppercase font-black leading-relaxed">
                            Asegúrate de configurar tu build antes de la batalla. Los beneficios de los talentos ya están incluidos en los valores base.
                        </p>
                   </div>
              </div>

              <UIButton onClick={startRun} className="!py-6 !text-xl flex items-center justify-center gap-3">
                  <Play size={20} fill="currentColor" /> COMENZAR BATALLA
              </UIButton>
          </div>
      </div>

    </div>
  );
}

function StatRow({ label, value, bonus, color }: any) {
    const colorClasses: any = {
        red: 'bg-red-500',
        orange: 'bg-orange-500',
        cyan: 'bg-cyan-400'
    };

    return (
        <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="text-white/40">{label}</span>
                <span className="text-white">{value + bonus}% {bonus > 0 && <span className="text-green-400">+{bonus}</span>}</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden flex">
                <div className={`h-full ${colorClasses[color]}`} style={{ width: `${value}%` }} />
                {bonus > 0 && <div className="h-full bg-green-500/50" style={{ width: `${bonus}%` }} />}
            </div>
        </div>
    );
}

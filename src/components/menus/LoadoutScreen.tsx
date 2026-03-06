import { motion } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';
import { TOKENS } from '../../styles/tokens';
import { IconMask, IconHeart, IconKatana, IconSoul, IconSync } from '../ui/ronin-atlas';

const PERKS = [
    { id: 'perk_hp', title: 'ESCUDO DE ALMA', description: '+20% Salud Máxima', icon: <IconHeart size={20} color="#EF4444" /> },
    { id: 'perk_dmg', title: 'FILO MÍSTICO', description: '+15% Daño Base', icon: <IconKatana size={20} color="#F97316" /> },
    { id: 'perk_speed', title: 'PASO VELOZ', description: '+10% Velocidad', icon: <IconSync size={20} color="#22D3EE" /> },
];

export function LoadoutScreen() {
  const { selectedCharacter, loadoutPerk, selectPerk, setMenuScreen, startRun } = useGameStore();

  return (
    <div className="w-full h-full flex flex-col p-6 md:p-10 pb-32 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center gap-4 mb-10">
        <div className="p-2 bg-white/5 rounded-xl border border-white/10">
            <IconMask size={28} color={TOKENS.colors.goldBright} />
        </div>
        <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter">EQUIPO</h2>
      </div>

      <div className="flex flex-col gap-8">

          {/* Character selection */}
          <div className="bg-white/5 rounded-[32px] p-6 border border-white/10">
              <span className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-4 block">GUERRERO SELECCIONADO</span>
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center">
                           <IconMask size={32} color="#fff" opacity={0.5} />
                      </div>
                      <div>
                          <h3 className="text-xl font-black italic text-white uppercase">{selectedCharacter}</h3>
                          <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">Ronin Nivel 1</p>
                      </div>
                  </div>
                  <UIButton variant="secondary" className="!min-w-0 !px-6 !py-3 !text-[10px]" onClick={() => setMenuScreen('characters')}>
                      CAMBIAR
                  </UIButton>
              </div>
          </div>

          {/* Perks */}
          <div className="space-y-4">
              <span className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-2 block">HABILIDAD PASIVA (PERK)</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {PERKS.map(perk => (
                      <motion.div
                        key={perk.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => selectPerk(perk.id === loadoutPerk ? null : perk.id)}
                        className={`
                            p-5 rounded-[24px] border flex items-center justify-between cursor-pointer transition-all
                            ${loadoutPerk === perk.id ? 'bg-cyan-500/20 border-cyan-400 shadow-xl' : 'bg-white/5 border-white/10 hover:border-white/20'}
                        `}
                      >
                          <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center border border-white/5">
                                  {perk.icon}
                              </div>
                              <div>
                                  <h4 className="font-black italic text-white text-sm uppercase">{perk.title}</h4>
                                  <p className="text-[10px] text-white/50">{perk.description}</p>
                              </div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${loadoutPerk === perk.id ? 'border-cyan-400' : 'border-white/20'}`}>
                              {loadoutPerk === perk.id && <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />}
                          </div>
                      </motion.div>
                  ))}
              </div>
          </div>

          {/* Attributes */}
          <div className="bg-black/40 rounded-[32px] p-8 border border-white/5">
               <h3 className="text-white/40 font-black uppercase text-[10px] mb-6 tracking-widest">ATRIBUTOS</h3>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                   <StatRow label="Vitalidad" value={100} bonus={loadoutPerk === 'perk_hp' ? 20 : 0} color="red" />
                   <StatRow label="Potencia" value={100} bonus={loadoutPerk === 'perk_dmg' ? 15 : 0} color="orange" />
                   <StatRow label="Agilidad" value={100} bonus={loadoutPerk === 'perk_speed' ? 10 : 0} color="cyan" />
               </div>
          </div>

          <UIButton onClick={startRun} className="!w-full !py-6 !text-2xl !bg-[#F1C40F] !text-black shadow-2xl">
              COMENZAR MISIÓN
          </UIButton>
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

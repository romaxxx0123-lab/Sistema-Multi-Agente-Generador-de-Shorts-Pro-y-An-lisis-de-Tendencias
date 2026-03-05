import { motion } from 'framer-motion';
import { ChevronLeft, Zap, Heart, Sword, Shield, Target, PlusCircle } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';

const TALENT_LIST = [
    { id: 'hp', title: 'CONSTITUCIÓN', description: '+20 Salud Máxima por nivel.', icon: <Heart size={20} className="text-red-500" /> },
    { id: 'damage', title: 'FUERZA MÍSTICA', description: '+5% Daño Base por nivel.', icon: <Sword size={20} className="text-orange-500" /> },
    { id: 'speed', title: 'REFLEJOS', description: '+2% Velocidad por nivel.', icon: <Zap size={20} className="text-cyan-400" /> },
    { id: 'pickupRange', title: 'MAGNETISMO', description: '+10% Rango de Recogida por nivel.', icon: <Target size={20} className="text-purple-500" /> },
    { id: 'cooldown', title: 'CONCENTRACIÓN', description: '-3% Enfriamiento por nivel.', icon: <Shield size={20} className="text-blue-500" /> },
];

export function TalentsScreen() {
  const { metaXp, talents, buyTalent, goBack } = useGameStore();

  return (
    <div className="w-full h-full flex flex-col p-10">

      {/* Header */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-6">
            <motion.button onClick={goBack} className="p-3 bg-white/5 rounded-full border border-white/10">
                <ChevronLeft size={24} />
            </motion.button>
            <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter">TALENTOS</h2>
        </div>
        <div className="flex items-center gap-4 bg-black/40 px-6 py-2 rounded-2xl border border-white/5">
            <Zap size={16} className="text-[#F1C40F]" />
            <div className="flex flex-col">
                <span className="text-[8px] font-black text-white/30 tracking-widest uppercase">META-XP DISPONIBLE</span>
                <span className="text-lg font-black text-[#F1C40F] leading-none">{metaXp.toLocaleString()}</span>
            </div>
        </div>
      </div>

      {/* Talent Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pr-4 custom-scrollbar">
          {TALENT_LIST.map(talent => {
              const level = (talents as any)[talent.id];
              const cost = (level + 1) * 500;
              const canAfford = metaXp >= cost;

              return (
                  <motion.div
                    key={talent.id}
                    whileHover={{ scale: 1.02 }}
                    className="bg-white/5 rounded-3xl p-6 border border-white/10 flex flex-col justify-between"
                  >
                      <div>
                          <div className="flex justify-between items-start mb-6">
                              <div className="w-12 h-12 rounded-2xl bg-black/40 flex items-center justify-center border border-white/5">
                                  {talent.icon}
                              </div>
                              <div className="text-right">
                                  <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">RANK</span>
                                  <div className="text-xl font-black text-white italic">LV.{level}</div>
                              </div>
                          </div>

                          <h3 className="text-lg font-black italic text-white uppercase mb-2">{talent.title}</h3>
                          <p className="text-xs text-white/50 leading-relaxed">{talent.description}</p>
                      </div>

                      <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                          <div className="flex flex-col">
                              <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">COSTE MEJORA</span>
                              <div className="flex items-center gap-2">
                                  <Zap size={12} className={canAfford ? 'text-[#F1C40F]' : 'text-red-500'} />
                                  <span className={`text-sm font-black ${canAfford ? 'text-white' : 'text-red-500'}`}>{cost.toLocaleString()}</span>
                              </div>
                          </div>

                          <UIButton
                            disabled={!canAfford}
                            variant={canAfford ? 'primary' : 'secondary'}
                            onClick={() => buyTalent(talent.id as any)}
                            className="!min-w-0 !px-6 !py-3 !text-[10px] !bg-[#F1C40F] !text-black border-none"
                          >
                              <div className="flex items-center gap-2">
                                  <PlusCircle size={14} /> MEJORAR
                              </div>
                          </UIButton>
                      </div>
                  </motion.div>
              );
          })}
      </div>

    </div>
  );
}

import { motion } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore';
import { TOKENS } from '../../styles/tokens';
import { UIButton } from '../ui/UIButton';
import { IconScroll, IconOban, IconSoul, IconRank } from '../ui/ronin-atlas';

/**
 * MISSIONS HUB (1A/2 INTEGRATION)
 * Shows daily and weekly challenges.
 */
export function MissionsScreen() {
  const { totalRuns, metaXp } = useGameStore();

  const MOCK_MISSIONS = [
    { id: 1, title: 'PRIMERA SANGRE', goal: 'Elimina 50 enemigos', progress: 12, target: 50, reward: 200, type: 'daily' },
    { id: 2, title: 'MAESTRO DE FILO', goal: 'Sobrevive 5 minutos', progress: 3, target: 5, reward: 500, type: 'weekly' },
    { id: 3, title: 'RECOLECTOR', goal: 'Consigue 100 monedas', progress: 45, target: 100, reward: 150, type: 'daily' },
  ];

  return (
    <div className="w-full h-full flex flex-col p-6 md:p-10 pb-32">

      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
            <div className="p-2 bg-white/5 rounded-xl border border-white/10">
                <IconScroll size={28} color={TOKENS.colors.goldBright} />
            </div>
            <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter">MISIONES</h2>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white/5 p-6 rounded-[24px] border border-white/10 flex items-center gap-4">
              <IconRank size={24} color={TOKENS.colors.gold} />
              <div>
                  <span className="block text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">Sello del Honor</span>
                  <span className="text-xl font-black text-white italic">RANGO S</span>
              </div>
          </div>
          <div className="bg-white/5 p-6 rounded-[24px] border border-white/10 flex items-center gap-4">
              <IconOban size={24} color="#22D3EE" />
              <div>
                  <span className="block text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">Runs Totales</span>
                  <span className="text-xl font-black text-white italic">{totalRuns}</span>
              </div>
          </div>
      </div>

      {/* Mission List */}
      <div className="space-y-4">
          {MOCK_MISSIONS.map((m) => {
              const percent = (m.progress / m.target) * 100;
              return (
                  <motion.div
                    key={m.id}
                    whileHover={{ x: 5, backgroundColor: 'rgba(255,255,255,0.08)' }}
                    className="bg-white/5 p-6 rounded-[24px] border border-white/10 flex items-center justify-between"
                  >
                      <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${m.type === 'daily' ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-blue-500/30 text-blue-400 bg-blue-500/5'}`}>
                                  {m.type.toUpperCase()}
                              </span>
                              <h4 className="text-lg font-black italic text-white uppercase tracking-tight">{m.title}</h4>
                          </div>
                          <p className="text-xs text-white/40 font-bold uppercase tracking-wider mb-4">{m.goal}</p>

                          {/* Progress Bar */}
                          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-cyan-500" style={{ width: `${percent}%` }} />
                          </div>
                      </div>

                      <div className="ml-8 flex flex-col items-center gap-2">
                          <div className="flex items-center gap-2">
                              <IconSoul size={14} color={TOKENS.colors.gold} />
                              <span className="text-sm font-black text-white">{m.reward}</span>
                          </div>
                          <UIButton className="!min-w-0 !px-4 !py-2 !text-[10px] !bg-white/10 !text-white/60" disabled>
                              {m.progress >= m.target ? 'RECLAMAR' : `${m.progress}/${m.target}`}
                          </UIButton>
                      </div>
                  </motion.div>
              );
          })}
      </div>

    </div>
  );
}

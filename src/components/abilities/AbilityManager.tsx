import { useGameStore } from '../../store/useGameStore';
import { KunaiOrbital, FireSpiral } from './KunaiOrbital';
import { LightningStrike } from './LightningStrike';
import { FlameAura } from './FlameAura';
import { ShadowClone } from './ShadowClone';
import { ShurikenStorm } from './ShurikenStorm';
import { PoisonCloud } from './PoisonCloud';
import { ChainLightning } from './ChainLightning';
import { GroundSpikes } from './GroundSpikes';
import { SpiritWolves } from './SpiritWolves';
import { MeteorStrike } from './MeteorStrike';

export const AbilityManager = () => {
  const abilities = useGameStore((state) => state.abilities);

  return (
    <group>
      {/* Base Abilities */}
      {abilities['kunai'] && <KunaiOrbital level={abilities['kunai']} />}
      {abilities['lightning'] && <LightningStrike level={abilities['lightning']} />}
      {abilities['flame'] && <FlameAura level={abilities['flame']} />}
      {abilities['clone'] && <ShadowClone level={abilities['clone']} />}
      {abilities['shuriken'] && <ShurikenStorm level={abilities['shuriken']} />}
      {abilities['poison'] && <PoisonCloud level={abilities['poison']} />}
      {abilities['chain_lightning'] && <ChainLightning level={abilities['chain_lightning']} />}
      {abilities['ground_spikes'] && <GroundSpikes level={abilities['ground_spikes']} />}
      {abilities['wolves'] && <SpiritWolves level={abilities['wolves']} />}
      {abilities['meteor'] && <MeteorStrike level={abilities['meteor']} />}

      {/* Evolutions */}
      {abilities['fire_spiral'] && <FireSpiral level={abilities['fire_spiral']} />}
      {abilities['thunder_god'] && <LightningStrike level={10} />} {/* Map to base with level 10 flag */}
      {abilities['legion'] && (
        <group>
            <ShadowClone level={3} />
            <KunaiOrbital level={5} />
        </group>
      )}
      {abilities['toxic_inferno'] && (
        <group>
            <PoisonCloud level={10} />
            <FlameAura level={10} />
        </group>
      )}
      {abilities['blade_storm'] && (
        <group>
            <ShurikenStorm level={10} />
            <GroundSpikes level={10} />
        </group>
      )}
      {abilities['celestial_pack'] && (
        <group>
            <SpiritWolves level={10} />
            <MeteorStrike level={10} />
        </group>
      )}
    </group>
  );
};

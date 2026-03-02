import { useGameStore } from '../../store/useGameStore';
import { KunaiOrbital, FireSpiral } from './KunaiOrbital';
import { LightningStrike } from './LightningStrike';
import { FlameAura } from './FlameAura';
import { ShadowClone } from './ShadowClone';

export const AbilityManager = () => {
  const abilities = useGameStore((state) => state.abilities);

  return (
    <group>
      {abilities['kunai'] && <KunaiOrbital level={abilities['kunai']} />}
      {abilities['lightning'] && <LightningStrike level={abilities['lightning']} />}
      {abilities['flame'] && <FlameAura level={abilities['flame']} />}
      {abilities['clone'] && <ShadowClone level={abilities['clone']} />}
      {abilities['fire_spiral'] && <FireSpiral level={abilities['fire_spiral']} />}
    </group>
  );
};

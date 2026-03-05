import { useGameStore } from '../../store/useGameStore';
import { KunaiOrbital } from './KunaiOrbital';
import { LightningStrike } from './LightningStrike';
import { FlameAura } from './FlameAura';
import { ProjectileBarrage } from './ProjectileBarrage';

/**
 * ABILITY MANAGER
 * Orchestrates all active auto-abilities for the player.
 */
export const AbilityManager = () => {
    const abilities = useGameStore(state => state.abilities);

    return (
        <group>
            {abilities.has('orbital') && abilities.get('orbital')?.level! > 0 && <KunaiOrbital />}
            {abilities.has('lightning') && abilities.get('lightning')?.level! > 0 && <LightningStrike />}
            {abilities.has('aura') && abilities.get('aura')?.level! > 0 && <FlameAura />}
            {abilities.has('barrage') && abilities.get('barrage')?.level! > 0 && <ProjectileBarrage />}
        </group>
    );
};

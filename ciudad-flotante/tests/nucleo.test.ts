import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
describe('probe', () => { it('importa Game', () => { expect(typeof Game).toBe('function'); }); });

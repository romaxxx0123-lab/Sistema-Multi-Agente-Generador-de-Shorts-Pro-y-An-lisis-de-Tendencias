import './ui/base.css';
import { Game } from './game/Game';

const container = document.getElementById('app');
if (!container) throw new Error('Falta #app');
new Game(container);

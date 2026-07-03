import Phaser from 'phaser';
import './styles.css';
import { BootScene } from './scenes/BootScene';
import { EndingScene } from './scenes/EndingScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { reggaeMidi } from './systems/ReggaeMidi';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game-root',
  width: 540,
  height: 960,
  backgroundColor: '#03192d',
  pixelArt: false,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance'
  },
  scene: [BootScene, MenuScene, GameScene, HudScene, EndingScene]
};

type BrineWindow = Window & { __BRINE_HELL_GAME__?: Phaser.Game };
const brineWindow = window as BrineWindow;
brineWindow.__BRINE_HELL_GAME__?.destroy(true);
const game = new Phaser.Game(config);
brineWindow.__BRINE_HELL_GAME__ = game;

const hot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
hot?.dispose(() => {
  reggaeMidi.dispose();
  game.destroy(true);
  if (brineWindow.__BRINE_HELL_GAME__ === game) brineWindow.__BRINE_HELL_GAME__ = undefined;
});

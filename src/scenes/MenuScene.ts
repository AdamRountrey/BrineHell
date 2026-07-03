import Phaser from 'phaser';
import { loadSave } from '../save/saveState';
import { reggaeMidi } from '../systems/ReggaeMidi';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.scene.stop('HudScene');

    const { width, height } = this.scale;
    const bg = this.add.image(width / 2, height / 2, 'ocean-biomes');
    bg.setDisplaySize(width, height);
    bg.setAlpha(0.72);

    this.add.rectangle(width / 2, height / 2, width, height, 0x02101d, 0.35);

    this.add
      .text(width / 2, 132, 'BRINE HELL', {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: '56px',
        color: '#f8fdff',
        stroke: '#05243d',
        strokeThickness: 8
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 196, 'A 1942-style ocean bullet storm', {
        fontSize: '20px',
        color: '#bff6ff'
      })
      .setOrigin(0.5);

    const save = loadSave();
    const continueLine = save ? 'ENTER  Continue from checkpoint' : 'ENTER  Start current';
    const body = [
      continueLine,
      'SPACE  New run',
      'ARROWS/WASD  Swim',
      'AUTO-FIRE  Always on',
      'B  Whirlpool bomb',
      'P  Pause'
    ].join('\n');

    this.add
      .text(width / 2, 315, body, {
        fontSize: '22px',
        color: '#f4fbff',
        align: 'center',
        lineSpacing: 13
      })
      .setOrigin(0.5, 0);

    this.input.keyboard?.once('keydown-ENTER', () => {
      reggaeMidi.start('game');
      this.scene.start('GameScene', { continueFromSave: Boolean(save) });
    });
    this.input.keyboard?.once('keydown-SPACE', () => {
      reggaeMidi.start('game');
      this.scene.start('GameScene', { newRun: true });
    });
    this.input.once('pointerdown', () => reggaeMidi.start('menu'));
  }
}

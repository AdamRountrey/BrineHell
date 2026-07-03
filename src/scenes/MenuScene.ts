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
    const compact = window.innerWidth < 600 || this.scale.displaySize.width < 500;
    const bg = this.add.image(width / 2, height / 2, 'ocean-biomes');
    bg.setDisplaySize(width, height);
    bg.setAlpha(0.72);

    this.add.rectangle(width / 2, height / 2, width, height, 0x02101d, 0.35);

    this.add
      .text(width / 2, 132, 'BRINE HELL', {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: compact ? '40px' : '56px',
        color: '#f8fdff',
        stroke: '#05243d',
        strokeThickness: compact ? 6 : 8
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 196, 'A 1942-style ocean bullet storm', {
        fontSize: compact ? '15px' : '20px',
        color: '#bff6ff'
      })
      .setOrigin(0.5);

    const save = loadSave();
    const body = [
      'ARROWS/WASD  Swim',
      'TOUCH  Drag to swim',
      'AUTO-FIRE  Always on',
      'B  Whirlpool bomb',
      'P  Pause'
    ].join('\n');

    const startGame = (data: { continueFromSave?: boolean; newRun?: boolean }): void => {
      reggaeMidi.start('game');
      this.scene.start('GameScene', data);
    };

    const buttons = [
      this.createMenuButton(width / 2, 282, save ? 'Continue' : 'Start', () => startGame({ continueFromSave: Boolean(save) })),
      this.createMenuButton(width / 2, 354, 'New Run', () => startGame({ newRun: true }))
    ];

    this.add
      .text(width / 2, 445, body, {
        fontSize: '22px',
        color: '#f4fbff',
        align: 'center',
        lineSpacing: 13
      })
      .setOrigin(0.5, 0);

    this.input.keyboard?.once('keydown-ENTER', () => {
      startGame({ continueFromSave: Boolean(save) });
    });
    this.input.keyboard?.once('keydown-SPACE', () => {
      startGame({ newRun: true });
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      for (const button of buttons) {
        if (
          pointer.worldX >= button.x - button.width / 2 &&
          pointer.worldX <= button.x + button.width / 2 &&
          pointer.worldY >= button.y - button.height / 2 &&
          pointer.worldY <= button.y + button.height / 2
        ) {
          button.onClick();
          return;
        }
      }
      reggaeMidi.start('menu');
    });
  }

  private createMenuButton(x: number, y: number, label: string, onClick: () => void): { x: number; y: number; width: number; height: number; onClick: () => void } {
    const width = 230;
    const height = 54;
    const button = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, width, height, 0x09314d, 0.82).setStrokeStyle(3, 0x9bf6ff, 0.88);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: '22px',
        color: '#f8fdff',
        stroke: '#03192d',
        strokeThickness: 4
      })
      .setOrigin(0.5);
    button.add([bg, text]);
    return { x, y, width, height, onClick };
  }
}

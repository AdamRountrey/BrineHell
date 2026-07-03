import Phaser from 'phaser';
import type { HudState } from '../types/game';

export class HudScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private biomeText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private bossBar!: Phaser.GameObjects.Rectangle;
  private fpsText!: Phaser.GameObjects.Text;

  constructor() {
    super('HudScene');
  }

  create(): void {
    this.add.rectangle(270, 22, 540, 44, 0x020b14, 0.48).setDepth(1000);
    this.scoreText = this.add.text(14, 8, 'Score 0', { fontSize: '18px', color: '#f8fdff' }).setDepth(1001);
    this.livesText = this.add.text(420, 8, 'Lives 4', { fontSize: '18px', color: '#f8fdff' }).setDepth(1001);
    this.biomeText = this.add.text(14, 34, 'Sandy Shallows', { fontSize: '14px', color: '#a7f3ff' }).setDepth(1001);
    this.powerText = this.add.text(270, 34, '', { fontSize: '14px', color: '#fff1a8' }).setOrigin(0.5, 0).setDepth(1001);
    this.bossText = this.add.text(270, 64, '', { fontSize: '18px', color: '#ffe5f1' }).setOrigin(0.5).setDepth(1001);
    this.add.rectangle(270, 84, 320, 10, 0x061826, 0.7).setDepth(1000);
    this.bossBar = this.add.rectangle(110, 84, 0, 10, 0xff4d8d, 0.95).setOrigin(0, 0.5).setDepth(1001);
    this.fpsText = this.add.text(470, 934, '', { fontSize: '12px', color: '#91dfff' }).setDepth(1001);
    this.game.events.on('hud:update', this.updateHud, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off('hud:update', this.updateHud, this));
  }

  private updateHud(state: HudState): void {
    this.scoreText.setText(`Score ${state.score.toLocaleString()}`);
    this.livesText.setText(`Lives ${state.lives}`);
    this.biomeText.setText(`${state.biome} - ${state.checkpoint}`);
    this.powerText.setText(state.powerups);
    this.bossText.setText(state.bossName);
    this.bossBar.width = 320 * Phaser.Math.Clamp(state.bossHpPct, 0, 1);
    this.fpsText.setText(import.meta.env.DEV ? `${Math.round(state.fps)} fps` : '');
  }
}

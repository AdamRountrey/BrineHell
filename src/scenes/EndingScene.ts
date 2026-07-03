import Phaser from 'phaser';
import { reggaeMidi } from '../systems/ReggaeMidi';

export class EndingScene extends Phaser.Scene {
  constructor() {
    super('EndingScene');
  }

  create(data: { score?: number }): void {
    reggaeMidi.setMode('ending');
    const { width, height } = this.scale;
    this.add.image(width / 2, height / 2, 'ocean-biomes').setDisplaySize(width, height).setAlpha(0.6);
    this.add.rectangle(width / 2, height / 2, width, height, 0x020915, 0.45);
    this.add.image(width / 2, 300, 'boss-mermaidRescue').setScale(1.4);
    this.add
      .text(width / 2, 120, 'THE CURRENT IS FREE', {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: '34px',
        color: '#f8fdff',
        stroke: '#04243a',
        strokeThickness: 6
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 430, `Final Score ${Math.floor(data.score ?? 0).toLocaleString()}`, {
        fontSize: '24px',
        color: '#fff1a8'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 510, 'ENTER  Return to menu', {
        fontSize: '22px',
        color: '#bff6ff'
      })
      .setOrigin(0.5);
    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('MenuScene'));
  }
}

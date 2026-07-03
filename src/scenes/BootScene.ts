import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.image('ocean-biomes', 'assets/generated/ocean-biomes.png');
    ['shallows', 'coral', 'kelp', 'bluewater', 'trench', 'palace'].forEach((id) => {
      this.load.image(`bg-${id}`, `assets/backgrounds/bg-${id}-loop.png`);
    });
    [
      'player-fish',
      'helper-fish',
      'enemy-smallFish',
      'enemy-crab',
      'enemy-shrimp',
      'enemy-clam',
      'enemy-urchin',
      'enemy-shark',
      'enemy-jellyfish',
      'enemy-eel',
      'enemy-angler',
      'enemy-shell',
      'boss-turtle',
      'boss-octopus',
      'boss-eelQueen',
      'boss-leviathan',
      'boss-anglerKing',
      'boss-mermaidRescue',
      'boss-abyssMermaid',
      'power-pearl',
      'power-bubble',
      'power-shield',
      'power-magnet',
      'power-bomb',
      'power-life'
    ].forEach((key) => this.load.image(key, `assets/sprites/${key}.png`));
    ['player-shot', 'pearl-shot', 'bubble-shot', 'enemy-shot', 'boss-shot'].forEach((key) => this.load.image(key, `assets/sprites/${key}.png`));
  }

  create(): void {
    this.createFishTexture('player-fish', 0xffc947, 0x12d7ff, 72, 52);
    this.createFishTexture('helper-fish', 0xa7ff6b, 0x23a6d5, 42, 30);
    this.createFishTexture('enemy-smallFish', 0xff6b9d, 0xffe66d, 42, 30);
    this.createCrabTexture();
    this.createShrimpTexture();
    this.createClamTexture();
    this.createUrchinTexture();
    this.createFishTexture('enemy-shark', 0x89a6bd, 0x314c66, 84, 40);
    this.createJellyTexture();
    this.createEelTexture();
    this.createFishTexture('enemy-angler', 0x23364d, 0x7fffd4, 66, 46);
    this.createClamTexture('enemy-shell', 0x64748b, 0xd8f3ff);
    this.createBossTexture('boss-turtle', 0x3f8f63, 0xd7c782, 154, 116);
    this.createBossTexture('boss-octopus', 0xc75ccf, 0x5b1f75, 166, 128);
    this.createBossTexture('boss-eelQueen', 0x7ddc82, 0x154734, 150, 132);
    this.createBossTexture('boss-leviathan', 0x5fa9ff, 0x0c2d5f, 190, 112);
    this.createBossTexture('boss-anglerKing', 0x162033, 0x00e7ff, 168, 126);
    this.createBossTexture('boss-mermaidRescue', 0xffd1ea, 0x6ae9ff, 138, 144);
    this.createBossTexture('boss-abyssMermaid', 0x8b5cf6, 0x06f7ff, 204, 178);
    this.createPickupTexture();
    this.createShieldTexture();
    this.scene.start('MenuScene');
  }

  private createFishTexture(key: string, body: number, fin: number, width: number, height: number): void {
    if (this.textures.exists(key)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(fin, 1);
    g.fillTriangle(width * 0.5, height * 0.08, width * 0.1, height * 0.5, width * 0.5, height * 0.92);
    g.fillTriangle(width * 0.54, height * 0.24, width * 0.88, height * 0.02, width * 0.76, height * 0.46);
    g.fillTriangle(width * 0.54, height * 0.76, width * 0.88, height * 0.98, width * 0.76, height * 0.54);
    g.fillStyle(body, 1);
    g.fillEllipse(width * 0.52, height * 0.5, width * 0.68, height * 0.72);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(width * 0.66, height * 0.36, 3.5);
    g.fillStyle(0x061826, 1);
    g.fillCircle(width * 0.67, height * 0.36, 1.8);
    g.lineStyle(2, 0xffffff, 0.45);
    g.strokeEllipse(width * 0.52, height * 0.5, width * 0.68, height * 0.72);
    g.generateTexture(key, width, height);
    g.destroy();
  }

  private createCrabTexture(): void {
    if (this.textures.exists('enemy-crab')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(4, 0xffb703, 1);
    g.fillStyle(0xfb5607, 1);
    g.fillEllipse(32, 28, 42, 32);
    g.fillCircle(10, 16, 9);
    g.fillCircle(54, 16, 9);
    for (let i = 0; i < 3; i += 1) {
      g.lineBetween(16, 32 + i * 5, 2, 40 + i * 8);
      g.lineBetween(48, 32 + i * 5, 62, 40 + i * 8);
    }
    g.generateTexture('enemy-crab', 64, 58);
    g.destroy();
  }

  private createShrimpTexture(): void {
    if (this.textures.exists('enemy-shrimp')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(3, 0xffe1a8, 1);
    g.fillStyle(0xff7b54, 1);
    g.fillEllipse(28, 24, 44, 22);
    g.fillTriangle(8, 24, 2, 10, 2, 38);
    g.fillStyle(0xffc6a8, 1);
    g.fillEllipse(44, 20, 18, 14);
    g.generateTexture('enemy-shrimp', 58, 48);
    g.destroy();
  }

  private createClamTexture(key = 'enemy-clam', shell = 0xb388eb, pearl = 0xffffff): void {
    if (this.textures.exists(key)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(shell, 1);
    g.fillEllipse(34, 35, 58, 38);
    g.fillStyle(0x0a2238, 0.55);
    g.fillEllipse(34, 41, 48, 16);
    g.fillStyle(pearl, 1);
    g.fillCircle(34, 35, 7);
    g.lineStyle(2, 0xffffff, 0.35);
    for (let i = 0; i < 6; i += 1) g.lineBetween(14 + i * 8, 24, 20 + i * 5, 44);
    g.generateTexture(key, 68, 62);
    g.destroy();
  }

  private createUrchinTexture(): void {
    if (this.textures.exists('enemy-urchin')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(3, 0xd8b4fe, 1);
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      g.lineBetween(32, 32, 32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30);
    }
    g.fillStyle(0x6d28d9, 1);
    g.fillCircle(32, 32, 20);
    g.generateTexture('enemy-urchin', 64, 64);
    g.destroy();
  }

  private createJellyTexture(): void {
    if (this.textures.exists('enemy-jellyfish')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x9bf6ff, 0.82);
    g.fillEllipse(34, 24, 52, 34);
    g.fillStyle(0xff70a6, 0.72);
    for (let i = 0; i < 5; i += 1) g.fillRoundedRect(13 + i * 10, 36, 4, 26 + (i % 2) * 8, 2);
    g.generateTexture('enemy-jellyfish', 68, 76);
    g.destroy();
  }

  private createEelTexture(): void {
    if (this.textures.exists('enemy-eel')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(12, 0x72efdd, 1);
    g.beginPath();
    g.moveTo(8, 30);
    g.lineTo(22, 8);
    g.lineTo(42, 52);
    g.lineTo(62, 20);
    g.lineTo(82, 34);
    g.strokePath();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(72, 28, 3);
    g.generateTexture('enemy-eel', 92, 64);
    g.destroy();
  }

  private createBossTexture(key: string, body: number, accent: number, width: number, height: number): void {
    if (this.textures.exists(key)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(accent, 0.9);
    g.fillEllipse(width * 0.5, height * 0.5, width * 0.82, height * 0.72);
    g.fillStyle(body, 1);
    g.fillEllipse(width * 0.5, height * 0.46, width * 0.62, height * 0.55);
    g.lineStyle(5, 0xffffff, 0.35);
    g.strokeEllipse(width * 0.5, height * 0.46, width * 0.62, height * 0.55);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(width * 0.58, height * 0.34, 5);
    g.fillCircle(width * 0.42, height * 0.34, 5);
    g.fillStyle(0x061826, 1);
    g.fillCircle(width * 0.58, height * 0.34, 2.5);
    g.fillCircle(width * 0.42, height * 0.34, 2.5);
    g.generateTexture(key, width, height);
    g.destroy();
  }

  private createPickupTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x00f5d4, 0.9);
    g.fillCircle(20, 20, 18);
    g.lineStyle(3, 0xffffff, 0.8);
    g.strokeCircle(20, 20, 15);
    g.generateTexture('pickup', 40, 40);
    g.destroy();
  }

  private createShieldTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(4, 0x9bf6ff, 0.9);
    g.strokeCircle(48, 48, 42);
    g.lineStyle(2, 0xffffff, 0.35);
    g.strokeCircle(48, 48, 34);
    g.generateTexture('shield-ring', 96, 96);
    g.destroy();
  }
}

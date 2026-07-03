import Phaser from 'phaser';
import bossesJson from '../content/bosses/ocean-bosses.json';
import enemiesJson from '../content/enemies/ocean-enemies.json';
import powerupsJson from '../content/powerups/ocean-powerups.json';
import stageJson from '../content/stages/abyssal-campaign.json';
import { clearSave, loadSave, saveCheckpoint } from '../save/saveState';
import { ObjectPool } from '../systems/ObjectPool';
import { reggaeMidi } from '../systems/ReggaeMidi';
import type { BossDef, BossId, EnemyDef, EnemyId, HudState, PowerupDef, PowerupId, StageDef, WaveDef } from '../types/game';

const GAME_W = 540;
const GAME_H = 960;
const PLAYER_Y = 820;
const BIOME_BG_KEYS: Record<string, string> = {
  shallows: 'bg-shallows',
  coral: 'bg-coral',
  kelp: 'bg-kelp',
  bluewater: 'bg-bluewater',
  trench: 'bg-trench',
  palace: 'bg-palace'
};
const BIOME_ENEMY_SETS: Record<string, EnemyId[]> = {
  shallows: ['smallFish', 'shrimp', 'crab', 'clam', 'urchin'],
  coral: ['smallFish', 'jellyfish', 'shark', 'clam', 'urchin'],
  kelp: ['eel', 'shrimp', 'jellyfish', 'shell'],
  bluewater: ['shark', 'smallFish', 'eel', 'angler'],
  trench: ['angler', 'shell', 'jellyfish', 'shark'],
  palace: ['shell', 'angler', 'eel', 'jellyfish']
};

interface Bullet extends Phaser.GameObjects.Image {
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  pierce: number;
  age: number;
  kind: 'normal' | 'wobble' | 'homing' | 'cluster';
  wobbleStartX: number;
  wobbleAmp: number;
  wobbleFreq: number;
  turnRate: number;
  splitAt: number;
  splitCount: number;
  splitSpeed: number;
}

interface FlashableImage extends Phaser.GameObjects.Image {
  flashClearEvent?: Phaser.Time.TimerEvent;
  lastHitFlashAt?: number;
}

interface EnemyActor extends Phaser.GameObjects.Image {
  enemyId: EnemyId;
  hp: number;
  maxHp: number;
  shieldHp: number;
  vx: number;
  vy: number;
  radius: number;
  score: number;
  age: number;
  fireTimer: number;
  fireRate: number;
  movement: string;
  projectile: string;
  dropTable: EnemyDef['dropTable'];
}

interface PickupActor extends Phaser.GameObjects.Image {
  powerupId: PowerupId;
  vx: number;
  vy: number;
  radius: number;
}

interface BossActor extends Phaser.GameObjects.Image {
  bossId: BossId;
  hp: number;
  maxHp: number;
  radius: number;
  score: number;
  fireTimer: number;
  phaseIndex: number;
  superTimer: number;
  chargeTimer: number;
  charging: boolean;
  superKind: string;
  isSupport: boolean;
  manualFireCooldown: number;
  warning: Phaser.GameObjects.Graphics;
}

interface PendingSpawn {
  wave: WaveDef;
  spawned: number;
  nextAt: number;
}

export class GameScene extends Phaser.Scene {
  private readonly stage = stageJson as StageDef;
  private readonly enemies = new Map((enemiesJson as EnemyDef[]).map((enemy) => [enemy.id, enemy]));
  private readonly bosses = new Map((bossesJson as BossDef[]).map((boss) => [boss.id, boss]));
  private readonly powerups = new Map((powerupsJson as PowerupDef[]).map((powerup) => [powerup.id, powerup]));

  private player!: Phaser.GameObjects.Image;
  private shieldRing!: Phaser.GameObjects.Image;
  private friendlyShark!: Phaser.GameObjects.Image;
  private helpers: Phaser.GameObjects.Image[] = [];
  private bgPrimary!: Phaser.GameObjects.TileSprite;
  private bgSecondary!: Phaser.GameObjects.TileSprite;
  private bgDetail!: Phaser.GameObjects.TileSprite;
  private activeBgKey = BIOME_BG_KEYS.shallows;
  private messageText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private gameOverButtons: Phaser.GameObjects.GameObject[] = [];
  private mobileBombButton: Phaser.GameObjects.Container | null = null;
  private mobileBombButtonBg: Phaser.GameObjects.Arc | null = null;
  private mobileBombButtonText: Phaser.GameObjects.Text | null = null;

  private playerBullets!: ObjectPool<Bullet>;
  private enemyBullets!: ObjectPool<Bullet>;
  private enemiesPool!: ObjectPool<EnemyActor>;
  private pickupsPool!: ObjectPool<PickupActor>;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private elapsed = 0;
  private visualTime = 0;
  private score = 0;
  private lives = 4;
  private nextLifeScore = 20000;
  private invuln = 0;
  private shootTimer = 0;
  private shotCycle = 0;
  private bombTimer = 0;
  private bossAngle = 0;
  private ambientTimer = 4;
  private sharkTimer = 0;
  private nextWaveIndex = 0;
  private nextBossIndex = 0;
  private pendingSpawns: PendingSpawn[] = [];
  private boss: BossActor | null = null;
  private supportBosses: BossActor[] = [];
  private bossMouseTarget: BossActor | null = null;
  private bossMouseX = GAME_W / 2;
  private bossMouseY = 150;
  private bossMouseControlUntil = 0;
  private activeBossEventId: BossId | null = null;
  private loopLevel = 1;
  private currentBiome = this.stage.biomes[0];
  private currentCheckpoint = this.stage.checkpoints[0];
  private gameOver = false;
  private won = false;
  private pausedByPlayer = false;
  private autoplay = false;
  private mobileControls = false;
  private touchActive = false;
  private touchPointerId = -1;
  private touchTargetX = GAME_W / 2;
  private touchTargetY = PLAYER_Y;

  private readonly stacks: Record<PowerupId, number> = {
    spread: 0,
    pearl: 0,
    bubble: 0,
    helper: 0,
    shield: 0,
    magnet: 0,
    bomb: 1,
    speed: 0,
    life: 0,
    shark: 0
  };

  private readonly timed: Partial<Record<PowerupId, number>> = {};

  constructor() {
    super('GameScene');
  }

  create(data: { continueFromSave?: boolean; newRun?: boolean } = {}): void {
    if (data.newRun) clearSave();

    const save = data.continueFromSave ? loadSave() : null;
    this.autoplay = import.meta.env.DEV && new URLSearchParams(window.location.search).has('autoplay');
    this.mobileControls = this.detectMobileControls();
    this.resetRunState(save?.unlockedPowerups ?? [], save?.powerupStacks, save?.timedPowerups, save?.loopLevel ?? 1);
    this.elapsed = save?.checkpointTime ?? 0;
    this.score = save?.score ?? 0;
    this.lives = Math.max(1, save?.lives ?? 4);
    this.nextLifeScore = Math.floor(this.score / 20000 + 1) * 20000;

    this.restoreProgressIndexes();
    this.createBackground();
    this.createPools();
    this.createPlayer();
    this.createInput();
    this.createOverlay();
    this.createMobileControls();

    this.scene.launch('HudScene');
    reggaeMidi.start('game');
    this.showBanner(save ? `Continued: ${save.checkpointId}` : 'Current mouth');
  }

  private resetRunState(
    savedPowerups: PowerupId[],
    savedStacks?: Partial<Record<PowerupId, number>>,
    savedTimed?: Partial<Record<PowerupId, number>>,
    savedLoopLevel = 1
  ): void {
    this.invuln = 0;
    this.visualTime = 0;
    this.shootTimer = 0;
    this.shotCycle = 0;
    this.bombTimer = 0;
    this.bossAngle = 0;
    this.ambientTimer = 4;
    this.sharkTimer = 0;
    this.nextWaveIndex = 0;
    this.nextBossIndex = 0;
    this.pendingSpawns = [];
    this.boss = null;
    this.supportBosses = [];
    this.activeBossEventId = null;
    this.loopLevel = Math.max(1, Math.floor(savedLoopLevel));
    this.currentBiome = this.stage.biomes[0];
    this.currentCheckpoint = this.stage.checkpoints[0];
    this.gameOver = false;
    this.won = false;
    this.pausedByPlayer = false;
    this.gameOverButtons = [];
    this.touchActive = false;
    this.touchPointerId = -1;
    this.touchTargetX = GAME_W / 2;
    this.touchTargetY = PLAYER_Y;
    for (const id of Object.keys(this.stacks) as PowerupId[]) this.stacks[id] = id === 'bomb' ? 1 : 0;
    for (const id of Object.keys(this.timed) as PowerupId[]) delete this.timed[id];
    if (savedStacks) {
      for (const id of Object.keys(this.stacks) as PowerupId[]) {
        if (id === 'life') continue;
        const limit = this.powerups.get(id)?.stackLimit ?? (id === 'bomb' ? 3 : 1);
        this.stacks[id] = Phaser.Math.Clamp(Math.floor(savedStacks[id] ?? this.stacks[id]), 0, limit);
      }
    } else {
      for (const id of savedPowerups) {
        if (id === 'life' || id === 'shark') continue;
        this.stacks[id] = Phaser.Math.Clamp(Math.max(1, this.stacks[id]), 0, this.powerups.get(id)?.stackLimit ?? 1);
      }
    }
    if (savedTimed) {
      for (const id of Object.keys(savedTimed) as PowerupId[]) {
        const remaining = savedTimed[id] ?? 0;
        if (remaining <= 0) continue;
        if (id === 'shark') {
          this.sharkTimer = remaining;
          this.stacks.shark = 1;
        } else {
          this.timed[id] = remaining;
        }
      }
    }
  }

  update(_: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.033);
    if (this.gameOver || this.won) return;
    if (this.pausedByPlayer) {
      this.updateHud();
      return;
    }

    this.visualTime += dt;
    if (!this.hasActiveBoss()) this.elapsed += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.bombTimer = Math.max(0, this.bombTimer - dt);
    for (const id of Object.keys(this.timed) as PowerupId[]) {
      this.timed[id] = Math.max(0, (this.timed[id] ?? 0) - dt);
      if (this.timed[id] === 0) {
        if (id !== 'shield') this.stacks[id] = 0;
        delete this.timed[id];
      }
    }

    this.updateBiomeAndCheckpoint();
    this.updateBackground();
    this.updatePlayer(dt);
    this.updateMobileControls();
    this.updateFriendlyShark(dt);
    this.updateShooting(dt);
    this.updateWaveScheduler();
    this.updateAmbientDirector(dt);
    this.updatePendingSpawns(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateCollisions();
    this.updateHud();
  }

  private createBackground(): void {
    this.activeBgKey = this.backgroundKey(this.currentBiome.id);
    this.bgPrimary = this.add.tileSprite(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, this.activeBgKey).setDepth(-12);
    this.bgSecondary = this.add.tileSprite(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, this.activeBgKey).setDepth(-11).setAlpha(0);
    this.bgDetail = this.add
      .tileSprite(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, this.activeBgKey)
      .setDepth(-10)
      .setAlpha(0.22)
      .setFlipX(true);
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x02101d, 0.16).setDepth(-9);
  }

  private createPools(): void {
    this.playerBullets = new ObjectPool<Bullet>(
      () => this.add.image(-100, -100, 'player-shot').setDepth(58) as Bullet,
      (item) => this.resetBullet(item, 'player-shot', 58),
      1400
    );
    this.enemyBullets = new ObjectPool<Bullet>(
      () => this.add.image(-100, -100, 'enemy-shot').setDepth(54) as Bullet,
      (item) => this.resetBullet(item, 'enemy-shot', 54),
      1400
    );
    this.enemiesPool = new ObjectPool<EnemyActor>(
      () => this.add.image(-100, -100, 'enemy-smallFish').setDepth(10) as EnemyActor,
      (item) => this.resetActor(item),
      96
    );
    this.pickupsPool = new ObjectPool<PickupActor>(
      () => this.add.image(-100, -100, 'pickup').setDepth(15) as PickupActor,
      (item) => this.resetActor(item),
      48
    );
  }

  private resetActor<T extends Phaser.GameObjects.Image>(item: T): void {
    const flashable = item as FlashableImage;
    flashable.flashClearEvent?.remove(false);
    flashable.flashClearEvent = undefined;
    flashable.lastHitFlashAt = undefined;
    item
      .setActive(false)
      .setVisible(false)
      .setPosition(-100, -100)
      .setAlpha(1)
      .setScale(1)
      .setRotation(0)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .clearTint();
  }

  private resetBullet(item: Bullet, texture: string, depth: number): void {
    item
      .setActive(false)
      .setVisible(false)
      .setTexture(texture)
      .setPosition(-100, -100)
      .setDepth(depth)
      .setAlpha(1)
      .setScale(1)
      .setRotation(0)
      .setOrigin(0.5)
      .setFlip(false, false)
      .setScrollFactor(1)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .clearTint()
      .clearMask();
    item.vx = 0;
    item.vy = 0;
    item.radius = 0;
    item.damage = 0;
    item.pierce = 0;
    item.age = 0;
    item.kind = 'normal';
    item.wobbleStartX = -100;
    item.wobbleAmp = 0;
    item.wobbleFreq = 0;
    item.turnRate = 0;
    item.splitAt = -1;
    item.splitCount = 0;
    item.splitSpeed = 0;
  }

  private createPlayer(): void {
    this.player = this.add.image(GAME_W / 2, PLAYER_Y, 'player-fish').setDepth(30);
    this.player.setScale(0.95);
    this.shieldRing = this.add.image(this.player.x, this.player.y, 'shield-ring').setDepth(29).setVisible(false);
    this.friendlyShark = this.add
      .image(GAME_W / 2, GAME_H + 120, 'enemy-shark')
      .setDepth(27)
      .setScale(1.35)
      .setTint(0x9bf6ff)
      .setVisible(false);
    this.helpers = [
      this.add.image(-100, -100, 'helper-fish').setDepth(28).setVisible(false),
      this.add.image(-100, -100, 'helper-fish').setDepth(28).setVisible(false)
    ];
  }

  private createInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,B,P,ENTER,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.P.on('down', () => this.togglePause());
    this.keys.B.on('down', () => this.useBomb());
    this.input.keyboard!.on('keydown-M', () => reggaeMidi.toggleMute());
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.handleMobilePointerDown(pointer)) return;
      this.handleBossPointer(pointer, true);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.handleMobilePointerMove(pointer)) return;
      this.handleBossPointer(pointer, false);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.handleMobilePointerUp(pointer));
  }

  private detectMobileControls(): boolean {
    const params = new URLSearchParams(window.location.search);
    if (params.has('mobileControls')) return true;
    return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
  }

  private createMobileControls(): void {
    if (!this.mobileControls) return;

    const bg = this.add.circle(0, 0, 42, 0x2a0f3f, 0.74).setStrokeStyle(4, 0xf5d0ff, 0.9);
    const label = this.add
      .text(0, -2, 'BOMB', {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#18051f',
        strokeThickness: 4
      })
      .setOrigin(0.5);
    this.mobileBombButton = this.add.container(GAME_W - 72, GAME_H - 96, [bg, label]).setDepth(180);
    this.mobileBombButtonBg = bg;
    this.mobileBombButtonText = label;
    this.mobileBombButton.setSize(96, 96).setInteractive(new Phaser.Geom.Rectangle(-48, -48, 96, 96), Phaser.Geom.Rectangle.Contains);
    this.mobileBombButton.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.useBomb();
      this.pulseMobileBombButton();
    });

    this.add
      .text(GAME_W / 2, GAME_H - 26, 'Drag to swim', {
        fontSize: '16px',
        color: '#d9fbff',
        stroke: '#03192d',
        strokeThickness: 3
      })
      .setOrigin(0.5)
      .setAlpha(0.72)
      .setDepth(160);
  }

  private handleMobilePointerDown(pointer: Phaser.Input.Pointer): boolean {
    if (!this.mobileControls || this.autoplay || this.gameOver || this.won || this.pausedByPlayer) return false;
    if (this.isBombButtonPoint(pointer.worldX, pointer.worldY)) {
      this.useBomb();
      this.pulseMobileBombButton();
      return true;
    }

    this.touchActive = true;
    this.touchPointerId = pointer.id;
    this.setTouchTarget(pointer.worldX, pointer.worldY);
    return true;
  }

  private handleMobilePointerMove(pointer: Phaser.Input.Pointer): boolean {
    if (!this.mobileControls || !this.touchActive || pointer.id !== this.touchPointerId) return false;
    this.setTouchTarget(pointer.worldX, pointer.worldY);
    return true;
  }

  private handleMobilePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.touchActive || pointer.id !== this.touchPointerId) return;
    this.touchActive = false;
    this.touchPointerId = -1;
  }

  private setTouchTarget(x: number, y: number): void {
    this.touchTargetX = Phaser.Math.Clamp(x, 34, GAME_W - 34);
    this.touchTargetY = Phaser.Math.Clamp(y, 92, GAME_H - 42);
  }

  private isBombButtonPoint(x: number, y: number): boolean {
    if (!this.mobileBombButton?.visible) return false;
    return Phaser.Math.Distance.Between(x, y, this.mobileBombButton.x, this.mobileBombButton.y) <= 56;
  }

  private pulseMobileBombButton(): void {
    if (!this.mobileBombButton) return;
    this.tweens.killTweensOf(this.mobileBombButton);
    this.mobileBombButton.setScale(0.86);
    this.tweens.add({ targets: this.mobileBombButton, scale: 1, duration: 130, ease: 'Back.easeOut' });
  }

  private createOverlay(): void {
    this.messageText = this.add
      .text(GAME_W / 2, 220, '', {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: '26px',
        color: '#f8fdff',
        stroke: '#03192d',
        strokeThickness: 5,
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(100);
    this.pauseText = this.add
      .text(GAME_W / 2, GAME_H / 2, '', {
        fontSize: '30px',
        color: '#f8fdff',
        align: 'center',
        lineSpacing: 16
      })
      .setOrigin(0.5)
      .setDepth(200);
  }

  private restoreProgressIndexes(): void {
    this.nextWaveIndex = this.stage.waves.findIndex((wave) => wave.at >= this.elapsed);
    if (this.nextWaveIndex < 0) this.nextWaveIndex = this.stage.waves.length;
    this.nextBossIndex = this.stage.bosses.findIndex((event) => event.at >= this.elapsed);
    if (this.nextBossIndex < 0) this.nextBossIndex = this.stage.bosses.length;
    this.currentBiome = [...this.stage.biomes].reverse().find((biome) => biome.at <= this.elapsed) ?? this.stage.biomes[0];
    this.currentCheckpoint =
      [...this.stage.checkpoints].reverse().find((checkpoint) => checkpoint.at <= this.elapsed) ?? this.stage.checkpoints[0];
  }

  private updateBiomeAndCheckpoint(): void {
    const biome = [...this.stage.biomes].reverse().find((entry) => entry.at <= this.elapsed) ?? this.currentBiome;
    if (biome.id !== this.currentBiome.id) {
      this.currentBiome = biome;
      this.ambientTimer = 1.2;
      this.transitionBackground(this.backgroundKey(biome.id));
      this.showBanner(biome.name);
    }

    const checkpoint = [...this.stage.checkpoints].reverse().find((entry) => entry.at <= this.elapsed) ?? this.currentCheckpoint;
    if (checkpoint.id !== this.currentCheckpoint.id) {
      this.currentCheckpoint = checkpoint;
      this.showBanner(`Checkpoint: ${checkpoint.name}`);
      saveCheckpoint({
        stageId: this.stage.id,
        checkpointId: checkpoint.id,
        checkpointTime: checkpoint.at,
        score: this.score,
        lives: this.lives,
        unlockedPowerups: this.activePowerupIds(),
        powerupStacks: this.currentPowerupStacks(),
        timedPowerups: this.currentTimedPowerups(),
        loopLevel: this.loopLevel,
        difficulty: 'reef'
      });
    }
  }

  private updateBackground(): void {
    const scroll = this.visualTime * 92;
    this.bgPrimary.tilePositionY = -scroll;
    this.bgPrimary.tilePositionX = Math.sin(this.visualTime * 0.16) * 10;
    this.bgSecondary.tilePositionY = -scroll;
    this.bgSecondary.tilePositionX = Math.sin(this.visualTime * 0.16 + 0.8) * 10;
    this.bgDetail.tilePositionY = -scroll * 0.62;
    this.bgDetail.tilePositionX = 80 + Math.sin(this.visualTime * 0.11) * 22;
    this.bgPrimary.setTint(this.currentBiome.tint);
    this.bgSecondary.setTint(this.currentBiome.tint);
    this.bgDetail.setTint(0xffffff);
  }

  private backgroundKey(biomeId: string): string {
    return BIOME_BG_KEYS[biomeId] ?? BIOME_BG_KEYS.shallows;
  }

  private transitionBackground(nextKey: string): void {
    if (nextKey === this.activeBgKey) return;
    this.bgSecondary.setTexture(nextKey).setAlpha(0);
    this.bgSecondary.tilePositionY = this.bgPrimary.tilePositionY;
    this.bgDetail.setTexture(nextKey).setAlpha(0);
    this.tweens.killTweensOf([this.bgPrimary, this.bgSecondary, this.bgDetail]);
    this.tweens.add({
      targets: this.bgSecondary,
      alpha: 1,
      duration: 1200,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.bgPrimary.setTexture(nextKey).setAlpha(1);
        this.bgSecondary.setAlpha(0);
        this.bgDetail.setTexture(nextKey).setAlpha(0.22).setFlipX(true);
        this.activeBgKey = nextKey;
      }
    });
    this.tweens.add({
      targets: this.bgPrimary,
      alpha: 0,
      duration: 1200,
      ease: 'Sine.easeInOut'
    });
    this.tweens.add({
      targets: this.bgDetail,
      alpha: 0.22,
      duration: 1200,
      ease: 'Sine.easeInOut'
    });
  }

  private updatePlayer(dt: number): void {
    const speed = 300 + this.stacks.speed * 45;
    if (this.autoplay) {
      this.updateAutoplayPlayer(dt, speed);
    } else if (this.mobileControls && this.touchActive) {
      this.updateTouchPlayer(dt, speed);
    } else {
      const left = this.cursors.left?.isDown || this.keys.A.isDown;
      const right = this.cursors.right?.isDown || this.keys.D.isDown;
      const up = this.cursors.up?.isDown || this.keys.W.isDown;
      const down = this.cursors.down?.isDown || this.keys.S.isDown;
      const xAxis = Number(right) - Number(left);
      const yAxis = Number(down) - Number(up);
      const len = Math.hypot(xAxis, yAxis) || 1;
      this.player.x = Phaser.Math.Clamp(this.player.x + (xAxis / len) * speed * dt, 34, GAME_W - 34);
      this.player.y = Phaser.Math.Clamp(this.player.y + (yAxis / len) * speed * dt, 92, GAME_H - 42);
    }
    this.player.setAlpha(this.invuln > 0 && Math.floor(this.invuln * 16) % 2 === 0 ? 0.45 : 1);
    this.shieldRing.setPosition(this.player.x, this.player.y).setVisible(this.stacks.shield > 0);
    this.helpers.forEach((helper, index) => {
      const active = index < this.stacks.helper;
      helper.setVisible(active);
      if (active) {
        const angle = this.visualTime * 3 + index * Math.PI;
        helper.setPosition(this.player.x + Math.cos(angle) * 58, this.player.y + Math.sin(angle) * 20);
      }
    });
  }

  private updateTouchPlayer(dt: number, speed: number): void {
    const dx = this.touchTargetX - this.player.x;
    const dy = this.touchTargetY - this.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1) return;
    const step = Math.min(distance, speed * 1.85 * dt);
    this.player.x = Phaser.Math.Clamp(this.player.x + (dx / distance) * step, 34, GAME_W - 34);
    this.player.y = Phaser.Math.Clamp(this.player.y + (dy / distance) * step, 92, GAME_H - 42);
  }

  private updateMobileControls(): void {
    if (!this.mobileBombButton || !this.mobileBombButtonBg || !this.mobileBombButtonText) return;
    const usable = this.stacks.bomb > 0 && this.bombTimer <= 0 && !this.gameOver && !this.won;
    this.mobileBombButton.setVisible(this.mobileControls);
    this.mobileBombButtonBg.setFillStyle(usable ? 0x6420a6 : 0x263447, usable ? 0.82 : 0.48);
    this.mobileBombButtonBg.setStrokeStyle(4, usable ? 0xf5d0ff : 0x7895a8, usable ? 0.92 : 0.58);
    this.mobileBombButtonText.setText(`BOMB\n${this.stacks.bomb}`);
    this.mobileBombButtonText.setColor(usable ? '#ffffff' : '#b9c5cc');
    this.mobileBombButton.setAlpha(usable ? 1 : 0.64);
  }

  private updateAutoplayPlayer(dt: number, speed: number): void {
    let immediateDanger = 0;
    this.enemyBullets.forEachActive((bullet) => {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, bullet.x, bullet.y) < bullet.radius + 50) immediateDanger += bullet.kind === 'homing' ? 2 : 1;
    });
    this.enemiesPool.forEachActive((enemy) => {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y) < enemy.radius + 48) immediateDanger += 2;
    });
    if (this.stacks.bomb > 0 && this.bombTimer <= 0 && (immediateDanger >= 4 || (this.boss?.charging && immediateDanger >= 2))) {
      this.useBomb();
    }

    let aimX = this.boss?.active ? this.boss.x : GAME_W / 2;
    this.enemiesPool.forEachActive((enemy) => {
      if (enemy.y > -20 && enemy.y < GAME_H - 150 && Math.abs(enemy.x - this.player.x) < Math.abs(aimX - this.player.x)) aimX = enemy.x;
    });

    const candidateXs = new Set<number>([this.player.x, GAME_W / 2, aimX, this.player.x - 140, this.player.x - 76, this.player.x + 76, this.player.x + 140]);
    const candidateYs = new Set<number>([
      this.player.y,
      this.boss?.active ? GAME_H - 150 : PLAYER_Y,
      this.player.y - 120,
      this.player.y - 58,
      this.player.y + 58,
      this.player.y + 120
    ]);
    this.pickupsPool.forEachActive((pickup) => {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, pickup.x, pickup.y);
      if (distance < (this.stacks.magnet > 0 ? 330 : 210) && pickup.y > 105 && pickup.y < GAME_H - 55) {
        candidateXs.add(pickup.x);
        candidateYs.add(pickup.y);
      }
    });

    let targetX = this.player.x;
    let targetY = this.player.y;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const rawX of candidateXs) {
      for (const rawY of candidateYs) {
        const x = Phaser.Math.Clamp(rawX, 38, GAME_W - 38);
        const y = Phaser.Math.Clamp(rawY, 105, GAME_H - 48);
        const score = this.scoreAutoplayPosition(x, y, aimX);
        if (score > bestScore) {
          bestScore = score;
          targetX = x;
          targetY = y;
        }
      }
    }

    const dx = targetX - this.player.x;
    const dy = targetY - this.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1) return;
    const step = Math.min(distance, speed * dt);
    this.player.x = Phaser.Math.Clamp(this.player.x + (dx / distance) * step, 34, GAME_W - 34);
    this.player.y = Phaser.Math.Clamp(this.player.y + (dy / distance) * step, 92, GAME_H - 42);
  }

  private scoreAutoplayPosition(x: number, y: number, aimX: number): number {
    let score = 0;
    const preferredY = this.boss?.active ? GAME_H - 150 : PLAYER_Y;
    score -= Math.abs(y - preferredY) * 0.34;
    score -= Math.abs(x - aimX) * (this.boss?.active ? 0.72 : 0.48);
    score -= Math.max(0, 58 - x) * 5 + Math.max(0, x - (GAME_W - 58)) * 5;

    if (this.boss?.charging && this.boss.superKind === 'tidalLaser' && y > this.boss.y && Math.abs(x - this.boss.x) < 78) score -= 900;
    if (this.boss?.charging && this.boss.superKind === 'homingSquall' && Phaser.Math.Distance.Between(x, y, this.boss.x, this.boss.y) < 210) score -= 260;

    this.enemyBullets.forEachActive((bullet) => {
      const samples = bullet.kind === 'homing' ? [0.08, 0.2, 0.36, 0.54] : [0.08, 0.22, 0.42];
      for (const t of samples) {
        const bx = bullet.x + bullet.vx * t;
        const by = bullet.y + bullet.vy * t;
        const distance = Phaser.Math.Distance.Between(x, y, bx, by);
        const danger = bullet.radius + (bullet.kind === 'homing' ? 48 : 38);
        if (distance < danger) score -= 1100 + (danger - distance) * 24;
        else if (distance < danger + 72) score -= (danger + 72 - distance) * (bullet.kind === 'homing' ? 6.5 : 4.5);
      }
    });

    this.enemiesPool.forEachActive((enemy) => {
      const predictedY = enemy.y + enemy.vy * 0.28;
      const distance = Phaser.Math.Distance.Between(x, y, enemy.x, predictedY);
      const danger = enemy.radius + 42;
      if (distance < danger) score -= 1300 + (danger - distance) * 20;
      else if (distance < danger + 58) score -= (danger + 58 - distance) * 5;
      if (enemy.y > -30 && enemy.y < GAME_H - 130) score -= Math.abs(x - enemy.x) * 0.012;
    });

    this.pickupsPool.forEachActive((pickup) => {
      if (pickup.y < 95 || pickup.y > GAME_H - 45) return;
      const distance = Phaser.Math.Distance.Between(x, y, pickup.x, pickup.y);
      const values: Record<PowerupId, number> = {
        life: 360,
        shield: 230,
        bomb: this.stacks.bomb < 2 ? 210 : 90,
        helper: 190,
        pearl: 160,
        spread: 145,
        bubble: 145,
        shark: 130,
        magnet: 95,
        speed: 85
      };
      score += Math.max(0, values[pickup.powerupId] - distance * 1.2);
    });

    return score;
  }

  private updateFriendlyShark(dt: number): void {
    if (this.sharkTimer <= 0) {
      this.friendlyShark.setVisible(false);
      this.stacks.shark = 0;
      return;
    }

    this.sharkTimer = Math.max(0, this.sharkTimer - dt);
    const progress = 1 - this.sharkTimer / 5;
    const sweepX = GAME_W / 2 + Math.sin(progress * Math.PI * 5) * 215;
    const sweepY = GAME_H + 90 - progress * (GAME_H + 260);
    this.friendlyShark.setVisible(true).setPosition(sweepX, sweepY).setRotation(Math.sin(progress * Math.PI * 4) * 0.22);

    this.enemiesPool.forEachActive((enemy) => {
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, this.friendlyShark.x, this.friendlyShark.y) < enemy.radius + 56) {
        this.killEnemy(enemy);
      }
    });

    this.forEachActiveBoss((boss) => {
      if (Phaser.Math.Distance.Between(boss.x, boss.y, this.friendlyShark.x, this.friendlyShark.y) < boss.radius + 64) {
        boss.hp -= 18 * dt;
        this.flash(boss);
        if (boss.hp <= 0) this.killBossActor(boss);
      }
    });
  }

  private updateShooting(dt: number): void {
    const cadence = Math.max(0.065, 0.13 - this.stacks.bubble * 0.012);
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = cadence;
      this.shotCycle += 1;
      this.firePlayerPattern(this.player.x, this.player.y - 34);
      this.helpers.forEach((helper, index) => {
        if (index < this.stacks.helper) {
          const angle = this.nearestTargetAngle(helper.x, helper.y) ?? -Math.PI / 2;
          this.firePlayerBullet(helper.x, helper.y - 20, Math.cos(angle) * 680, Math.sin(angle) * 680, 0.5, 'bubble-shot');
        }
      });
    }
  }

  private firePlayerPattern(x: number, y: number): void {
    this.firePlayerBullet(x, y, 0, -780, 1.25, 'player-shot');
    if (this.offensivePowerLevel() > 0 && this.shotCycle % 2 === 0) {
      this.firePlayerBullet(x - 13, y + 8, -18, -720, 0.35, 'player-shot');
      this.firePlayerBullet(x + 13, y + 8, 18, -720, 0.35, 'player-shot');
    }
    const spread = this.stacks.spread;
    for (let i = 1; i <= spread; i += 1) {
      const speed = 700;
      const angle = Phaser.Math.DegToRad(4 + i * 4);
      this.firePlayerBullet(x - i * 7, y + 4, -Math.sin(angle) * speed, -Math.cos(angle) * speed, 0.48, 'player-shot');
      this.firePlayerBullet(x + i * 7, y + 4, Math.sin(angle) * speed, -Math.cos(angle) * speed, 0.48, 'player-shot');
    }
    for (let i = 0; i < this.stacks.pearl; i += 1) {
      const offset = (i - (this.stacks.pearl - 1) / 2) * 16;
      this.firePlayerBullet(x + offset, y - 8, -offset * 0.8, -670, 1.35, 'pearl-shot', 2);
    }
    for (let i = 0; i < this.stacks.bubble; i += 1) {
      this.firePlayerBullet(x + (i % 2 === 0 ? -16 : 16), y + 6, (i - 1) * 32, -610, 0.38, 'bubble-shot', 0, {
        kind: 'wobble',
        wobbleAmp: 18 + i * 4,
        wobbleFreq: 8 + i
      });
    }
    if (this.stacks.bubble >= 2 && this.shotCycle % 8 === 0) {
      for (let i = -2; i <= 2; i += 1) {
        const angle = Phaser.Math.DegToRad(i * 13);
        this.firePlayerBullet(x, y + 4, Math.sin(angle) * 520, -Math.cos(angle) * 520, 0.26, 'bubble-shot', 0, {
          kind: 'wobble',
          wobbleAmp: 10,
          wobbleFreq: 11
        });
      }
    }
  }

  private firePlayerBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    texture: string,
    pierce = 0,
    options: Partial<Pick<Bullet, 'kind' | 'wobbleAmp' | 'wobbleFreq'>> = {}
  ): void {
    const bullet = this.playerBullets.acquire();
    if (!bullet) return;
    bullet.setTexture(texture).setPosition(x, y).setDepth(58).setVisible(true).setAlpha(1).setScale(1).setRotation(0).setOrigin(0.5).clearTint();
    bullet.vx = vx;
    bullet.vy = vy;
    bullet.radius = texture === 'pearl-shot' ? 8 : 7;
    bullet.damage = damage;
    bullet.pierce = pierce;
    bullet.age = 0;
    bullet.kind = options.kind ?? 'normal';
    bullet.wobbleStartX = x;
    bullet.wobbleAmp = options.wobbleAmp ?? 0;
    bullet.wobbleFreq = options.wobbleFreq ?? 0;
    bullet.turnRate = 0;
    bullet.splitAt = -1;
    bullet.splitCount = 0;
    bullet.splitSpeed = 0;
  }

  private nearestTargetAngle(x: number, y: number): number | null {
    let best: { distance: number; angle: number } | null = null;
    if (this.boss) {
      best = { distance: Phaser.Math.Distance.Between(x, y, this.boss.x, this.boss.y), angle: Phaser.Math.Angle.Between(x, y, this.boss.x, this.boss.y) };
    }
    this.enemiesPool.forEachActive((enemy) => {
      const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (!best || distance < best.distance) best = { distance, angle: Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y) };
    });
    return best?.angle ?? null;
  }

  private updateWaveScheduler(): void {
    while (this.nextWaveIndex < this.stage.waves.length && this.stage.waves[this.nextWaveIndex].at <= this.elapsed) {
      const wave = this.stage.waves[this.nextWaveIndex];
      this.pendingSpawns.push({ wave, spawned: 0, nextAt: 0 });
      this.nextWaveIndex += 1;
    }

    while (this.nextBossIndex < this.stage.bosses.length && this.stage.bosses[this.nextBossIndex].at <= this.elapsed) {
      if (this.boss) break;
      this.spawnBoss(this.stage.bosses[this.nextBossIndex].boss);
      this.nextBossIndex += 1;
    }
  }

  private updateAmbientDirector(dt: number): void {
    if (this.boss || this.currentBiome.id === 'shallows') return;

    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;

    const activeEnemies = this.enemiesPool.activeCount();
    const cap = 7;
    if (activeEnemies >= cap) {
      this.ambientTimer = 1.5;
      return;
    }

    const roster = BIOME_ENEMY_SETS[this.currentBiome.id] ?? BIOME_ENEMY_SETS.shallows;
    const enemy = roster[Phaser.Math.Between(0, roster.length - 1)];
    const count = Phaser.Math.Between(2, 4);
    const lanes: WaveDef['lane'][] = ['left', 'center', 'right', 'spread', 'random'];
    const lane = lanes[Phaser.Math.Between(0, lanes.length - 1)];
    this.pendingSpawns.push({
      wave: {
        at: this.elapsed,
        enemy,
        count,
        interval: Phaser.Math.FloatBetween(0.18, 0.5),
        lane
      },
      spawned: 0,
      nextAt: 0
    });
    this.ambientTimer = Phaser.Math.FloatBetween(5.5, 8);
  }

  private updatePendingSpawns(dt: number): void {
    for (const spawn of this.pendingSpawns) {
      spawn.nextAt -= dt;
      while (spawn.spawned < spawn.wave.count && spawn.nextAt <= 0) {
        this.spawnEnemy(spawn.wave.enemy, spawn.wave.lane, spawn.spawned, spawn.wave.count);
        spawn.spawned += 1;
        spawn.nextAt += spawn.wave.interval;
      }
    }
    this.pendingSpawns = this.pendingSpawns.filter((spawn) => spawn.spawned < spawn.wave.count);
  }

  private spawnEnemy(enemyId: EnemyId, lane: WaveDef['lane'], index: number, count: number): void {
    const def = this.enemies.get(enemyId);
    const enemy = this.enemiesPool.acquire();
    if (!def || !enemy) return;
    const x = this.laneX(lane, index, count);
    enemy.setTexture(`enemy-${enemyId}`).setPosition(x, -40).setVisible(true).setAlpha(1).setRotation(0).setScale(1);
    const difficulty = this.difficultyScale();
    enemy.enemyId = enemyId;
    enemy.hp = Math.ceil(def.hp * difficulty);
    enemy.maxHp = def.hp;
    enemy.shieldHp = this.rollEnemyShield(enemyId, difficulty);
    this.applyEnemyShieldLook(enemy);
    enemy.vx = 0;
    enemy.vy = def.speed * Math.min(1.75, difficulty);
    enemy.radius = def.radius;
    enemy.score = Math.round(def.score * difficulty);
    enemy.age = 0;
    enemy.fireRate = def.fireRate > 0 ? Math.max(0.28, (def.fireRate * 0.72) / Math.min(1.75, difficulty)) : 0;
    enemy.fireTimer = enemy.fireRate > 0 ? Phaser.Math.FloatBetween(enemy.fireRate * 0.25, enemy.fireRate * 0.85) : 0;
    enemy.movement = def.movement;
    enemy.projectile = def.projectile;
    enemy.dropTable = def.dropTable;
  }

  private rollEnemyShield(enemyId: EnemyId, difficulty: number): number {
    if (enemyId === 'smallFish' || enemyId === 'shrimp') return 0;
    const baseChance = 0.14 + Math.min(0.16, (difficulty - 1) * 0.08);
    const heavyBonus = enemyId === 'shell' || enemyId === 'shark' || enemyId === 'angler' ? 0.08 : 0;
    if (Math.random() > baseChance + heavyBonus) return 0;
    return Math.random() < 0.22 + Math.min(0.18, (difficulty - 1) * 0.06) ? 2 : 1;
  }

  private applyEnemyShieldLook(enemy: EnemyActor): void {
    if (enemy.shieldHp > 0) {
      enemy.setTint(0x9bf6ff).setBlendMode(Phaser.BlendModes.ADD);
    } else {
      enemy.clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
    }
  }

  private laneX(lane: WaveDef['lane'], index: number, count: number): number {
    if (lane === 'left') return Phaser.Math.Linear(70, 190, (index % Math.max(1, count - 1)) / Math.max(1, count - 1));
    if (lane === 'right') return Phaser.Math.Linear(350, 470, (index % Math.max(1, count - 1)) / Math.max(1, count - 1));
    if (lane === 'center') return Phaser.Math.Linear(225, 315, (index % Math.max(1, count - 1)) / Math.max(1, count - 1));
    if (lane === 'random') return Phaser.Math.Between(60, GAME_W - 60);
    return Phaser.Math.Linear(58, GAME_W - 58, (index % Math.max(1, count - 1)) / Math.max(1, count - 1));
  }

  private updateEnemies(dt: number): void {
    this.enemiesPool.forEachActive((enemy) => {
      enemy.age += dt;
      const wobble = Math.sin(enemy.age * 3.2 + enemy.x * 0.02);
      if (enemy.movement === 'sine') enemy.x += wobble * 95 * dt;
      if (enemy.movement === 'zigzag') enemy.x += Math.sign(Math.sin(enemy.age * 5.5)) * 130 * dt;
      if (enemy.movement === 'dash') {
        enemy.x += Math.sin(enemy.age * 7) * 165 * dt;
        enemy.y += Math.sin(enemy.age * 10) * 90 * dt;
      }
      if (enemy.movement === 'hunter') enemy.x += Phaser.Math.Clamp(this.player.x - enemy.x, -1, 1) * 70 * dt;
      if (enemy.movement === 'float') {
        enemy.x += wobble * 70 * dt;
        enemy.y += Math.sin(enemy.age * 4) * 28 * dt;
      }
      if (enemy.movement === 'serpent') enemy.x += Math.sin(enemy.age * 6) * 155 * dt;
      if (enemy.movement === 'stalk') enemy.x += Phaser.Math.Clamp(this.player.x - enemy.x, -1, 1) * 58 * dt;
      if (enemy.movement === 'tank') {
        enemy.x += Math.sin(enemy.age * 2.6) * 48 * dt;
        enemy.rotation += dt * 0.5;
      }
      enemy.y += enemy.vy * dt;
      enemy.fireTimer -= dt;
      if (enemy.fireRate > 0 && enemy.fireTimer <= 0 && enemy.y > 20 && enemy.y < GAME_H - 120) {
        enemy.fireTimer = enemy.fireRate;
        this.fireEnemyPattern(enemy.x, enemy.y, enemy.projectile);
      }
      if (enemy.y > GAME_H + 80 || enemy.x < -100 || enemy.x > GAME_W + 100) this.enemiesPool.release(enemy);
    });
  }

  private spawnBoss(bossId: BossId): void {
    this.clearSupportBosses();
    const def = this.bosses.get(bossId);
    if (!def) return;
    const actor = this.createBossActor(bossId, GAME_W / 2, -120, 1, false, this.loopLevel);
    this.boss = actor;
    this.activeBossEventId = bossId;
    this.pendingSpawns.length = 0;
    if (this.loopLevel > 1) this.spawnLoopBossEscorts(bossId);
    reggaeMidi.setMode('boss');
    this.showBanner(this.loopLevel > 1 ? `${def.name} x${this.loopLevel}` : def.name);
  }

  private updateBoss(dt: number): void {
    if (!this.boss) return;
    this.updateOneBoss(this.boss, dt, 0, 150);
    this.supportBosses.forEach((boss, index) => this.updateOneBoss(boss, dt, index + 1, boss.isSupport ? 108 + index * 34 : 150));
  }

  private createBossActor(bossId: BossId, x: number, y: number, scale: number, isSupport: boolean, loopMultiplier: number): BossActor {
    const def = this.bosses.get(bossId);
    if (!def) throw new Error(`Missing boss definition: ${bossId}`);
    const actor = this.add.image(x, y, def.texture).setDepth(isSupport ? 11 : 12).setScale(scale) as BossActor;
    actor.bossId = bossId;
    actor.hp = Math.round(def.hp * loopMultiplier * (isSupport ? scale * 0.75 : 1));
    actor.maxHp = actor.hp;
    actor.radius = def.radius * scale;
    actor.score = Math.round(def.score * (isSupport ? 0.35 : 1));
    actor.fireTimer = 1.5;
    actor.phaseIndex = 0;
    actor.superTimer = Phaser.Math.FloatBetween(5.5, 8.5);
    actor.chargeTimer = 0;
    actor.charging = false;
    actor.superKind = 'none';
    actor.isSupport = isSupport;
    actor.manualFireCooldown = 0;
    actor.warning = this.add.graphics().setDepth(9);
    return actor;
  }

  private spawnLoopBossEscorts(primaryBossId: BossId): void {
    const ids = Array.from(this.bosses.keys());
    const primaryIndex = Math.max(0, ids.indexOf(primaryBossId));
    const partnerId = ids[(primaryIndex + this.loopLevel) % ids.length];
    const baby = this.createBossActor(primaryBossId, GAME_W * 0.28, -190, 0.38, true, Math.max(1, this.loopLevel - 0.55));
    baby.superTimer = 999;
    if (this.loopLevel === 2) {
      this.supportBosses.push(baby);
      return;
    }

    const partner = this.createBossActor(partnerId, GAME_W * 0.72, -170, 0.72, true, Math.max(1, this.loopLevel - 0.35));
    partner.superTimer += 2;
    this.supportBosses.push(partner, baby);
  }

  private handleBossPointer(pointer: Phaser.Input.Pointer, clicked: boolean): void {
    if (this.gameOver || this.won || this.pausedByPlayer || !this.hasActiveBoss()) return;

    const x = Phaser.Math.Clamp(pointer.worldX, 58, GAME_W - 58);
    const y = Phaser.Math.Clamp(pointer.worldY, 72, GAME_H - 300);
    this.bossMouseX = x;
    this.bossMouseY = y;
    this.bossMouseControlUntil = this.visualTime + 2;
    this.bossMouseTarget = this.pickBossForPointer(x, y);

    if (clicked) this.fireBossMouseCommand(pointer);
  }

  private pickBossForPointer(x: number, y: number): BossActor | null {
    let best: BossActor | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    this.forEachActiveBoss((boss) => {
      const distance = Phaser.Math.Distance.Between(x, y, boss.x, boss.y);
      if (distance < bestDistance) {
        best = boss;
        bestDistance = distance;
      }
    });
    return best;
  }

  private bossIsMouseControlled(boss: BossActor): boolean {
    return this.bossMouseTarget === boss && boss.active && this.visualTime <= this.bossMouseControlUntil;
  }

  private fireBossMouseCommand(pointer: Phaser.Input.Pointer): void {
    const boss = this.bossMouseTarget;
    if (!boss?.active || boss.y <= 20 || boss.manualFireCooldown > 0) return;

    const event = pointer.event as MouseEvent | undefined;
    if (event?.button === 2 && !boss.charging) {
      this.startBossSuperCharge(boss);
      boss.manualFireCooldown = boss.isSupport ? 1.1 : 0.9;
      return;
    }

    const def = this.bosses.get(boss.bossId);
    const phase = def?.phases[boss.phaseIndex];
    if (!phase) return;
    this.fireBossPattern(boss.x, boss.y, phase.pattern);
    boss.manualFireCooldown = boss.isSupport ? 0.36 : 0.26;
  }

  private updateOneBoss(boss: BossActor, dt: number, index: number, targetY: number): void {
    const def = this.bosses.get(boss.bossId);
    if (!def) return;
    const baseX = boss === this.boss ? GAME_W / 2 : (index % 2 === 0 ? GAME_W * 0.72 : GAME_W * 0.28);
    const hpPct = boss.hp / boss.maxHp;
    let nextPhase = 0;
    for (let i = 0; i < def.phases.length; i += 1) {
      if (hpPct <= def.phases[i].atHealthPct) nextPhase = i;
    }
    boss.phaseIndex = nextPhase;
    const phase = def.phases[boss.phaseIndex];
    boss.manualFireCooldown = Math.max(0, boss.manualFireCooldown - dt);
    if (this.bossIsMouseControlled(boss)) {
      const oldX = boss.x;
      const oldY = boss.y;
      boss.x += (this.bossMouseX - boss.x) * Math.min(1, dt * 8.5);
      boss.y += (this.bossMouseY - boss.y) * Math.min(1, dt * 8.5);
      boss.rotation = Phaser.Math.Clamp((boss.x - oldX) * 0.018 + (boss.y - oldY) * 0.004, -0.18, 0.18);
    } else {
      boss.y += (targetY - boss.y) * Math.min(1, dt * 1.8);
      boss.x = baseX + Math.sin(this.visualTime * phase.speed * 0.018 + index * 1.7) * (boss.isSupport ? 72 : 112);
      boss.rotation = Math.sin(this.visualTime * 2 + index) * 0.04;
    }

    if (boss.charging) {
      boss.chargeTimer -= dt;
      this.drawBossChargeWarning(boss);
      if (boss.chargeTimer <= 0) {
        boss.charging = false;
        boss.warning.clear();
        this.fireBossSuper(boss);
        boss.superTimer = Phaser.Math.FloatBetween(7.5, 11.5) / Math.min(1.65, this.loopLevel * 0.28 + 1);
      }
      return;
    }

    boss.superTimer -= dt;
    if (!boss.isSupport || boss.scaleX > 0.5) {
      if (boss.superTimer <= 0 && boss.y > 20) {
        this.startBossSuperCharge(boss);
        return;
      }
    }

    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0 && boss.y > 30) {
      boss.fireTimer = Math.max(0.16, phase.fireRate / Math.min(1.75, 1 + (this.loopLevel - 1) * 0.22));
      this.fireBossPattern(boss.x, boss.y, phase.pattern);
    }
  }

  private startBossSuperCharge(boss: BossActor): void {
    const supers = ['tidalLaser', 'mineBloom', 'homingSquall'];
    boss.superKind = supers[Phaser.Math.Between(0, supers.length - 1)];
    boss.charging = true;
    boss.chargeTimer = boss.isSupport ? 1.25 : 1.75;
    boss.fireTimer += boss.chargeTimer;
    boss.setTint(0xffffff);
    this.showBanner('Boss super charging!');
  }

  private drawBossChargeWarning(boss: BossActor): void {
    const pulse = 0.45 + Math.sin(this.visualTime * 18) * 0.25;
    boss.warning.clear();
    boss.warning.lineStyle(4, 0xfff176, pulse);
    boss.warning.strokeCircle(boss.x, boss.y, boss.radius + 18 + Math.sin(this.visualTime * 20) * 8);
    boss.warning.lineStyle(2, 0xff4d8d, 0.55);
    if (boss.superKind === 'tidalLaser') {
      boss.warning.fillStyle(0xff4d8d, 0.14 + pulse * 0.1);
      boss.warning.fillRect(boss.x - 46, boss.y + 18, 92, GAME_H);
      boss.warning.strokeRect(boss.x - 46, boss.y + 18, 92, GAME_H);
    } else if (boss.superKind === 'mineBloom') {
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2 + this.visualTime;
        boss.warning.lineBetween(boss.x, boss.y, boss.x + Math.cos(angle) * 175, boss.y + Math.sin(angle) * 175);
      }
    } else {
      boss.warning.lineStyle(3, 0xfff176, 0.45);
      boss.warning.lineBetween(boss.x, boss.y, this.player.x, this.player.y);
    }
  }

  private fireBossSuper(boss: BossActor): void {
    boss.clearTint();
    this.cameras.main.flash(120, 255, 241, 118);
    if (boss.superKind === 'tidalLaser') {
      for (let lane = -2; lane <= 2; lane += 1) {
        const vx = lane * 38;
        this.fireEnemyBullet(boss.x + lane * 18, boss.y + 44, vx, 330, 'boss-shot', 1.35);
      }
      for (let i = -5; i <= 5; i += 1) this.fireEnemyBullet(boss.x + i * 18, boss.y + 26, i * 28, 250, 'boss-shot', 0.9);
      return;
    }
    if (boss.superKind === 'mineBloom') {
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2 + this.bossAngle;
        this.fireEnemyBullet(boss.x, boss.y, Math.cos(angle) * 105, Math.sin(angle) * 105, 'boss-shot', 1.05, {
          kind: 'cluster',
          splitAt: 0.9,
          splitCount: 7,
          splitSpeed: 145 + this.loopLevel * 12
        });
      }
      return;
    }
    for (let i = -3; i <= 3; i += 1) {
      this.fireEnemyBullet(boss.x + i * 28, boss.y + 36, i * 22, 170 + Math.abs(i) * 10, 'boss-shot', 1, {
        kind: 'homing',
        turnRate: 1.2 + this.loopLevel * 0.12
      });
    }
  }

  private updateBullets(dt: number): void {
    this.playerBullets.forEachActive((bullet) => {
      bullet.age += dt;
      if (bullet.kind === 'wobble') bullet.x = bullet.wobbleStartX + Math.sin(bullet.age * bullet.wobbleFreq) * bullet.wobbleAmp;
      else bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.y < -40 || bullet.x < -40 || bullet.x > GAME_W + 40 || bullet.age > 3) this.playerBullets.release(bullet);
    });
    this.enemyBullets.forEachActive((bullet) => {
      bullet.age += dt;
      if (bullet.kind === 'homing') {
        const current = Math.atan2(bullet.vy, bullet.vx);
        const target = Phaser.Math.Angle.Between(bullet.x, bullet.y, this.player.x, this.player.y);
        const next = Phaser.Math.Angle.RotateTo(current, target, bullet.turnRate * dt);
        const speed = Math.hypot(bullet.vx, bullet.vy);
        bullet.vx = Math.cos(next) * speed;
        bullet.vy = Math.sin(next) * speed;
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.rotation += dt * 2;
      if (bullet.kind === 'cluster' && bullet.splitAt > 0 && bullet.age >= bullet.splitAt) {
        const x = bullet.x;
        const y = bullet.y;
        const count = bullet.splitCount;
        const speed = bullet.splitSpeed;
        this.enemyBullets.release(bullet);
        for (let i = 0; i < count; i += 1) this.fireAtAngle(x, y, (i / count) * Math.PI * 2 + this.bossAngle, speed, 'enemy-shot');
        return;
      }
      if (bullet.y > GAME_H + 60 || bullet.y < -70 || bullet.x < -70 || bullet.x > GAME_W + 70 || bullet.age > 7) {
        this.enemyBullets.release(bullet);
      }
    });
  }

  private updatePickups(dt: number): void {
    this.pickupsPool.forEachActive((pickup) => {
      if (this.stacks.magnet > 0) {
        const angle = Phaser.Math.Angle.Between(pickup.x, pickup.y, this.player.x, this.player.y);
        pickup.vx += Math.cos(angle) * 520 * dt;
        pickup.vy += Math.sin(angle) * 520 * dt;
      }
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
      pickup.rotation += dt * 1.4;
      if (pickup.y > GAME_H + 50) this.pickupsPool.release(pickup);
    });
  }

  private fireEnemyPattern(x: number, y: number, pattern: string): void {
    if (pattern === 'none') return;
    if (pattern === 'aimed') return this.fireEnemyAimed(x, y, 170);
    if (pattern === 'spray') {
      for (let i = -1; i <= 1; i += 1) this.fireEnemyBullet(x, y, i * 70, 190);
      return;
    }
    if (pattern === 'burst' || pattern === 'radial') {
      for (let i = 0; i < 8; i += 1) this.fireAtAngle(x, y, (i / 8) * Math.PI * 2, 130);
      return;
    }
    if (pattern === 'lace') {
      for (let i = -2; i <= 2; i += 1) this.fireEnemyBullet(x, y, i * 45, 150 + Math.abs(i) * 20);
      return;
    }
    if (pattern === 'arc' || pattern === 'cross') {
      for (let i = 0; i < 4; i += 1) this.fireAtAngle(x, y, Math.PI / 4 + (i * Math.PI) / 2, 150);
      return;
    }
    if (pattern === 'spiral') {
      this.bossAngle += 0.35;
      for (let i = 0; i < 4; i += 1) this.fireAtAngle(x, y, this.bossAngle + (i * Math.PI) / 2, 160);
    }
  }

  private fireBossPattern(x: number, y: number, pattern: string): void {
    const dense = this.boss?.bossId === 'abyssMermaid';
    const count = dense ? 18 : 12;
    this.bossAngle += 0.22;
    if (pattern.includes('Fan') || pattern.includes('Teeth') || pattern === 'crystalTears') {
      for (let i = -5; i <= 5; i += 1) this.fireEnemyBullet(x, y + 30, i * 42, 180 + Math.abs(i) * 12, 'boss-shot', 1.15);
      return;
    }
    if (pattern.includes('Spiral') || pattern.includes('Wheel') || pattern === 'royalBloom') {
      for (let i = 0; i < count; i += 1) this.fireAtAngle(x, y, this.bossAngle + (i / count) * Math.PI * 2, 145 + (i % 3) * 20, 'boss-shot');
      if (pattern === 'inkSpiral') {
        for (let i = 0; i < 3; i += 1) {
          const angle = this.bossAngle + (i / 3) * Math.PI * 2;
          this.fireEnemyBullet(x, y + 22, Math.cos(angle) * 105, Math.sin(angle) * 105, 'boss-shot', 1, {
            kind: 'cluster',
            splitAt: 1.15,
            splitCount: 6,
            splitSpeed: 125
          });
        }
      }
      return;
    }
    if (pattern.includes('Lattice') || pattern.includes('Weave') || pattern === 'finalTide') {
      for (let i = 0; i < 16; i += 1) {
        const angle = this.bossAngle * (i % 2 === 0 ? 1 : -1) + (i / 16) * Math.PI * 2;
        this.fireAtAngle(x, y, angle, 165, 'boss-shot');
      }
      this.fireEnemyAimed(x, y + 24, 225, 'boss-shot');
      if (pattern === 'finalTide' || pattern === 'darkLures') {
        for (let i = -1; i <= 1; i += 1) {
          this.fireEnemyBullet(x + i * 42, y + 34, i * 34, 155, 'boss-shot', 0.95, { kind: 'homing', turnRate: 1.15 });
        }
      }
      return;
    }
    if (pattern.includes('Rain') || pattern.includes('Lures') || pattern === 'pleaStorm') {
      const count = pattern === 'tentacleRain' ? 6 : 10;
      const laneGap = Phaser.Math.Between(1, 4);
      for (let i = 0; i < count; i += 1) {
        const lane = (i + laneGap) % 7;
        if (pattern === 'tentacleRain' && lane === 3) continue;
        const bx = pattern === 'tentacleRain' ? 55 + lane * 72 : Phaser.Math.Between(40, GAME_W - 40);
        this.fireEnemyBullet(bx, y, Phaser.Math.Between(-24, 24), pattern === 'tentacleRain' ? 145 : 170, 'boss-shot');
      }
      if (pattern.includes('Lures')) {
        for (let i = -1; i <= 1; i += 1) this.fireEnemyBullet(x + i * 44, y + 36, i * 28, 150, 'boss-shot', 0.9, { kind: 'homing', turnRate: 1.05 });
      }
      return;
    }
    for (let i = 0; i < count; i += 1) this.fireAtAngle(x, y, this.bossAngle + (i / count) * Math.PI * 2, 150, 'boss-shot');
  }

  private fireEnemyAimed(x: number, y: number, speed: number, texture = 'enemy-shot'): void {
    const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y);
    this.fireAtAngle(x, y, angle, speed, texture);
  }

  private fireAtAngle(x: number, y: number, angle: number, speed: number, texture = 'enemy-shot'): void {
    this.fireEnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, texture);
  }

  private fireEnemyBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    texture = 'enemy-shot',
    scale = 1,
    options: Partial<Pick<Bullet, 'kind' | 'turnRate' | 'splitAt' | 'splitCount' | 'splitSpeed'>> = {}
  ): void {
    const bullet = this.enemyBullets.acquire();
    if (!bullet) return;
    const difficulty = Math.min(1.45, this.difficultyScale());
    bullet
      .setTexture(texture)
      .setPosition(x, y)
      .setDepth(texture === 'boss-shot' ? 56 : 54)
      .setScale(scale)
      .setVisible(true)
      .setAlpha(1)
      .setRotation(0)
      .setOrigin(0.5)
      .clearTint();
    bullet.vx = vx * difficulty;
    bullet.vy = vy * difficulty;
    bullet.radius = texture === 'boss-shot' ? 10 * scale : 8 * scale;
    bullet.damage = 1;
    bullet.pierce = 0;
    bullet.age = 0;
    bullet.kind = options.kind ?? 'normal';
    bullet.wobbleStartX = x;
    bullet.wobbleAmp = 0;
    bullet.wobbleFreq = 0;
    bullet.turnRate = options.turnRate ?? 0;
    bullet.splitAt = options.splitAt ?? -1;
    bullet.splitCount = options.splitCount ?? 0;
    bullet.splitSpeed = options.splitSpeed ?? 0;
  }

  private updateCollisions(): void {
    this.playerBullets.forEachActive((bullet) => {
      this.enemiesPool.forEachActive((enemy) => {
        if (!bullet.active) return;
        if (Phaser.Math.Distance.Between(bullet.x, bullet.y, enemy.x, enemy.y) < bullet.radius + enemy.radius) {
          if (enemy.shieldHp > 0) {
            this.hitEnemyShield(enemy);
          } else {
            enemy.hp -= bullet.damage;
            this.flash(enemy);
          }
          if (bullet.pierce > 0) bullet.pierce -= 1;
          else this.playerBullets.release(bullet);
          if (enemy.hp <= 0) this.killEnemy(enemy);
        }
      });
      if (this.boss?.active && bullet.active) {
        this.forEachActiveBoss((boss) => {
          if (!bullet.active) return;
          if (Phaser.Math.Distance.Between(bullet.x, bullet.y, boss.x, boss.y) < bullet.radius + boss.radius) {
            boss.hp -= bullet.damage;
            this.flash(boss);
            if (bullet.pierce > 0) bullet.pierce -= 1;
            else this.playerBullets.release(bullet);
            if (boss.hp <= 0) this.killBossActor(boss);
          }
        });
      }
    });

    this.enemyBullets.forEachActive((bullet) => {
      if (Phaser.Math.Distance.Between(bullet.x, bullet.y, this.player.x, this.player.y) < bullet.radius + 20) {
        this.enemyBullets.release(bullet);
        this.hitPlayer();
      }
    });

    this.enemiesPool.forEachActive((enemy) => {
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y) < enemy.radius + 22) {
        this.killEnemy(enemy, false);
        this.hitPlayer();
      }
    });

    this.pickupsPool.forEachActive((pickup) => {
      if (Phaser.Math.Distance.Between(pickup.x, pickup.y, this.player.x, this.player.y) < pickup.radius + 28) {
        this.pickupsPool.release(pickup);
        this.applyPowerup(pickup.powerupId);
      }
    });
  }

  private killEnemy(enemy: EnemyActor, reward = true): void {
    if (reward) {
      this.score += enemy.score;
      this.tryDrop(enemy.x, enemy.y, enemy.dropTable);
      this.checkScoreLife();
    }
    this.spawnBurst(enemy.x, enemy.y, 0x9bf6ff);
    this.enemiesPool.release(enemy);
  }

  private hitEnemyShield(enemy: EnemyActor): void {
    enemy.shieldHp = Math.max(0, enemy.shieldHp - 1);
    enemy.setTintFill(0x9bf6ff);
    this.time.delayedCall(38, () => {
      if (enemy.active) this.applyEnemyShieldLook(enemy);
    });
    if (enemy.shieldHp <= 0) this.spawnBurst(enemy.x, enemy.y, 0x9bf6ff, 4);
  }

  private killBoss(): void {
    if (!this.boss) return;
    const completedBossId = this.activeBossEventId ?? this.boss.bossId;
    const defeated = this.boss;
    if (this.bossMouseTarget === defeated) this.bossMouseTarget = null;
    this.score += defeated.score;
    this.checkScoreLife();
    this.spawnBurst(defeated.x, defeated.y, 0xffd166, 22);
    defeated.warning.destroy();
    defeated.destroy();
    this.boss = null;
    this.enemyBullets.forEachActive((bullet) => this.enemyBullets.release(bullet));

    if (this.supportBosses.length > 0) {
      const promoted = this.supportBosses.shift()!;
      const wasBaby = promoted.scaleX < 0.55;
      promoted.isSupport = false;
      promoted.setDepth(12).setScale(wasBaby ? promoted.scaleX : Math.max(0.72, promoted.scaleX));
      promoted.superTimer = Math.min(promoted.superTimer, 4);
      this.boss = promoted;
      this.showBanner(wasBaby ? 'Baby boss takes point!' : 'Partner boss takes point!');
      return;
    }

    this.activeBossEventId = null;
    reggaeMidi.setMode('game');

    if (completedBossId === 'mermaidRescue') {
      this.showBanner('Rescued... or awakened?');
      this.time.delayedCall(2200, () => {
        if (this.gameOver || this.won || this.boss || this.activeBossEventId) return;
        this.spawnBoss('abyssMermaid');
      });
      return;
    }
    if (completedBossId === 'abyssMermaid') {
      this.advanceCampaignLoop();
      return;
    }
    this.dropPickup(GAME_W / 2, 190, 'life');
    this.dropPickup(GAME_W / 2 - 42, 210, 'bomb');
    this.dropPickup(GAME_W / 2 + 42, 210, 'helper');
  }

  private tryDrop(x: number, y: number, table: EnemyDef['dropTable']): void {
    for (const drop of table) {
      if (Math.random() < drop.chance) {
        this.dropPickup(x, y, drop.id);
        return;
      }
    }
    if (this.currentBiome.id !== 'shallows' && Math.random() < 0.018) this.dropPickup(x, y, 'shark');
  }

  private dropPickup(x: number, y: number, id: PowerupId): void {
    const pickup = this.pickupsPool.acquire();
    if (!pickup) return;
    pickup
      .setPosition(x, y)
      .setTexture(this.powerTexture(id))
      .clearTint()
      .setVisible(true)
      .setScale(id === 'life' ? 1.15 : 1);
    pickup.powerupId = id;
    pickup.vx = Phaser.Math.Between(-25, 25);
    pickup.vy = 96;
    pickup.radius = 20;
  }

  private applyPowerup(id: PowerupId): void {
    const def = this.powerups.get(id);
    if (id === 'life') {
      this.lives += 1;
      this.showBanner('+1 life');
      return;
    }
    if (id === 'shark') {
      this.sharkTimer = 5;
      this.stacks.shark = 1;
      this.showBanner('Reef ally!');
      return;
    }
    if (id === 'bomb') {
      this.stacks.bomb = Phaser.Math.Clamp(this.stacks.bomb + 1, 0, def?.stackLimit ?? 3);
      this.showBanner('Bomb stocked');
      return;
    }
    const limit = def?.stackLimit ?? 1;
    this.stacks[id] = Phaser.Math.Clamp(this.stacks[id] + 1, 0, limit);
    if (def?.duration) this.timed[id] = def.duration;
    else delete this.timed[id];
    this.showBanner(def?.name ?? id);
  }

  private useBomb(): void {
    if (this.stacks.bomb <= 0 || this.bombTimer > 0 || this.gameOver) return;
    this.stacks.bomb -= 1;
    this.bombTimer = 0.8;
    this.enemyBullets.forEachActive((bullet) => this.enemyBullets.release(bullet));
    this.enemiesPool.forEachActive((enemy) => {
      if (enemy.shieldHp > 0) {
        enemy.shieldHp = 0;
        this.applyEnemyShieldLook(enemy);
      }
      enemy.hp -= 8;
      if (enemy.hp <= 0) this.killEnemy(enemy);
    });
    for (const boss of this.activeBosses()) {
      boss.hp -= 45;
      this.flash(boss);
      if (boss.hp <= 0) this.killBossActor(boss);
    }
    this.cameras.main.flash(180, 148, 246, 255);
  }

  private hitPlayer(): void {
    if (this.invuln > 0 || this.gameOver || this.won) return;
    if (this.stacks.shield > 0) {
      this.stacks.shield = 0;
      this.timed.shield = 0;
      this.invuln = 1;
      this.spawnBurst(this.player.x, this.player.y, 0x9bf6ff, 10);
      return;
    }
    this.lives -= 1;
    this.halveFirepower();
    this.invuln = 2.2;
    this.spawnBurst(this.player.x, this.player.y, 0xff4d8d, 14);
    this.player.setPosition(GAME_W / 2, PLAYER_Y);
    this.touchActive = false;
    this.touchPointerId = -1;
    this.touchTargetX = this.player.x;
    this.touchTargetY = this.player.y;
    this.playerBullets.forEachActive((bullet) => this.playerBullets.release(bullet));
    this.enemyBullets.forEachActive((bullet) => this.enemyBullets.release(bullet));
    if (this.lives <= 0) this.showGameOver();
  }

  private showGameOver(): void {
    this.gameOver = true;
    this.touchActive = false;
    this.touchPointerId = -1;
    this.boss?.warning.destroy();
    this.boss?.destroy();
    this.boss = null;
    this.clearSupportBosses();
    this.activeBossEventId = null;
    this.enemiesPool.forEachActive((enemy) => this.enemiesPool.release(enemy));
    this.playerBullets.forEachActive((bullet) => this.playerBullets.release(bullet));
    this.enemyBullets.forEachActive((bullet) => this.enemyBullets.release(bullet));
    this.pickupsPool.forEachActive((pickup) => this.pickupsPool.release(pickup));
    saveCheckpoint({
      stageId: this.stage.id,
      checkpointId: this.currentCheckpoint.id,
      checkpointTime: this.currentCheckpoint.at,
      score: Math.max(0, this.score - 1500),
      lives: 4,
      unlockedPowerups: this.activePowerupIds(),
      powerupStacks: this.currentPowerupStacks(),
      timedPowerups: this.currentTimedPowerups(),
      loopLevel: this.loopLevel,
      difficulty: 'reef'
    });
    this.pauseText.setText(this.mobileControls ? 'CURRENT BROKEN' : 'CURRENT BROKEN\nENTER  Continue from checkpoint\nSPACE  Main menu');
    this.keys.ENTER.once('down', () => this.continueFromGameOver());
    this.keys.SPACE.once('down', () => this.returnToMenuFromGameOver());
    this.createGameOverButton(GAME_W / 2, GAME_H / 2 + 76, 'Continue', () => this.continueFromGameOver());
    this.createGameOverButton(GAME_W / 2, GAME_H / 2 + 144, 'Main Menu', () => this.returnToMenuFromGameOver());
  }

  private createGameOverButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, 250, 54, 0x09314d, 0.86).setStrokeStyle(3, 0x9bf6ff, 0.9).setDepth(205);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: '21px',
        color: '#f8fdff',
        stroke: '#03192d',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(206);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    text.setInteractive({ useHandCursor: true });
    text.on('pointerdown', onClick);
    this.gameOverButtons.push(bg, text);
  }

  private continueFromGameOver(): void {
    if (!this.gameOver) return;
    this.scene.restart({ continueFromSave: true });
  }

  private returnToMenuFromGameOver(): void {
    if (!this.gameOver) return;
    this.scene.stop('HudScene');
    this.scene.start('MenuScene');
  }

  private winGame(): void {
    this.won = true;
    clearSave();
    reggaeMidi.setMode('ending');
    this.scene.stop('HudScene');
    this.scene.start('EndingScene', { score: this.score });
  }

  private killBossActor(actor: BossActor): void {
    if (actor === this.boss) {
      this.killBoss();
      return;
    }
    if (this.bossMouseTarget === actor) this.bossMouseTarget = null;
    this.score += Math.round(actor.score * 0.55);
    this.spawnBurst(actor.x, actor.y, 0xffd166, 14);
    actor.warning.destroy();
    actor.destroy();
    this.supportBosses = this.supportBosses.filter((boss) => boss !== actor);
    this.checkScoreLife();
  }

  private activeBosses(): BossActor[] {
    return [this.boss, ...this.supportBosses].filter((boss): boss is BossActor => Boolean(boss?.active));
  }

  private forEachActiveBoss(callback: (boss: BossActor) => void): void {
    if (this.boss?.active) callback(this.boss);
    for (const boss of this.supportBosses) {
      if (boss.active) callback(boss);
    }
  }

  private hasActiveBoss(): boolean {
    if (this.boss?.active) return true;
    return this.supportBosses.some((boss) => boss.active);
  }

  private clearSupportBosses(): void {
    for (const boss of this.supportBosses) {
      boss.warning.destroy();
      boss.destroy();
    }
    this.supportBosses = [];
    if (this.bossMouseTarget?.isSupport) this.bossMouseTarget = null;
  }

  private advanceCampaignLoop(): void {
    this.loopLevel += 1;
    this.showBanner(`Current loop ${this.loopLevel}`);
    this.elapsed = 0;
    this.nextWaveIndex = 0;
    this.nextBossIndex = 0;
    this.pendingSpawns.length = 0;
    this.activeBossEventId = null;
    this.clearSupportBosses();
    this.enemiesPool.forEachActive((enemy) => this.enemiesPool.release(enemy));
    this.playerBullets.forEachActive((bullet) => this.playerBullets.release(bullet));
    this.enemyBullets.forEachActive((bullet) => this.enemyBullets.release(bullet));
    this.pickupsPool.forEachActive((pickup) => this.pickupsPool.release(pickup));
    this.boss = null;
    this.lives += 1;
    this.restoreProgressIndexes();
    this.transitionBackground(this.backgroundKey(this.currentBiome.id));
    reggaeMidi.setMode('game');
    saveCheckpoint({
      stageId: this.stage.id,
      checkpointId: this.currentCheckpoint.id,
      checkpointTime: 0,
      score: this.score,
      lives: this.lives,
      unlockedPowerups: this.activePowerupIds(),
      powerupStacks: this.currentPowerupStacks(),
      timedPowerups: this.currentTimedPowerups(),
      loopLevel: this.loopLevel,
      difficulty: 'reef'
    });
  }

  private difficultyScale(): number {
    return 1 + (this.loopLevel - 1) * 0.35;
  }

  private checkScoreLife(): void {
    if (this.score >= this.nextLifeScore) {
      this.lives += 1;
      this.nextLifeScore += 20000;
      this.showBanner('Extra life');
    }
  }

  private halveFirepower(): void {
    const weapons: PowerupId[] = ['helper', 'pearl', 'spread', 'bubble'];
    let loss = Math.ceil(this.offensivePowerLevel() * 0.5);
    if (loss <= 0) return;
    for (const id of weapons) {
      while (loss > 0 && this.stacks[id] > 0) {
        this.stacks[id] -= 1;
        loss -= 1;
      }
      if (this.stacks[id] === 0) delete this.timed[id];
    }
    this.showBanner('Weapons halved');
  }

  private offensivePowerLevel(): number {
    return this.stacks.helper + this.stacks.pearl + this.stacks.spread + this.stacks.bubble;
  }

  private flash(target: Phaser.GameObjects.Image): void {
    const flashable = target as FlashableImage;
    const now = this.time.now;
    if (flashable.lastHitFlashAt !== undefined && now - flashable.lastHitFlashAt < 55) return;
    flashable.lastHitFlashAt = now;
    flashable.flashClearEvent?.remove(false);
    if ((target as Partial<BossActor>).bossId) target.setTint(0xfff1a8);
    else target.setTintFill(0xffffff);
    flashable.flashClearEvent = this.time.delayedCall(20, () => {
      if (target.active) target.clearTint();
      flashable.flashClearEvent = undefined;
    });
  }

  private spawnBurst(x: number, y: number, color: number, count = 8): void {
    for (let i = 0; i < count; i += 1) {
      const dot = this.add.circle(x, y, Phaser.Math.Between(2, 5), color, 0.85).setDepth(40);
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(24, 90);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 260,
        onComplete: () => dot.destroy()
      });
    }
  }

  private showBanner(text: string): void {
    this.messageText.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.messageText);
    this.tweens.add({ targets: this.messageText, alpha: 0, duration: 900, delay: 900 });
  }

  private togglePause(): void {
    if (this.gameOver || this.won) return;
    this.pausedByPlayer = !this.pausedByPlayer;
    this.pauseText.setText(this.pausedByPlayer ? 'PAUSED\nP  Resume' : '');
  }

  private activePowerupIds(): PowerupId[] {
    return (Object.keys(this.stacks) as PowerupId[]).filter((id) => this.stacks[id] > 0);
  }

  private currentPowerupStacks(): Partial<Record<PowerupId, number>> {
    const saved: Partial<Record<PowerupId, number>> = {};
    for (const id of Object.keys(this.stacks) as PowerupId[]) {
      if (this.stacks[id] > 0) saved[id] = this.stacks[id];
    }
    return saved;
  }

  private currentTimedPowerups(): Partial<Record<PowerupId, number>> {
    const saved: Partial<Record<PowerupId, number>> = {};
    for (const id of Object.keys(this.timed) as PowerupId[]) {
      const remaining = this.timed[id] ?? 0;
      if (remaining > 0) saved[id] = remaining;
    }
    if (this.sharkTimer > 0) saved.shark = this.sharkTimer;
    return saved;
  }

  private updateHud(): void {
    let bossCount = 0;
    let bossHp = 0;
    let bossMaxHp = 0;
    this.forEachActiveBoss((boss) => {
      bossCount += 1;
      bossHp += Math.max(0, boss.hp);
      bossMaxHp += boss.maxHp;
    });
    const leadBossName = this.boss ? (this.bosses.get(this.boss.bossId)?.name ?? '') : '';
    const state: HudState = {
      score: this.score,
      lives: this.lives,
      biome: this.loopLevel > 1 ? `${this.currentBiome.name} L${this.loopLevel}` : this.currentBiome.name,
      checkpoint: this.currentCheckpoint.name,
      bossName: bossCount > 1 ? `${leadBossName} + ${bossCount - 1}` : leadBossName,
      bossHpPct: bossMaxHp > 0 ? bossHp / bossMaxHp : 0,
      powerups: this.powerSummary(),
      fps: this.game.loop.actualFps
    };
    this.game.events.emit('hud:update', state);
  }

  private powerSummary(): string {
    const parts: string[] = [];
    if (this.stacks.spread) parts.push(`Spread ${this.stacks.spread}`);
    if (this.stacks.pearl) parts.push(`Pearl ${this.stacks.pearl}`);
    if (this.stacks.bubble) parts.push(`Bubble ${this.stacks.bubble}`);
    if (this.stacks.helper) parts.push(`Pilot ${this.stacks.helper}`);
    if (this.stacks.shield) parts.push('Shield');
    if (this.stacks.magnet) parts.push('Magnet');
    if (this.stacks.shark) parts.push('Shark');
    parts.push(`Bomb ${this.stacks.bomb}`);
    return parts.join('  ');
  }

  private powerTint(id: PowerupId): number {
    const colors: Record<PowerupId, number> = {
      spread: 0xffafcc,
      pearl: 0xffffff,
      bubble: 0x9bf6ff,
      helper: 0xa7ff6b,
      shield: 0x90dbf4,
      magnet: 0xfde74c,
      bomb: 0xc77dff,
      speed: 0x80ffdb,
      life: 0xff4d6d,
      shark: 0x9bf6ff
    };
    return colors[id];
  }

  private powerTexture(id: PowerupId): string {
    const textures: Partial<Record<PowerupId, string>> = {
      pearl: 'power-pearl',
      bubble: 'power-bubble',
      shield: 'power-shield',
      magnet: 'power-magnet',
      bomb: 'power-bomb',
      life: 'power-life',
      shark: 'enemy-shark'
    };
    return textures[id] ?? 'pickup';
  }
}

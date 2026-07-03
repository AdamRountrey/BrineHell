export type PowerupId =
  | 'spread'
  | 'pearl'
  | 'bubble'
  | 'helper'
  | 'shield'
  | 'magnet'
  | 'bomb'
  | 'speed'
  | 'life'
  | 'shark';

export type EnemyId =
  | 'smallFish'
  | 'crab'
  | 'shrimp'
  | 'clam'
  | 'urchin'
  | 'shark'
  | 'jellyfish'
  | 'eel'
  | 'angler'
  | 'shell';

export type BossId =
  | 'turtle'
  | 'octopus'
  | 'eelQueen'
  | 'leviathan'
  | 'anglerKing'
  | 'mermaidRescue'
  | 'abyssMermaid';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  score: number;
  movement: string;
  projectile: string;
  fireRate: number;
  dropTable: Array<{ id: PowerupId; chance: number }>;
}

export interface BossPhaseDef {
  atHealthPct: number;
  pattern: string;
  fireRate: number;
  speed: number;
}

export interface BossDef {
  id: BossId;
  name: string;
  hp: number;
  radius: number;
  score: number;
  texture: string;
  phases: BossPhaseDef[];
}

export interface WaveDef {
  at: number;
  enemy: EnemyId;
  count: number;
  interval: number;
  lane: 'left' | 'center' | 'right' | 'spread' | 'random';
  pattern?: string;
}

export interface BossEventDef {
  at: number;
  boss: BossId;
  checkpoint: string;
}

export interface BiomeEventDef {
  at: number;
  id: string;
  name: string;
  tint: number;
}

export interface CheckpointDef {
  at: number;
  id: string;
  name: string;
}

export interface StageDef {
  id: string;
  name: string;
  duration: number;
  waves: WaveDef[];
  bosses: BossEventDef[];
  biomes: BiomeEventDef[];
  checkpoints: CheckpointDef[];
}

export interface PowerupDef {
  id: PowerupId;
  name: string;
  duration: number;
  stackLimit: number;
  rarity: number;
  description: string;
}

export interface HudState {
  score: number;
  lives: number;
  biome: string;
  checkpoint: string;
  bossName: string;
  bossHpPct: number;
  powerups: string;
  fps: number;
}

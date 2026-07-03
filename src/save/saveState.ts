import type { PowerupId } from '../types/game';

const SAVE_KEY = 'brine-hell-save-v1';

export interface SaveStateV1 {
  version: 1;
  stageId: string;
  checkpointId: string;
  checkpointTime: number;
  score: number;
  lives: number;
  unlockedPowerups: PowerupId[];
  powerupStacks?: Partial<Record<PowerupId, number>>;
  timedPowerups?: Partial<Record<PowerupId, number>>;
  loopLevel?: number;
  difficulty: 'reef';
  savedAt: number;
}

export function loadSave(): SaveStateV1 | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveStateV1;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCheckpoint(state: Omit<SaveStateV1, 'version' | 'savedAt'>): void {
  const payload: SaveStateV1 = {
    ...state,
    version: 1,
    savedAt: Date.now()
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

/**
 * SoundManager - ゲームの効果音を管理するクラス
 */

type SoundType =
  | 'attack'
  | 'eat'
  | 'spawn'
  | 'death'
  | 'backstab'
  | 'plant-disappear'
  | 'flee'
  | 'point';

class SoundManager {
  private static instance: SoundManager;
  private sounds: Map<SoundType, HTMLAudioElement>;
  private enabled: boolean;
  private volume: number;

  private constructor() {
    this.sounds = new Map();
    this.enabled = true;
    this.volume = 0.5;
    this.loadSounds();
  }

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private loadSounds() {
    const soundFiles: SoundType[] = [
      'attack',
      'eat',
      'spawn',
      'death',
      'backstab',
      'plant-disappear',
      'flee',
      'point',
    ];

    soundFiles.forEach((soundType) => {
      const audio = new Audio(`/sounds/${soundType}.wav`);
      audio.volume = this.volume;
      this.sounds.set(soundType, audio);
    });
  }

  play(soundType: SoundType, volumeMultiplier: number = 1.0) {
    if (!this.enabled) return;

    const sound = this.sounds.get(soundType);
    if (sound) {
      // クローンを作成して再生（同時に複数回再生可能にする）
      const clone = sound.cloneNode() as HTMLAudioElement;
      clone.volume = this.volume * volumeMultiplier;
      clone.play().catch((error) => {
        console.warn(`Failed to play sound: ${soundType}`, error);
      });
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.sounds.forEach((sound) => {
      sound.volume = this.volume;
    });
  }

  getVolume(): number {
    return this.volume;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export default SoundManager;

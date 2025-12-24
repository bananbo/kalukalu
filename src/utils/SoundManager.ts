/**
 * SoundManager - ゲームの効果音を管理するクラス
 */

type SoundType =
  | "attack"
  | "eat"
  | "spawn"
  | "death"
  | "backstab"
  | "plant-disappear"
  | "flee"
  | "point";

class SoundManager {
  private static instance: SoundManager;
  private sounds: Map<SoundType, HTMLAudioElement>;
  private enabled: boolean;
  private volume: number;
  private bgm: HTMLAudioElement | null;
  private bgmEnabled: boolean;
  private bgmVolume: number;
  private hasUserInteracted: boolean;

  private constructor() {
    this.sounds = new Map();
    this.enabled = true;
    this.volume = 0.5;
    this.bgm = null;
    this.bgmEnabled = true;
    this.bgmVolume = 0.3;
    this.hasUserInteracted = false;
    this.loadSounds();
    this.loadBGM();
    // ユーザーの最初のインタラクションを待つ
    this.setupUserInteractionListener();
  }

  private setupUserInteractionListener() {
    const enableAudio = () => {
      this.hasUserInteracted = true;
      // BGMが有効なら再生を開始
      if (this.bgmEnabled && this.bgm) {
        this.playBGM();
      }
      // 一度だけ実行
      document.removeEventListener("click", enableAudio);
      document.removeEventListener("keydown", enableAudio);
      document.removeEventListener("touchstart", enableAudio);
    };

    document.addEventListener("click", enableAudio);
    document.addEventListener("keydown", enableAudio);
    document.addEventListener("touchstart", enableAudio);
  }

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private loadSounds() {
    const soundFiles: SoundType[] = [
      "attack",
      "eat",
      "spawn",
      "death",
      "backstab",
      "plant-disappear",
      "flee",
      "point",
    ];

    soundFiles.forEach((soundType) => {
      const audio = new Audio(`/sounds/${soundType}.wav`);
      audio.volume = this.volume;
      this.sounds.set(soundType, audio);
    });
  }

  private loadBGM() {
    this.bgm = new Audio("/sounds/bgm.wav");
    this.bgm.loop = true;
    this.bgm.volume = this.bgmVolume;
  }

  play(soundType: SoundType, volumeMultiplier: number = 1.0) {
    if (!this.enabled || !this.hasUserInteracted) return;

    const sound = this.sounds.get(soundType);
    if (sound) {
      // クローンを作成して再生（同時に複数回再生可能にする）
      const clone = sound.cloneNode() as HTMLAudioElement;
      clone.volume = this.volume * volumeMultiplier;
      clone.play().catch(() => {
        // ユーザーインタラクション前のエラーは無視
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

  // BGM関連のメソッド
  playBGM() {
    if (!this.bgm || !this.hasUserInteracted) return;

    this.bgm.play().catch(() => {
      // ユーザーインタラクション前のエラーは無視
    });
  }

  pauseBGM() {
    if (!this.bgm) return;
    this.bgm.pause();
  }

  setBGMEnabled(enabled: boolean) {
    this.bgmEnabled = enabled;
    if (enabled) {
      this.playBGM();
    } else {
      this.pauseBGM();
    }
  }

  isBGMEnabled(): boolean {
    return this.bgmEnabled;
  }

  setBGMVolume(volume: number) {
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    if (this.bgm) {
      this.bgm.volume = this.bgmVolume;
    }
  }

  getBGMVolume(): number {
    return this.bgmVolume;
  }
}

export default SoundManager;

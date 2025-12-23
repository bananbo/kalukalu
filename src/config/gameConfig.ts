/**
 * ゲームの各種パラメータを一元管理する設定ファイル
 * ここでバランス調整やゲームルールを変更できます
 */

export const GameConfig = {
  // === 生物の基本設定 ===
  creatures: {
    // 初期生成数
    initialRedCount: 3,
    initialGreenCount: 9, // 初期種族データの数に合わせる

    // レッド族の上限
    maxRedCreatures: 3,

    // エネルギー関連
    initialEnergy: 100,
    maxEnergy: 100,
    energyDecayRate: 0.1, // 毎フレームの減少量

    // 植物ポイント関連
    plantPointsPerEat: 1, // 植物を食べた時に得られるポイント
    plantPointsForSplit: 10, // 分裂に必要なポイント

    // 生存ポイント関連
    survivalPointsInterval: 600, // 10秒 (60fps * 10)

    // 視野設定
    vision: {
      greenMinAngle: Math.PI * 0.5, // グリーン族の最小視野角
      greenMaxAngle: Math.PI * 2, // グリーン族の最大視野角
      greenMinRange: 30, // グリーン族の最小視野距離
      greenMaxRange: 150, // グリーン族の最大視野距離

      redMinAngle: Math.PI * 0.3, // レッド族の最小視野角
      redMaxAngle: Math.PI, // レッド族の最大視野角（180度）
      redMinRange: 100, // レッド族の最小視野距離
      redMaxRange: 300, // レッド族の最大視野距離
    },
  },

  // === 植物の設定 ===
  plants: {
    count: 50, // 植物の数
    minSize: 3, // 最小サイズ
    maxSize: 8, // 最大サイズ
    respawnDelay: 5000, // 再出現までの時間（ミリ秒）
  },

  // === 障害物の設定 ===
  obstacles: {
    count: 8, // 障害物の数
    minSize: 30, // 最小サイズ
    maxSize: 80, // 最大サイズ
  },

  // === レッド族の巣の設定 ===
  redNest: {
    x: 400, // X座標
    y: 300, // Y座標
    size: 60, // サイズ
  },

  // === 戦闘システム ===
  combat: {
    // 攻撃関連
    attackDamage: 20, // 通常攻撃のダメージ
    backstabMultiplier: 1.5, // 背後攻撃の倍率
    attackCooldown: 60, // 攻撃のクールダウン（フレーム数）

    // 反撃・撤退関連
    vulnerableDuration: 180, // 無防備状態の持続時間（フレーム数、3秒）
    retreatEnergyThreshold: 30, // 撤退を開始するエネルギー閾値
  },

  // === シミュレーション設定 ===
  simulation: {
    fps: 60, // フレームレート
    canvasWidth: 800, // キャンバス幅
    canvasHeight: 600, // キャンバス高さ

    // ゲームオーバー・勝利条件
    gameOverCountdown: 5, // ゲームオーバー後の再開カウントダウン（秒）
    victoryDisplayDuration: 5000, // 勝利表示の時間（ミリ秒）
  },

  // === YouTube連動設定 ===
  youtube: {
    commentProcessInterval: 10000, // コメント処理間隔（ミリ秒）
    messageMaxLength: 30, // コメントの最大文字数
  },

  // === UI設定 ===
  ui: {
    creatureStatsUpdateInterval: 3000, // キャラクター性質パネルの切り替え間隔（ミリ秒）
    rankingTopCount: 10, // ランキングに表示する最大数
  },

  // === サウンド設定 ===
  sound: {
    defaultSEVolume: 0.5, // デフォルトSE音量
    defaultBGMVolume: 0.3, // デフォルトBGM音量
  },
};

// 型をエクスポート（TypeScriptの型チェック用）
export type GameConfigType = typeof GameConfig;

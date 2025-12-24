// 初期種族のデータ（グリーン族のみ、レッド族はシステムが自動生成）
// isDumb: true = 植物を追わない、敵から逃げない、ランダム移動のみ
export interface InitialSpecies {
  author: string;
  comments: string[];
  isDumb?: boolean; // おバカモード（ランダム移動のみ）
}

export const initialSpeciesData: InitialSpecies[] = [
  {
    author: "ミント",
    comments: ["ふらふら歩き回るだけの生物"],
    isDumb: true, // おバカ: ランダム移動のみ
  },
  {
    author: "クローバー",
    comments: ["のんびり散歩する平和な生物"],
    isDumb: true, // おバカ: ランダム移動のみ
  },
  {
    author: "リーフ",
    comments: ["ぼーっと彷徨う生物"],
    isDumb: true, // おバカ: ランダム移動のみ
  },
];

// おバカ用の行動プログラム（植物を追わない、敵から逃げない、ランダム移動のみ）
export const DUMB_BEHAVIOR_PROGRAM = {
  approachAlly: 0, // 仲間に近づかない
  approachEnemy: 0, // 敵に近づかない（逃げもしない）
  fleeWhenWeak: 0, // 弱くても逃げない
  aggressiveness: 0, // 攻撃しない
  curiosity: 1.0, // 好奇心MAX（ランダム移動）
  territoriality: 0, // 縄張り意識なし
  obstacleAwareness: 0.3, // 障害物は少し避ける
  obstacleStrategy: "avoid" as const,
  stealthAttack: 0, // 背後攻撃しない
  counterAttack: 0, // 反撃しない
  ignoreObstacleBlockedTargets: true,
  avoidObstacleInterior: true,
  activeHunterAttack: 0, // 攻撃しない
  flockingBehavior: 0, // 群れ行動しない
  foodGreed: 0, // 植物を追わない（重要！）
  panicThreshold: 1.0, // パニックしない（閾値MAX）
  bravery: 0, // 勇敢さゼロ
};

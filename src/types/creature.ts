export interface BehaviorProgram {
  approachAlly: number; // 同種族への接近度 (-1.0 ~ 1.0)
  approachEnemy: number; // 異種族への接近度 (-1.0 ~ 1.0)
  fleeWhenWeak: number; // 弱い時の逃走傾向 (0.0 ~ 1.0)
  aggressiveness: number; // 攻撃性 (0.0 ~ 1.0)
  curiosity: number; // 好奇心（ランダム移動の度合い） (0.0 ~ 1.0)
  territoriality: number; // 縄張り意識（一箇所に留まる） (0.0 ~ 1.0)
}

// 食物連鎖の階層
export type FoodChainTier = "producer" | "herbivore" | "predator" | "apex";

// 植物（食料）
export interface Plant {
  id: string;
  position: { x: number; y: number };
  energy: number; // 栄養価
  size: number; // サイズ（見た目用）
  regrowthTimer: number; // 再生までのタイマー
  isConsumed: boolean; // 食べられたか
}

// 食物連鎖の関係を判定するヘルパー
export function getFoodChainTier(speciesName: string): FoodChainTier {
  const name = speciesName.toLowerCase();
  if (
    name.includes("グリーン") ||
    name.includes("green") ||
    name.includes("緑")
  ) {
    return "herbivore"; // 草食 - 植物を食べる
  }
  if (
    name.includes("ブルー") ||
    name.includes("blue") ||
    name.includes("青") ||
    name.includes("ネイティブ")
  ) {
    return "predator"; // 中間捕食者 - グリーンを食べる
  }
  if (name.includes("レッド") || name.includes("red") || name.includes("赤")) {
    return "apex"; // 頂点捕食者 - ブルーを食べる、同族も食べる
  }
  // デフォルトは雑食として中間捕食者扱い
  return "predator";
}

// 捕食関係を判定（predatorがpreyを食べられるか）
export function canEat(predator: Creature, prey: Creature): boolean {
  const predatorTier = getFoodChainTier(predator.species);
  const preyTier = getFoodChainTier(prey.species);

  // 同じ種族は食べない（レッド系除く）
  if (predator.species === prey.species) {
    return predatorTier === "apex"; // レッド系は共食いする
  }

  // 草食は他の生物を食べない
  if (predatorTier === "herbivore") {
    return false;
  }

  // 中間捕食者（ブルー系）は草食（グリーン系）を食べる
  if (predatorTier === "predator" && preyTier === "herbivore") {
    return true;
  }

  // 頂点捕食者（レッド系）は中間捕食者（ブルー系）を食べる
  if (predatorTier === "apex" && preyTier === "predator") {
    return true;
  }

  // 頂点捕食者は同じ頂点捕食者（他のレッド系）も食べる
  if (predatorTier === "apex" && preyTier === "apex") {
    return true;
  }

  return false;
}

// 逃げるべき相手か判定
export function shouldFleeFrom(creature: Creature, other: Creature): boolean {
  // 相手が自分を食べられるなら逃げるべき
  return canEat(other, creature);
}

// 視野内に対象がいるか判定
export function isInFieldOfView(
  creature: Creature,
  targetX: number,
  targetY: number
): boolean {
  const dx = targetX - creature.position.x;
  const dy = targetY - creature.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 距離チェック
  if (distance > creature.vision.range) {
    return false;
  }

  // 全方位視野（360度）の場合は常にtrue
  if (creature.vision.angle >= Math.PI * 2) {
    return true;
  }

  // 生物の向き（移動方向）
  const facingAngle = creature.wanderAngle;

  // ターゲットへの角度
  const angleToTarget = Math.atan2(dy, dx);

  // 角度差を計算（-π ～ π の範囲に正規化）
  let angleDiff = angleToTarget - facingAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  // 視野角の半分以内かチェック
  return Math.abs(angleDiff) <= creature.vision.angle / 2;
}

// 種族に応じたデフォルト視野を取得
export function getDefaultVision(speciesName: string): {
  angle: number;
  range: number;
} {
  const tier = getFoodChainTier(speciesName);

  switch (tier) {
    case "apex": // レッド系：前方のみだが遠くまで見える
      return {
        angle: Math.PI * 0.5 + Math.random() * Math.PI * 0.3, // 90°～144°
        range: 150 + Math.random() * 80, // 150-230
      };
    case "predator": // ブルー系：広く見える
      return {
        angle: Math.PI * 1.2 + Math.random() * Math.PI * 0.6, // 216°～324°
        range: 100 + Math.random() * 50, // 100-150
      };
    case "herbivore": // グリーン系：全方位だが狭い
      return {
        angle: Math.PI * 2, // 360°
        range: 50 + Math.random() * 30, // 50-80
      };
    default:
      return {
        angle: Math.PI,
        range: 100,
      };
  }
}

export interface Creature {
  id: string;
  name: string;
  attributes: {
    speed: number;
    size: number;
    strength: number;
    intelligence: number;
    social: number;
  };
  appearance: {
    bodyType: "circle" | "triangle" | "square" | "star" | "organic";
    primaryColor: string;
    secondaryColor: string;
    hasEyes: boolean;
    hasTentacles: boolean;
    hasWings: boolean;
    pattern: "solid" | "stripes" | "spots" | "gradient";
  };
  behavior: {
    diet: "herbivore" | "carnivore" | "omnivore";
    activity: "diurnal" | "nocturnal" | "cathemeral";
    social: "solitary" | "pack" | "swarm";
  };
  traits: {
    strengths: string[];
    weaknesses: string[];
  };
  behaviorProgram: BehaviorProgram; // AI生成の動作プログラム
  position: {
    x: number;
    y: number;
  };
  homePosition: {
    // 縄張りの中心（初期位置）
    x: number;
    y: number;
  };
  velocity: {
    x: number;
    y: number;
  };
  energy: number;
  age: number;
  author: string;
  comment: string;
  species: string;
  isNewArrival?: boolean;
  reproductionCooldown: number;
  reproductionHistory: { [partnerId: string]: number }; // 相手ごとの繁殖回数
  wanderAngle: number; // 現在の移動方向（ラジアン）
  vision: {
    angle: number; // 視野角（ラジアン、0～2π）
    range: number; // 視野距離
  };
}

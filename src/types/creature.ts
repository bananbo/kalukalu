export interface BehaviorProgram {
  approachAlly: number; // 同種族への接近度 (-1.0 ~ 1.0)
  approachEnemy: number; // 異種族への接近度 (-1.0 ~ 1.0)
  fleeWhenWeak: number; // 弱い時の逃走傾向 (0.0 ~ 1.0)
  aggressiveness: number; // 攻撃性 (0.0 ~ 1.0)
  curiosity: number; // 好奇心（ランダム移動の度合い） (0.0 ~ 1.0)
  territoriality: number; // 縄張り意識（一箇所に留まる） (0.0 ~ 1.0)
  obstacleAwareness: number; // 障害物認識度 (0.0 ~ 1.0) - 高いと早めに回避
  obstacleStrategy: "avoid" | "use-as-cover" | "ignore"; // 障害物への戦略
  stealthAttack: number; // 背後攻撃傾向 (0.0 ~ 1.0) - 高いとレッドの背後を狙う
  counterAttack: number; // 反撃傾向 (0.0 ~ 1.0) - 高いと逃げずに反撃を試みる
  ignoreObstacleBlockedTargets: boolean; // 障害物で遮られた目標を無視するか
  avoidObstacleInterior: boolean; // 障害物の内部を目標にしないか
  activeHunterAttack: number; // ハンター積極攻撃度 (0.0 ~ 1.0) - 高いと回り込んで攻撃
  // 新しい行動パラメータ
  flockingBehavior: number; // 群れ行動 (0.0 ~ 1.0) - 高いと仲間と一緒に移動
  foodGreed: number; // 食欲 (0.0 ~ 1.0) - 高いと植物を積極的に探す
  panicThreshold: number; // パニック閾値 (0.0 ~ 1.0) - 低いとすぐパニック逃走
  bravery: number; // 勇敢さ (0.0 ~ 1.0) - 高いと仲間を助けに行く
}

// 種族タイプ（鬼ごっこシステム）
export type SpeciesType = "red" | "green";

// 植物（食料）
export interface Plant {
  id: string;
  position: { x: number; y: number };
  energy: number; // 栄養価
  size: number; // サイズ（見た目用）
  regrowthTimer: number; // 再生までのタイマー
  isConsumed: boolean; // 食べられたか
  lifespanTimer: number; // 寿命タイマー（フレーム数、0になったら消滅）
}

// 壁・障害物
export interface Obstacle {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  type: "wall" | "rock" | "tree"; // 後でイラストに置き換え可能
}

// 種族タイプを判定するヘルパー
export function getSpeciesType(speciesName: string): SpeciesType {
  const name = speciesName.toLowerCase();
  if (
    name.includes("グリーン") ||
    name.includes("green") ||
    name.includes("緑")
  ) {
    return "green"; // グリーン族（逃げる側、植物を食べる）
  }
  if (name.includes("レッド") || name.includes("red") || name.includes("赤")) {
    return "red"; // レッド族（鬼）
  }
  // デフォルトはグリーン
  return "green";
}

// 後方互換性のため（削除予定）
export type FoodChainTier = "producer" | "herbivore" | "predator" | "apex";
export function getFoodChainTier(speciesName: string): FoodChainTier {
  const type = getSpeciesType(speciesName);
  return type === "green" ? "herbivore" : "apex";
}

// 鬼ごっこシステム: レッドがグリーンを捕まえられるか
export function canCatch(red: Creature, green: Creature): boolean {
  const redType = getSpeciesType(red.species);
  const greenType = getSpeciesType(green.species);

  // レッドはグリーンを捕まえられる
  return redType === "red" && greenType === "green";
}

// 背後からの攻撃判定（グリーンがレッドを背後から攻撃できるか）
export function canAttackFromBehind(green: Creature, red: Creature): boolean {
  const greenType = getSpeciesType(green.species);
  const redType = getSpeciesType(red.species);

  // グリーンがレッドでない場合は攻撃不可
  if (greenType !== "green" || redType !== "red") {
    return false;
  }

  // レッドの移動方向（向いている方向）
  const redFacingAngle = red.wanderAngle;

  // レッドから見たグリーンへの角度
  const dx = green.position.x - red.position.x;
  const dy = green.position.y - red.position.y;
  const angleFromRedToGreen = Math.atan2(dy, dx);

  // レッドの正面方向との角度差を計算
  let angleDiff = angleFromRedToGreen - redFacingAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  // グリーンがレッドの「背後」にいるか判定
  // 背後 = レッドの正面から見て135度～225度の範囲（真後ろ±45度）
  // つまり、angleDiffの絶対値が135度以上なら背後
  const BACK_ANGLE_THRESHOLD = Math.PI * 0.75; // 135度
  return Math.abs(angleDiff) >= BACK_ANGLE_THRESHOLD;
}

// 攻撃者(attacker)がターゲット(target)の背後にいるか判定（汎用）
export function isTargetBehind(attacker: Creature, target: Creature): boolean {
  // ターゲットの移動方向（向いている方向）
  const targetFacingAngle = target.wanderAngle;

  // ターゲットから見た攻撃者への角度
  const dx = attacker.position.x - target.position.x;
  const dy = attacker.position.y - target.position.y;
  const angleFromTargetToAttacker = Math.atan2(dy, dx);

  // ターゲットの正面方向との角度差を計算
  let angleDiff = angleFromTargetToAttacker - targetFacingAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  // 攻撃者がターゲットの「背後」にいるか判定
  // 背後 = ターゲットの正面から見て135度～225度の範囲（真後ろ±45度）
  const BACK_ANGLE_THRESHOLD = Math.PI * 0.75; // 135度
  return Math.abs(angleDiff) >= BACK_ANGLE_THRESHOLD;
}

// 後方互換性のため（段階的に削除）
export function canEat(predator: Creature, prey: Creature): boolean {
  return canCatch(predator, prey);
}

// 逃げるべき相手か判定
export function shouldFleeFrom(creature: Creature, other: Creature): boolean {
  const creatureType = getSpeciesType(creature.species);
  const otherType = getSpeciesType(other.species);

  // グリーンはレッドから逃げる
  return creatureType === "green" && otherType === "red";
}

// 線分と矩形の交差判定（視界遮断チェック用）
function lineIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rectX: number,
  rectY: number,
  rectW: number,
  rectH: number
): boolean {
  // 線分と矩形の4辺との交差をチェック
  const left = rectX;
  const right = rectX + rectW;
  const top = rectY;
  const bottom = rectY + rectH;

  // 線分が完全に矩形の外側にある場合
  if (
    (x1 < left && x2 < left) ||
    (x1 > right && x2 > right) ||
    (y1 < top && y2 < top) ||
    (y1 > bottom && y2 > bottom)
  ) {
    return false;
  }

  // 線分の方向ベクトル
  const dx = x2 - x1;
  const dy = y2 - y1;

  // 各辺との交差をチェック
  // 左辺
  if (dx !== 0) {
    const t = (left - x1) / dx;
    if (t >= 0 && t <= 1) {
      const y = y1 + t * dy;
      if (y >= top && y <= bottom) return true;
    }
  }
  // 右辺
  if (dx !== 0) {
    const t = (right - x1) / dx;
    if (t >= 0 && t <= 1) {
      const y = y1 + t * dy;
      if (y >= top && y <= bottom) return true;
    }
  }
  // 上辺
  if (dy !== 0) {
    const t = (top - y1) / dy;
    if (t >= 0 && t <= 1) {
      const x = x1 + t * dx;
      if (x >= left && x <= right) return true;
    }
  }
  // 下辺
  if (dy !== 0) {
    const t = (bottom - y1) / dy;
    if (t >= 0 && t <= 1) {
      const x = x1 + t * dx;
      if (x >= left && x <= right) return true;
    }
  }

  return false;
}

// 視界が障害物で遮られているかチェック
export function isBlockedByObstacle(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  obstacles: Obstacle[]
): boolean {
  for (const obstacle of obstacles) {
    if (
      lineIntersectsRect(
        fromX,
        fromY,
        toX,
        toY,
        obstacle.position.x,
        obstacle.position.y,
        obstacle.width,
        obstacle.height
      )
    ) {
      return true;
    }
  }
  return false;
}

// 視野内に対象がいるか判定（障害物による遮蔽も考慮可能）
export function isInFieldOfView(
  creature: Creature,
  targetX: number,
  targetY: number,
  obstacles?: Obstacle[]
): boolean {
  const dx = targetX - creature.position.x;
  const dy = targetY - creature.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 距離チェック
  if (distance > creature.vision.range) {
    return false;
  }

  // 全方位視野（360度）の場合でも障害物チェックは必要
  if (creature.vision.angle >= Math.PI * 2) {
    // 障害物による遮蔽チェック（障害物が渡された場合のみ）
    if (obstacles && obstacles.length > 0) {
      if (
        isBlockedByObstacle(
          creature.position.x,
          creature.position.y,
          targetX,
          targetY,
          obstacles
        )
      ) {
        return false;
      }
    }
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
  const inAngle = Math.abs(angleDiff) <= creature.vision.angle / 2;
  if (!inAngle) {
    return false;
  }

  // 障害物による遮蔽チェック（障害物が渡された場合のみ）
  if (obstacles && obstacles.length > 0) {
    if (
      isBlockedByObstacle(
        creature.position.x,
        creature.position.y,
        targetX,
        targetY,
        obstacles
      )
    ) {
      return false;
    }
  }

  return true;
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
  typeId: string; // キャラクタータイプID（分裂しても継承される）
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
  species: string; // 'レッド族' または 'グリーン族'
  isNewArrival?: boolean;
  reproductionCooldown: number;
  reproductionHistory: { [partnerId: string]: number }; // 相手ごとの繁殖回数
  wanderAngle: number; // 現在の移動方向（ラジアン）
  vision: {
    angle: number; // 視野角（ラジアン、0～2π）
    range: number; // 視野距離
  };
  plantPoints: number; // 植物ポイント（グリーンのみ）
  splitCooldown: number; // 分裂クールダウン
  survivalPoints: number; // 生存ポイント（10秒ごとに+1）
  survivalFrames: number; // 生存フレーム数（60fps想定）
  // 戦闘状態
  isRetreating: boolean; // 巣に撤退中（レッド用）
  isVulnerable: boolean; // 無防備状態（攻撃されやすい）
  vulnerableUntil: number; // 無防備状態の終了フレーム
  lastAttackedBy: string | null; // 最後に攻撃してきた相手のID
  lastAttackedAt: number; // 最後に攻撃された時刻（フレーム数）
  isCounterAttacking: boolean; // 反撃中（回避せず立ち向かっている）
  // 攻撃者追跡（グリーン用）
  trackedAttackerPos?: { x: number; y: number }; // 攻撃者の最後の位置
  trackingUntil?: number; // 追跡が有効なフレーム
}

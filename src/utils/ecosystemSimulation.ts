import {
  Creature,
  Plant,
  Obstacle,
  canEat,
  getFoodChainTier,
  getDefaultVision,
  getSpeciesType,
  canAttackFromBehind,
  isInFieldOfView,
} from "../types/creature";

// 距離計算
export function distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// 衝突判定
export function checkCollision(c1: Creature, c2: Creature): boolean {
  const dist = distance(
    c1.position.x,
    c1.position.y,
    c2.position.x,
    c2.position.y
  );
  const minDist = (c1.attributes.size + c2.attributes.size) * 2.5; // サイズに応じた衝突判定
  return dist < minDist;
}

// 障害物との衝突判定
export function checkObstacleCollision(
  creature: Creature,
  obstacle: Obstacle
): { collides: boolean; pushX: number; pushY: number } {
  const creatureRadius = creature.attributes.size * 2.5;
  const cx = creature.position.x;
  const cy = creature.position.y;

  // 障害物の範囲
  const left = obstacle.position.x;
  const right = obstacle.position.x + obstacle.width;
  const top = obstacle.position.y;
  const bottom = obstacle.position.y + obstacle.height;

  // 最も近い点を計算
  const closestX = Math.max(left, Math.min(cx, right));
  const closestY = Math.max(top, Math.min(cy, bottom));

  const dist = distance(cx, cy, closestX, closestY);

  if (dist < creatureRadius) {
    // 衝突している - 押し戻す方向を計算
    const overlap = creatureRadius - dist;
    let pushX = 0;
    let pushY = 0;

    if (dist > 0) {
      pushX = ((cx - closestX) / dist) * overlap;
      pushY = ((cy - closestY) / dist) * overlap;
    } else {
      // 完全に中に入っている場合は上方向に押し出す
      pushY = -overlap;
    }

    return { collides: true, pushX, pushY };
  }

  return { collides: false, pushX: 0, pushY: 0 };
}

// ランダムな障害物を生成
export function createRandomObstacles(
  count: number,
  canvasWidth: number,
  canvasHeight: number
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const margin = 100; // 画面端からのマージン

  for (let i = 0; i < count; i++) {
    const types: Array<"wall" | "rock" | "tree"> = ["wall", "rock", "tree"];
    const type = types[Math.floor(Math.random() * types.length)];

    let width: number, height: number;

    if (type === "wall") {
      // 壁は細長い
      if (Math.random() > 0.5) {
        width = 20 + Math.random() * 30;
        height = 80 + Math.random() * 120;
      } else {
        width = 80 + Math.random() * 120;
        height = 20 + Math.random() * 30;
      }
    } else if (type === "rock") {
      // 岩はほぼ正方形
      const size = 40 + Math.random() * 60;
      width = size;
      height = size * (0.8 + Math.random() * 0.4);
    } else {
      // 木は中くらい
      width = 30 + Math.random() * 40;
      height = 30 + Math.random() * 40;
    }

    const x = margin + Math.random() * (canvasWidth - 2 * margin - width);
    const y = margin + Math.random() * (canvasHeight - 2 * margin - height);

    obstacles.push({
      id: `obstacle-${i}-${Date.now()}`,
      position: { x, y },
      width,
      height,
      type,
    });
  }

  return obstacles;
}

// 植物との衝突判定
export function checkPlantCollision(creature: Creature, plant: Plant): boolean {
  const dist = distance(
    creature.position.x,
    creature.position.y,
    plant.position.x,
    plant.position.y
  );
  const minDist = creature.attributes.size * 2 + plant.size;
  return dist < minDist;
}

// 捕食処理（predatorがpreyを食べる）
export function handlePredation(
  predator: Creature,
  prey: Creature
): {
  predatorEnergyGain: number;
  preyDamage: number;
  isPredationSuccess: boolean;
} {
  // 捕食できるか確認
  if (!canEat(predator, prey)) {
    return { predatorEnergyGain: 0, preyDamage: 0, isPredationSuccess: false };
  }

  // 捕食成功率（低めに設定）
  const catchChance =
    0.15 +
    (predator.attributes.speed - prey.attributes.speed) * 0.03 +
    predator.attributes.intelligence * 0.01;

  if (Math.random() > catchChance) {
    // 捕食失敗（逃げられた）
    return { predatorEnergyGain: 0, preyDamage: 0, isPredationSuccess: false };
  }

  // 捕食成功
  const preySize = prey.attributes.size;
  const damage = 15 + predator.attributes.strength * 2;
  const energyGain = 25 + preySize * 4; // エネルギー獲得を増加

  return {
    predatorEnergyGain: energyGain,
    preyDamage: damage,
    isPredationSuccess: true,
  };
}

// 敵（レッド）の視野に入っていない安全な位置を見つける
export function findSafeSpawnPosition(
  creatures: Creature[],
  canvasWidth: number,
  canvasHeight: number,
  targetType: "green" | "external" // green: グリーン用、external: 外来種用
): { x: number; y: number } {
  const MARGIN = 50;
  const MAX_ATTEMPTS = 50; // 最大試行回数

  // レッドの生物リスト
  const redCreatures = creatures.filter(
    (c) => getSpeciesType(c.species) === "red"
  );

  // 外来種の場合は全ての敵を考慮（自分の種族以外）
  const enemies =
    targetType === "external"
      ? creatures.filter((c) => getSpeciesType(c.species) !== "green") // 暫定: グリーン以外を敵とみなす
      : redCreatures;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const x = MARGIN + Math.random() * (canvasWidth - MARGIN * 2);
    const y = MARGIN + Math.random() * (canvasHeight - MARGIN * 2);

    // この位置がどの敵の視野にも入っていないか確認
    const isVisible = enemies.some((enemy) => isInFieldOfView(enemy, x, y));

    if (!isVisible) {
      // 安全な位置が見つかった
      return { x, y };
    }
  }

  // 安全な位置が見つからなかった場合は、できるだけ遠い位置を選ぶ
  let bestPosition = { x: MARGIN, y: MARGIN };
  let maxMinDistance = 0;

  for (let attempt = 0; attempt < 20; attempt++) {
    const x = MARGIN + Math.random() * (canvasWidth - MARGIN * 2);
    const y = MARGIN + Math.random() * (canvasHeight - MARGIN * 2);

    // 最も近い敵までの距離
    const minDistance =
      enemies.length > 0
        ? Math.min(
            ...enemies.map((e) =>
              Math.sqrt(
                Math.pow(x - e.position.x, 2) + Math.pow(y - e.position.y, 2)
              )
            )
          )
        : Infinity;

    if (minDistance > maxMinDistance) {
      maxMinDistance = minDistance;
      bestPosition = { x, y };
    }
  }

  return bestPosition;
}

// 戦闘処理（鬼ごっこシステム）
export function handleCombat(
  c1: Creature,
  c2: Creature
): {
  c1Damage: number;
  c2Damage: number;
  c1EnergyGain: number;
  c2EnergyGain: number;
  c1AttackPoints: number; // 攻撃成功時のポイント
  c2AttackPoints: number;
  c1WasAttacked: boolean; // c1が攻撃を受けたか
  c2WasAttacked: boolean; // c2が攻撃を受けたか
} {
  const c1Type = getSpeciesType(c1.species);
  const c2Type = getSpeciesType(c2.species);

  // 同じ種族同士は戦闘しない
  if (c1Type === c2Type) {
    return {
      c1Damage: 0,
      c2Damage: 0,
      c1EnergyGain: 0,
      c2EnergyGain: 0,
      c1AttackPoints: 0,
      c2AttackPoints: 0,
      c1WasAttacked: false,
      c2WasAttacked: false,
    };
  }

  // グリーンがレッドを背後から攻撃する場合（ダメージを与える）
  if (c1Type === "green" && c2Type === "red") {
    if (canAttackFromBehind(c1, c2)) {
      // グリーン(c1)がレッド(c2)を背後から攻撃
      // 無防備状態なら追加ダメージ
      const vulnerableBonus = c2.isVulnerable ? 15 : 0;
      const damage =
        15 +
        c1.attributes.strength * 2 +
        c1.behaviorProgram.stealthAttack * 10 +
        vulnerableBonus;
      // 攻撃成功で30ポイント獲得！（無防備なら+10）
      const points = c2.isVulnerable ? 40 : 30;
      return {
        c1Damage: 0,
        c2Damage: damage,
        c1EnergyGain: 0,
        c2EnergyGain: 0,
        c1AttackPoints: points,
        c2AttackPoints: 0,
        c1WasAttacked: false,
        c2WasAttacked: true,
      };
    }
  }

  if (c2Type === "green" && c1Type === "red") {
    if (canAttackFromBehind(c2, c1)) {
      // グリーン(c2)がレッド(c1)を背後から攻撃
      const vulnerableBonus = c1.isVulnerable ? 15 : 0;
      const damage =
        15 +
        c2.attributes.strength * 2 +
        c2.behaviorProgram.stealthAttack * 10 +
        vulnerableBonus;
      const points = c1.isVulnerable ? 40 : 30;
      return {
        c1Damage: damage,
        c2Damage: 0,
        c1EnergyGain: 0,
        c2EnergyGain: 0,
        c1AttackPoints: 0,
        c2AttackPoints: points,
        c1WasAttacked: true,
        c2WasAttacked: false,
      };
    }
  }

  // レッドがグリーンを捕まえる（鬼ごっこ）
  if (c1Type === "red" && c2Type === "green") {
    // レッド(c1)がグリーン(c2)を捕まえる
    const baseDamage = 30 + c1.attributes.strength * 3;
    // 体格（size）による防御力: 高いとダメージ軽減（最大30%軽減）
    const sizeDefense = 1 - c2.attributes.size * 0.03;
    const finalDamage = Math.floor(baseDamage * sizeDefense);

    // グリーンが反撃中（isCounterAttacking）の場合、レッドにわずかなダメージ
    // 回避行動中（fleeWhenWeak が高い && !isCounterAttacking）の場合は反撃なし
    let counterDamage = 0;
    let counterPoints = 0;
    if (c2.isCounterAttacking) {
      // 反撃ダメージ（3-10程度、レッドへの牽制）
      counterDamage =
        3 + c2.attributes.strength + c2.behaviorProgram.counterAttack * 5;
      counterPoints = 5; // 反撃で5ポイント
    }

    return {
      c1Damage: counterDamage,
      c2Damage: finalDamage,
      c1EnergyGain: 40,
      c2EnergyGain: 0,
      c1AttackPoints: 0,
      c2AttackPoints: counterPoints,
      c1WasAttacked: counterDamage > 0,
      c2WasAttacked: true,
    };
  }

  if (c2Type === "red" && c1Type === "green") {
    // レッド(c2)がグリーン(c1)を捕まえる
    const baseDamage = 30 + c2.attributes.strength * 3;
    // 体格（size）による防御力: 高いとダメージ軽減（最大30%軽減）
    const sizeDefense = 1 - c1.attributes.size * 0.03;
    const finalDamage = Math.floor(baseDamage * sizeDefense);

    // グリーンが反撃中の場合
    let counterDamage = 0;
    let counterPoints = 0;
    if (c1.isCounterAttacking) {
      counterDamage =
        3 + c1.attributes.strength + c1.behaviorProgram.counterAttack * 5;
      counterPoints = 5;
    }

    return {
      c1Damage: finalDamage,
      c2Damage: counterDamage,
      c1EnergyGain: 0,
      c2EnergyGain: 40,
      c1AttackPoints: counterPoints,
      c2AttackPoints: 0,
      c1WasAttacked: true,
      c2WasAttacked: counterDamage > 0,
    };
  }

  // その他の場合は戦闘なし
  return {
    c1Damage: 0,
    c2Damage: 0,
    c1EnergyGain: 0,
    c2EnergyGain: 0,
    c1AttackPoints: 0,
    c2AttackPoints: 0,
    c1WasAttacked: false,
    c2WasAttacked: false,
  };
}

// 植物を食べる処理
export function eatPlant(
  creature: Creature,
  plant: Plant
): { energyGain: number; canEat: boolean; plantPointsGain: number } {
  const type = getSpeciesType(creature.species);

  // グリーンのみが植物を食べられる
  if (type !== "green") {
    return { energyGain: 0, canEat: false, plantPointsGain: 0 };
  }

  if (plant.isConsumed) {
    return { energyGain: 0, canEat: false, plantPointsGain: 0 };
  }

  // 知性（intelligence）ボーナス: 高いとエネルギー効率アップ（+0〜50%）
  const intelligenceBonus = 1 + creature.attributes.intelligence * 0.05;
  const energyGain = Math.floor(plant.energy * intelligenceBonus);

  // 植物を食べると1ポイント獲得
  return { energyGain, canEat: true, plantPointsGain: 1 };
}

// 植物の寿命（フレーム数）- 約60秒
const PLANT_LIFESPAN = 3600; // 60fps * 60秒

// 植物を生成（画面端から一定距離離れた位置に）
export function createPlant(canvasWidth: number, canvasHeight: number): Plant {
  const MARGIN = 50; // 画面端からの最小距離
  return {
    id: `plant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    position: {
      x: MARGIN + Math.random() * (canvasWidth - MARGIN * 2),
      y: MARGIN + Math.random() * (canvasHeight - MARGIN * 2),
    },
    energy: 8 + Math.random() * 7, // 8-15のエネルギー
    size: 3 + Math.random() * 4, // 3-7のサイズ
    regrowthTimer: 0,
    isConsumed: false,
    lifespanTimer: PLANT_LIFESPAN, // 寿命タイマー初期化
  };
}

// 植物を複数生成
export function createInitialPlants(
  count: number,
  canvasWidth: number,
  canvasHeight: number
): Plant[] {
  const plants: Plant[] = [];
  for (let i = 0; i < count; i++) {
    plants.push(createPlant(canvasWidth, canvasHeight));
  }
  return plants;
}

// 植物の更新（再生処理と寿命処理）
export function updatePlants(
  plants: Plant[],
  canvasWidth: number,
  canvasHeight: number,
  _maxPlants: number // 将来の拡張用
): Plant[] {
  const REGROWTH_TIME = 300; // 5秒で再生
  const MARGIN = 50; // 画面端からの最小距離

  return plants.map((plant) => {
    if (plant.isConsumed) {
      const newTimer = plant.regrowthTimer + 1;
      if (newTimer >= REGROWTH_TIME) {
        // 再生（画面端を避けた位置に）- 寿命もリセット
        return {
          ...plant,
          isConsumed: false,
          regrowthTimer: 0,
          energy: 8 + Math.random() * 7,
          position: {
            x: MARGIN + Math.random() * (canvasWidth - MARGIN * 2),
            y: MARGIN + Math.random() * (canvasHeight - MARGIN * 2),
          },
          lifespanTimer: PLANT_LIFESPAN, // 寿命をリセット
        };
      }
      return { ...plant, regrowthTimer: newTimer };
    }

    // 寿命処理（消費されていない植物）
    const newLifespan = plant.lifespanTimer - 1;
    if (newLifespan <= 0) {
      // 寿命が尽きた → 消費状態にして再生を待つ
      return {
        ...plant,
        isConsumed: true,
        regrowthTimer: 0,
        lifespanTimer: 0,
      };
    }

    return { ...plant, lifespanTimer: newLifespan };
  });
}

// 繁殖可能かチェック
export function canReproduce(c1: Creature, c2: Creature): boolean {
  // 草食動物（グリーン系）は繁殖不可（分身のみ）
  const tier1 = getFoodChainTier(c1.species);
  if (tier1 === "herbivore") {
    return false;
  }

  // レッド族（apex）も繁殖不可（倒されるまで生き続ける裏ボス）
  if (tier1 === "apex") {
    return false;
  }

  // 同じ相手とは3回までしか繁殖できない
  const c1HistoryWithC2 = c1.reproductionHistory?.[c2.id] || 0;
  const c2HistoryWithC1 = c2.reproductionHistory?.[c1.id] || 0;
  if (c1HistoryWithC2 >= 3 || c2HistoryWithC1 >= 3) {
    return false;
  }

  // 同じ種族で、両方ともクールダウンが0で、エネルギーが十分にある
  return (
    c1.species === c2.species &&
    c1.id !== c2.id &&
    c1.reproductionCooldown <= 0 &&
    c2.reproductionCooldown <= 0 &&
    c1.energy > 50 &&
    c2.energy > 50
  );
}

/**
 * 社会性（social）に応じた分裂に必要なポイントを計算
 * social=0 → 10ポイント必要
 * social=10 → 6ポイント必要
 */
export function getSplitRequirement(creature: Creature): number {
  const socialBonus = Math.floor(creature.attributes.social * 0.4); // 0〜4ポイント減少
  return Math.max(6, 10 - socialBonus); // 最低6ポイント必要
}

// グリーンの分裂チェック（植物ポイントベース）
export function canSplit(creature: Creature): boolean {
  const type = getSpeciesType(creature.species);
  const requiredPoints = getSplitRequirement(creature);
  // グリーンのみ分裂可能
  return (
    type === "green" &&
    creature.splitCooldown <= 0 &&
    creature.plantPoints >= requiredPoints && // 社会性に応じたポイント
    creature.energy > 60 // 十分なエネルギーが必要
  );
}

// 分裂（植物ポイントを消費して新しい個体を生成）
export function split(
  parent: Creature,
  canvasWidth: number,
  canvasHeight: number
): { clone: Creature; updatedParent: Creature } {
  // 突然変異確率（15%の確率で大きな変異が起こる）
  const isMutation = Math.random() < 0.15;
  const mutationFactor = isMutation ? 2.0 : 0.5; // 通常は±0.5、突然変異時は±2.0

  // 親の属性を継承（わずかな変異または突然変異）
  const inheritAttribute = (parentValue: number) => {
    const variation = (Math.random() - 0.5) * mutationFactor;
    return Math.min(10, Math.max(0, parentValue + variation));
  };

  const attributes = {
    speed: inheritAttribute(parent.attributes.speed),
    size: inheritAttribute(parent.attributes.size),
    strength: inheritAttribute(parent.attributes.strength),
    intelligence: inheritAttribute(parent.attributes.intelligence),
    social: inheritAttribute(parent.attributes.social),
  };

  const appearance = { ...parent.appearance };
  const behavior = { ...parent.behavior };
  const traits = { ...parent.traits };

  // behaviorProgramの遺伝：各パラメータを個別に継承
  const inheritBehaviorValue = (
    parentValue: number,
    min: number = -1,
    max: number = 1
  ) => {
    const variation = (Math.random() - 0.5) * (isMutation ? 0.3 : 0.1);
    return Math.min(max, Math.max(min, parentValue + variation));
  };

  const behaviorProgram = {
    approachAlly: inheritBehaviorValue(
      parent.behaviorProgram.approachAlly,
      -1,
      1
    ),
    approachEnemy: inheritBehaviorValue(
      parent.behaviorProgram.approachEnemy,
      -1,
      1
    ),
    fleeWhenWeak: inheritBehaviorValue(
      parent.behaviorProgram.fleeWhenWeak,
      0,
      1
    ),
    aggressiveness: inheritBehaviorValue(
      parent.behaviorProgram.aggressiveness,
      0,
      1
    ),
    curiosity: inheritBehaviorValue(parent.behaviorProgram.curiosity, 0, 1),
    territoriality: inheritBehaviorValue(
      parent.behaviorProgram.territoriality,
      0,
      1
    ),
    obstacleAwareness: inheritBehaviorValue(
      parent.behaviorProgram.obstacleAwareness,
      0,
      1
    ),
    obstacleStrategy: parent.behaviorProgram.obstacleStrategy,
    stealthAttack: inheritBehaviorValue(
      parent.behaviorProgram.stealthAttack,
      0,
      1
    ),
    counterAttack: inheritBehaviorValue(
      parent.behaviorProgram.counterAttack,
      0,
      1
    ),
    ignoreObstacleBlockedTargets:
      parent.behaviorProgram.ignoreObstacleBlockedTargets,
    avoidObstacleInterior: parent.behaviorProgram.avoidObstacleInterior,
    activeHunterAttack: inheritBehaviorValue(
      parent.behaviorProgram.activeHunterAttack,
      0,
      1
    ),
    // 新しいパラメータ
    flockingBehavior: inheritBehaviorValue(
      parent.behaviorProgram.flockingBehavior,
      0,
      1
    ),
    foodGreed: inheritBehaviorValue(parent.behaviorProgram.foodGreed, 0, 1),
    panicThreshold: inheritBehaviorValue(
      parent.behaviorProgram.panicThreshold,
      0,
      1
    ),
    bravery: inheritBehaviorValue(parent.behaviorProgram.bravery, 0, 1),
  };

  const position = {
    x: Math.min(
      canvasWidth,
      Math.max(0, parent.position.x + (Math.random() - 0.5) * 40)
    ),
    y: Math.min(
      canvasHeight,
      Math.max(0, parent.position.y + (Math.random() - 0.5) * 40)
    ),
  };

  const clone = {
    id: `creature-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}-${performance.now()}`,
    name: `${parent.name}分身`,
    typeId: parent.typeId, // 親のtypeIdを継承
    attributes,
    appearance,
    behavior,
    traits,
    behaviorProgram,
    position,
    homePosition: { ...position },
    velocity: { x: 0, y: 0 },
    energy: 40 + attributes.size * 5, // 体格に応じた初期エネルギー（40〜90）
    age: 0,
    author: parent.author,
    comment: `${parent.name}から分裂`,
    species: parent.species,
    reproductionCooldown: 0,
    reproductionHistory: {},
    wanderAngle: Math.random() * Math.PI * 2,
    vision: getDefaultVision(parent.species),
    plantPoints: 0, // 分身は0ポイントからスタート
    splitCooldown: 300, // 分裂クールダウン（5秒）
    survivalPoints: 0, // 生存ポイントは0からスタート
    survivalFrames: 0, // 生存フレーム数も0から
    // 戦闘状態の初期値
    isRetreating: false, // 撤退中ではない
    isVulnerable: false, // 無防備ではない
    vulnerableUntil: 0, // 無防備状態の終了フレーム
    lastAttackedBy: null, // 最後に攻撃してきた相手
    lastAttackedAt: 0, // 最後に攻撃された時刻
    isCounterAttacking: false, // 反撃中ではない
  };

  // 親は植物ポイントを消費（社会性に応じた量）し、クールダウンが発生
  const requiredPoints = getSplitRequirement(parent);
  const updatedParent = {
    ...parent,
    plantPoints: parent.plantPoints - requiredPoints,
    splitCooldown: 300, // 分裂クールダウン（5秒）
    energy: parent.energy - 20, // エネルギーも消費
  };

  return { clone, updatedParent };
}

// 後方互換性のため（段階的に削除）
export function selfReproduce(
  parent: Creature,
  canvasWidth: number,
  canvasHeight: number
): Creature {
  const result = split(parent, canvasWidth, canvasHeight);
  return result.clone;
}

// 子供の生成
export function reproduce(
  parent1: Creature,
  parent2: Creature,
  canvasWidth: number,
  canvasHeight: number
): Creature {
  // 親の属性の平均 + ランダム変異
  const attributes = {
    speed: Math.min(
      10,
      Math.max(
        0,
        (parent1.attributes.speed + parent2.attributes.speed) / 2 +
          (Math.random() - 0.5) * 2
      )
    ),
    size: Math.min(
      10,
      Math.max(
        0,
        (parent1.attributes.size + parent2.attributes.size) / 2 +
          (Math.random() - 0.5) * 2
      )
    ),
    strength: Math.min(
      10,
      Math.max(
        0,
        (parent1.attributes.strength + parent2.attributes.strength) / 2 +
          (Math.random() - 0.5) * 2
      )
    ),
    intelligence: Math.min(
      10,
      Math.max(
        0,
        (parent1.attributes.intelligence + parent2.attributes.intelligence) /
          2 +
          (Math.random() - 0.5) * 2
      )
    ),
    social: Math.min(
      10,
      Math.max(
        0,
        (parent1.attributes.social + parent2.attributes.social) / 2 +
          (Math.random() - 0.5) * 2
      )
    ),
  };

  // 外見は親のどちらかを継承（ランダム変異あり）
  const parentAppearance =
    Math.random() > 0.5 ? parent1.appearance : parent2.appearance;
  const appearance = {
    ...parentAppearance,
    hasEyes:
      Math.random() > 0.2
        ? parentAppearance.hasEyes
        : !parentAppearance.hasEyes,
    hasTentacles:
      Math.random() > 0.9
        ? !parentAppearance.hasTentacles
        : parentAppearance.hasTentacles,
    hasWings:
      Math.random() > 0.9
        ? !parentAppearance.hasWings
        : parentAppearance.hasWings,
  };

  // 行動パターンも継承
  const behavior = Math.random() > 0.5 ? parent1.behavior : parent2.behavior;

  // 長所・短所を再計算
  const traits = generateTraitsForChild(attributes, appearance, behavior);

  // 動作プログラムを継承（平均 + 変異）
  const behaviorProgram = {
    approachAlly: Math.max(
      -1,
      Math.min(
        1,
        (parent1.behaviorProgram.approachAlly +
          parent2.behaviorProgram.approachAlly) /
          2 +
          (Math.random() - 0.5) * 0.2
      )
    ),
    approachEnemy: Math.max(
      -1,
      Math.min(
        1,
        (parent1.behaviorProgram.approachEnemy +
          parent2.behaviorProgram.approachEnemy) /
          2 +
          (Math.random() - 0.5) * 0.2
      )
    ),
    fleeWhenWeak: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.fleeWhenWeak +
          parent2.behaviorProgram.fleeWhenWeak) /
          2 +
          (Math.random() - 0.5) * 0.2
      )
    ),
    aggressiveness: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.aggressiveness +
          parent2.behaviorProgram.aggressiveness) /
          2 +
          (Math.random() - 0.5) * 0.2
      )
    ),
    curiosity: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.curiosity +
          parent2.behaviorProgram.curiosity) /
          2 +
          (Math.random() - 0.5) * 0.2
      )
    ),
    territoriality: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.territoriality +
          parent2.behaviorProgram.territoriality) /
          2 +
          (Math.random() - 0.5) * 0.2
      )
    ),
    // 親から継承する追加のプロパティ
    obstacleAwareness: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.obstacleAwareness +
          parent2.behaviorProgram.obstacleAwareness) /
          2 +
          (Math.random() - 0.5) * 0.1
      )
    ),
    obstacleStrategy: parent1.behaviorProgram.obstacleStrategy, // 親1から継承
    stealthAttack: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.stealthAttack +
          parent2.behaviorProgram.stealthAttack) /
          2 +
          (Math.random() - 0.5) * 0.1
      )
    ),
    counterAttack: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.counterAttack +
          parent2.behaviorProgram.counterAttack) /
          2 +
          (Math.random() - 0.5) * 0.1
      )
    ),
    ignoreObstacleBlockedTargets:
      parent1.behaviorProgram.ignoreObstacleBlockedTargets ||
      parent2.behaviorProgram.ignoreObstacleBlockedTargets,
    avoidObstacleInterior:
      parent1.behaviorProgram.avoidObstacleInterior ||
      parent2.behaviorProgram.avoidObstacleInterior,
    activeHunterAttack: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.activeHunterAttack +
          parent2.behaviorProgram.activeHunterAttack) /
          2 +
          (Math.random() - 0.5) * 0.1
      )
    ),
    // 新しいパラメータ
    flockingBehavior: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.flockingBehavior +
          parent2.behaviorProgram.flockingBehavior) /
          2 +
          (Math.random() - 0.5) * 0.1
      )
    ),
    foodGreed: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.foodGreed +
          parent2.behaviorProgram.foodGreed) /
          2 +
          (Math.random() - 0.5) * 0.1
      )
    ),
    panicThreshold: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.panicThreshold +
          parent2.behaviorProgram.panicThreshold) /
          2 +
          (Math.random() - 0.5) * 0.1
      )
    ),
    bravery: Math.max(
      0,
      Math.min(
        1,
        (parent1.behaviorProgram.bravery + parent2.behaviorProgram.bravery) /
          2 +
          (Math.random() - 0.5) * 0.1
      )
    ),
  };

  // 親の近くに配置
  const position = {
    x: Math.min(
      canvasWidth,
      Math.max(0, parent1.position.x + (Math.random() - 0.5) * 50)
    ),
    y: Math.min(
      canvasHeight,
      Math.max(0, parent1.position.y + (Math.random() - 0.5) * 50)
    ),
  };

  return {
    id: `creature-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}-${performance.now()}`,
    typeId: parent1.typeId, // 親のtypeIdを継承
    name: `${parent1.name}Jr`,
    attributes,
    appearance,
    behavior,
    traits,
    behaviorProgram,
    position,
    homePosition: { ...position }, // 生まれた場所が縄張りの中心
    velocity: { x: 0, y: 0 },
    energy: 80,
    age: 0,
    author: parent1.author,
    comment: `${parent1.name}と${parent2.name}の子供`,
    species: parent1.species,
    reproductionCooldown: 300, // 5秒のクールダウン
    reproductionHistory: {}, // 新しい生物は繁殖履歴なし
    wanderAngle: Math.random() * Math.PI * 2,
    vision: getDefaultVision(parent1.species),
    plantPoints: 0, // 植物ポイント初期値
    splitCooldown: 0, // 分裂クールダウン初期値
    survivalPoints: 0, // 生存ポイント初期値
    survivalFrames: 0, // 生存フレーム数初期値
    // 戦闘状態の初期値
    isRetreating: false, // 撤退中ではない
    isVulnerable: false, // 無防備ではない
    vulnerableUntil: 0, // 無防備状態の終了フレーム
    lastAttackedBy: null, // 最後に攻撃してきた相手
    lastAttackedAt: 0, // 最後に攻撃された時刻
    isCounterAttacking: false, // 反撃中ではない
  };
}

// 繁殖履歴を更新するヘルパー関数
export function updateReproductionHistory(
  creature: Creature,
  partnerId: string
): Creature {
  const newHistory = { ...creature.reproductionHistory };
  newHistory[partnerId] = (newHistory[partnerId] || 0) + 1;
  return {
    ...creature,
    reproductionHistory: newHistory,
    wanderAngle: Math.random() * Math.PI * 2,
  };
}

// 子供用の長所・短所生成
function generateTraitsForChild(
  attributes: Creature["attributes"],
  appearance: Creature["appearance"],
  behavior: Creature["behavior"]
): { strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (attributes.speed > 7) strengths.push("素早い移動");
  if (attributes.size > 7) strengths.push("巨体");
  if (attributes.strength > 7) strengths.push("強力な攻撃力");
  if (attributes.intelligence > 7) strengths.push("高い知性");
  if (attributes.social > 7) strengths.push("群れでの連携");

  if (attributes.speed < 3) weaknesses.push("鈍足");
  if (attributes.size < 3) weaknesses.push("小さな体");
  if (attributes.strength < 3) weaknesses.push("非力");
  if (attributes.intelligence < 3) weaknesses.push("低い知性");
  if (attributes.social < 3) weaknesses.push("孤独");

  if (appearance.hasWings) strengths.push("飛行能力");
  if (appearance.hasTentacles) strengths.push("触手による器用さ");
  if (!appearance.hasEyes) weaknesses.push("視覚なし");

  if (behavior.diet === "carnivore") {
    strengths.push("狩猟本能");
    weaknesses.push("植物を食べられない");
  }
  if (behavior.diet === "herbivore") {
    strengths.push("穏やかな性格");
    weaknesses.push("戦闘力が低い");
  }
  if (behavior.social === "pack") strengths.push("仲間との絆");
  if (behavior.social === "solitary") weaknesses.push("単独行動");

  if (strengths.length === 0) strengths.push("適応力が高い");
  if (weaknesses.length === 0) weaknesses.push("平凡");

  return { strengths, weaknesses };
}

// 勝利判定
export function checkVictory(creatures: Creature[]): {
  hasWinner: boolean;
  winner: string | null;
  species: string[];
} {
  if (creatures.length === 0) {
    return { hasWinner: false, winner: null, species: [] };
  }

  // 生存している種族を集計
  const speciesSet = new Set(creatures.map((c) => c.species));
  const speciesArray = Array.from(speciesSet);

  // 1種族だけが残っている場合は勝利
  if (speciesArray.length === 1 && creatures.length > 0) {
    return {
      hasWinner: true,
      winner: speciesArray[0],
      species: speciesArray,
    };
  }

  return {
    hasWinner: false,
    winner: null,
    species: speciesArray,
  };
}

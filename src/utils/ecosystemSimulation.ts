import {
  Creature,
  Plant,
  Obstacle,
  canEat,
  getFoodChainTier,
  getDefaultVision,
  getSpeciesType,
  canAttackFromBehind,
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

// 戦闘処理（鬼ごっこシステム）
export function handleCombat(
  c1: Creature,
  c2: Creature
): {
  c1Damage: number;
  c2Damage: number;
  c1EnergyGain: number;
  c2EnergyGain: number;
} {
  const c1Type = getSpeciesType(c1.species);
  const c2Type = getSpeciesType(c2.species);

  // 同じ種族同士は戦闘しない
  if (c1Type === c2Type) {
    return { c1Damage: 0, c2Damage: 0, c1EnergyGain: 0, c2EnergyGain: 0 };
  }

  // グリーンがレッドを背後から攻撃する場合（グリーンの勝利）
  if (c1Type === "green" && c2Type === "red") {
    if (canAttackFromBehind(c1, c2)) {
      // グリーン(c1)がレッド(c2)を背後から倒す
      return { c1Damage: 0, c2Damage: 100, c1EnergyGain: 0, c2EnergyGain: 0 };
    }
  }

  if (c2Type === "green" && c1Type === "red") {
    if (canAttackFromBehind(c2, c1)) {
      // グリーン(c2)がレッド(c1)を背後から倒す
      return { c1Damage: 100, c2Damage: 0, c1EnergyGain: 0, c2EnergyGain: 0 };
    }
  }

  // レッドがグリーンを捕まえる（鬼ごっこ）
  if (c1Type === "red" && c2Type === "green") {
    // レッド(c1)がグリーン(c2)を捕まえる
    const damage = 30 + c1.attributes.strength * 3;
    return { c1Damage: 0, c2Damage: damage, c1EnergyGain: 40, c2EnergyGain: 0 };
  }

  if (c2Type === "red" && c1Type === "green") {
    // レッド(c2)がグリーン(c1)を捕まえる
    const damage = 30 + c2.attributes.strength * 3;
    return { c1Damage: damage, c2Damage: 0, c1EnergyGain: 0, c2EnergyGain: 40 };
  }

  // その他の場合は戦闘なし
  return { c1Damage: 0, c2Damage: 0, c1EnergyGain: 0, c2EnergyGain: 0 };
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

  // 植物を食べると1ポイント獲得
  return { energyGain: plant.energy, canEat: true, plantPointsGain: 1 };
}

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

// 植物の更新（再生処理）
export function updatePlants(
  plants: Plant[],
  canvasWidth: number,
  canvasHeight: number,
  maxPlants: number
): Plant[] {
  const REGROWTH_TIME = 300; // 5秒で再生
  const MARGIN = 50; // 画面端からの最小距離

  return plants.map((plant) => {
    if (plant.isConsumed) {
      const newTimer = plant.regrowthTimer + 1;
      if (newTimer >= REGROWTH_TIME) {
        // 再生（画面端を避けた位置に）
        return {
          ...plant,
          isConsumed: false,
          regrowthTimer: 0,
          energy: 8 + Math.random() * 7,
          position: {
            x: MARGIN + Math.random() * (canvasWidth - MARGIN * 2),
            y: MARGIN + Math.random() * (canvasHeight - MARGIN * 2),
          },
        };
      }
      return { ...plant, regrowthTimer: newTimer };
    }
    return plant;
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

// グリーンの分裂チェック（植物ポイントベース）
export function canSplit(creature: Creature): boolean {
  const type = getSpeciesType(creature.species);
  // グリーンのみ分裂可能
  return (
    type === "green" &&
    creature.splitCooldown <= 0 &&
    creature.plantPoints >= 10 && // 10ポイント貯まったら分裂可能
    creature.energy > 60 // 十分なエネルギーが必要
  );
}

// 分裂（植物ポイントを消費して新しい個体を生成）
export function split(
  parent: Creature,
  canvasWidth: number,
  canvasHeight: number
): { clone: Creature; updatedParent: Creature } {
  // 親の属性をほぼ継承（わずかな変異）
  const attributes = {
    speed: Math.min(
      10,
      Math.max(0, parent.attributes.speed + (Math.random() - 0.5) * 1)
    ),
    size: Math.min(
      10,
      Math.max(0, parent.attributes.size + (Math.random() - 0.5) * 1)
    ),
    strength: Math.min(
      10,
      Math.max(0, parent.attributes.strength + (Math.random() - 0.5) * 1)
    ),
    intelligence: Math.min(
      10,
      Math.max(0, parent.attributes.intelligence + (Math.random() - 0.5) * 1)
    ),
    social: Math.min(
      10,
      Math.max(0, parent.attributes.social + (Math.random() - 0.5) * 1)
    ),
  };

  const appearance = { ...parent.appearance };
  const behavior = { ...parent.behavior };
  const traits = { ...parent.traits };
  const behaviorProgram = { ...parent.behaviorProgram };

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
    energy: 60,
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
  };

  // 親は植物ポイントを10消費し、クールダウンが発生
  const updatedParent = {
    ...parent,
    plantPoints: parent.plantPoints - 10,
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

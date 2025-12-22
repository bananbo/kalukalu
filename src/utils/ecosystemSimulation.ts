import {
  Creature,
  Plant,
  canEat,
  getFoodChainTier,
  getDefaultVision,
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

// 戦闘処理（捕食関係でない場合の戦闘）
export function handleCombat(
  c1: Creature,
  c2: Creature
): {
  c1Damage: number;
  c2Damage: number;
  c1EnergyGain: number;
  c2EnergyGain: number;
} {
  // 同じ種族同士は戦闘しない（レッド系の共食い除く）
  if (c1.species === c2.species && getFoodChainTier(c1.species) !== "apex") {
    return { c1Damage: 0, c2Damage: 0, c1EnergyGain: 0, c2EnergyGain: 0 };
  }

  // 捕食関係をチェック
  const c1CanEatC2 = canEat(c1, c2);
  const c2CanEatC1 = canEat(c2, c1);

  // 捕食処理（空腹時のみ - エネルギーが70以下）
  const HUNGER_THRESHOLD = 70;

  if (c1CanEatC2 && c1.energy < HUNGER_THRESHOLD) {
    const result = handlePredation(c1, c2);
    return {
      c1Damage: 0,
      c2Damage: result.preyDamage,
      c1EnergyGain: result.predatorEnergyGain,
      c2EnergyGain: 0,
    };
  }

  if (c2CanEatC1 && c2.energy < HUNGER_THRESHOLD) {
    const result = handlePredation(c2, c1);
    return {
      c1Damage: result.preyDamage,
      c2Damage: 0,
      c1EnergyGain: 0,
      c2EnergyGain: result.predatorEnergyGain,
    };
  }

  // 捕食関係がない場合は通常の戦闘
  const c1Power =
    c1.attributes.strength * 0.5 +
    c1.attributes.size * 0.3 +
    c1.attributes.speed * 0.2;
  const c2Power =
    c2.attributes.strength * 0.5 +
    c2.attributes.size * 0.3 +
    c2.attributes.speed * 0.2;

  const baseDamage = 5;
  const c1Damage = Math.max(0, ((c2Power - c1Power * 0.5) * baseDamage) / 10);
  const c2Damage = Math.max(0, ((c1Power - c2Power * 0.5) * baseDamage) / 10);

  return { c1Damage, c2Damage, c1EnergyGain: 0, c2EnergyGain: 0 };
}

// 植物を食べる処理
export function eatPlant(
  creature: Creature,
  plant: Plant
): { energyGain: number; canEat: boolean } {
  const tier = getFoodChainTier(creature.species);

  // 草食（グリーン系）のみが植物を食べられる
  if (tier !== "herbivore") {
    return { energyGain: 0, canEat: false };
  }

  if (plant.isConsumed) {
    return { energyGain: 0, canEat: false };
  }

  return { energyGain: plant.energy, canEat: true };
}

// 植物を生成
export function createPlant(canvasWidth: number, canvasHeight: number): Plant {
  return {
    id: `plant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    position: {
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
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

  return plants.map((plant) => {
    if (plant.isConsumed) {
      const newTimer = plant.regrowthTimer + 1;
      if (newTimer >= REGROWTH_TIME) {
        // 再生
        return {
          ...plant,
          isConsumed: false,
          regrowthTimer: 0,
          energy: 8 + Math.random() * 7,
          position: {
            x: Math.random() * canvasWidth,
            y: Math.random() * canvasHeight,
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

// グリーン系（草食）の単独繁殖チェック
export function canSelfReproduce(creature: Creature): boolean {
  const tier = getFoodChainTier(creature.species);
  // 草食動物のみ単独繁殖可能（分裂）
  return (
    tier === "herbivore" &&
    creature.reproductionCooldown <= 0 &&
    creature.energy > 80 && // より高いエネルギーが必要
    Math.random() < 0.0008 // さらに低確率
  );
}

// 単独繁殖（分裂）
export function selfReproduce(
  parent: Creature,
  canvasWidth: number,
  canvasHeight: number
): Creature {
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

  return {
    id: `creature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: `${parent.name}分身`,
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
    reproductionCooldown: 500, // 長めのクールダウン
    reproductionHistory: {}, // 分身は繁殖履歴なし
    wanderAngle: Math.random() * Math.PI * 2,
    vision: getDefaultVision(parent.species),
  };
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
    id: `creature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

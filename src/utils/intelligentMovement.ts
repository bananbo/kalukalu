import {
  Creature,
  Plant,
  Obstacle,
  getFoodChainTier,
  canEat,
  shouldFleeFrom,
  isInFieldOfView,
  canAttackFromBehind,
  getSpeciesType,
} from "../types/creature";

// グリーン系の仲間情報を取得する関数
export function getGreenAlliesInfo(
  creature: Creature,
  allCreatures: Creature[]
): {
  allies: Creature[];
  nearestAllyDist: number;
  nearestAlly: Creature | null;
  allyCenter: { x: number; y: number } | null;
  totalAllies: number;
} {
  const allies = allCreatures.filter(
    (c) =>
      c.id !== creature.id &&
      getSpeciesType(c.species) === "green" &&
      c.energy > 0
  );

  if (allies.length === 0) {
    return {
      allies: [],
      nearestAllyDist: Infinity,
      nearestAlly: null,
      allyCenter: null,
      totalAllies: 0,
    };
  }

  let nearestDist = Infinity;
  let nearestAlly: Creature | null = null;
  let centerX = 0;
  let centerY = 0;

  for (const ally of allies) {
    const dx = ally.position.x - creature.position.x;
    const dy = ally.position.y - creature.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < nearestDist) {
      nearestDist = dist;
      nearestAlly = ally;
    }

    centerX += ally.position.x;
    centerY += ally.position.y;
  }

  return {
    allies,
    nearestAllyDist: nearestDist,
    nearestAlly,
    allyCenter: {
      x: centerX / allies.length,
      y: centerY / allies.length,
    },
    totalAllies: allies.length,
  };
}

// 周囲の生物と植物に基づいて移動方向を計算
export function calculateIntelligentMovement(
  creature: Creature,
  allCreatures: Creature[],
  plants: Plant[],
  canvasWidth: number,
  canvasHeight: number,
  obstacles: Obstacle[] = [],
  currentFrame: number = 0
): { x: number; y: number } {
  const program = creature.behaviorProgram;
  const myTier = getFoodChainTier(creature.species);
  const myType = getSpeciesType(creature.species);

  // 視野距離を使用（detectionRangeの代わり）
  const detectionRange =
    creature.vision?.range || 120 + creature.attributes.intelligence * 10;

  // 基本速度（さらにゆっくり）
  const baseSpeed = creature.attributes.speed * 0.08;

  // 力のベクトル
  let forceX = 0;
  let forceY = 0;

  // ===== レッドの撤退・無防備状態処理 =====
  if (myType === "red" && creature.isRetreating && creature.homePosition) {
    // 巣に向かって撤退
    const dx = creature.homePosition.x - creature.position.x;
    const dy = creature.homePosition.y - creature.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 10) {
      // 撤退中は速度を上げて逃げる
      const retreatSpeed = baseSpeed * 1.5;
      return {
        x: (dx / dist) * retreatSpeed,
        y: (dy / dist) * retreatSpeed,
      };
    }
    // 巣に到達したら静止（回復中）
    return { x: 0, y: 0 };
  }

  // ===== 攻撃を受けた直後の反応 =====
  const recentlyAttacked =
    creature.lastAttackedAt && currentFrame - creature.lastAttackedAt < 60; // 1秒以内に攻撃された

  if (recentlyAttacked && creature.lastAttackedBy) {
    const attacker = allCreatures.find((c) => c.id === creature.lastAttackedBy);
    if (attacker) {
      const dx = attacker.position.x - creature.position.x;
      const dy = attacker.position.y - creature.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        const bravery = program.bravery ?? 0.5;
        const counterAttack = program.counterAttack ?? 0.1;

        // 勇敢さと反撃傾向に基づいて行動を決定
        if (bravery > 0.6 && counterAttack > 0.3 && creature.energy > 50) {
          // 勇敢な性格は反撃
          const counterForce = bravery * 0.8;
          forceX += (dx / dist) * counterForce;
          forceY += (dy / dist) * counterForce;
        } else {
          // 臆病な性格は逃げる
          const panicThreshold = program.panicThreshold ?? 0.3;
          const fleeForce = 1.0 - bravery + panicThreshold;
          forceX -= (dx / dist) * fleeForce;
          forceY -= (dy / dist) * fleeForce;
        }
      }
    }
  }

  // 群れの中心を計算
  let allyCount = 0;
  let allyCenterX = 0;
  let allyCenterY = 0;

  // 最も近い獲物と脅威を追跡
  let nearestPreyDist = Infinity;
  let nearestPreyX = 0;
  let nearestPreyY = 0;
  let nearestThreatDist = Infinity;
  let nearestThreatX = 0;
  let nearestThreatY = 0;

  // ===== グリーン系の仲間認識 =====
  let greenAlliesInfo: ReturnType<typeof getGreenAlliesInfo> | null = null;
  if (myType === "green") {
    greenAlliesInfo = getGreenAlliesInfo(creature, allCreatures);
  }

  // ===== 草食動物（グリーン系）は植物を探す =====
  if (myTier === "herbivore") {
    const activePlants = plants.filter((p) => !p.isConsumed);

    for (const plant of activePlants) {
      // 視野内チェック
      if (!isInFieldOfView(creature, plant.position.x, plant.position.y)) {
        continue;
      }

      const dx = plant.position.x - creature.position.x;
      const dy = plant.position.y - creature.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < nearestPreyDist) {
        nearestPreyDist = distance;
        nearestPreyX = dx / distance;
        nearestPreyY = dy / distance;
      }
    }

    // 植物に向かう力（空腹度に応じて強くなる）
    if (nearestPreyDist < Infinity) {
      const hungerFactor = Math.max(0.3, (100 - creature.energy) / 100);
      const plantForce = hungerFactor * 0.8;
      forceX += nearestPreyX * plantForce;
      forceY += nearestPreyY * plantForce;
    }
  }

  // ===== 頂点捕食者（レッド系）のランダム探索は後で追加 =====
  // （獲物が見つからない場合のみランダム移動するように後で処理）

  // ===== 中間捕食者（ブルー系）も探索 =====
  if (myTier === "predator") {
    const wanderStrength = 0.2 + program.curiosity * 0.2;
    if (Math.random() < 0.08) {
      const randomAngle = Math.random() * Math.PI * 2;
      forceX += Math.cos(randomAngle) * wanderStrength;
      forceY += Math.sin(randomAngle) * wanderStrength;
    }
  }

  // ===== 他の生物をスキャン =====
  for (const other of allCreatures) {
    if (other.id === creature.id) continue;

    // 視野内チェック
    if (!isInFieldOfView(creature, other.position.x, other.position.y)) {
      continue;
    }

    const dx = other.position.x - creature.position.x;
    const dy = other.position.y - creature.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) continue;

    const dirX = dx / distance;
    const dirY = dy / distance;
    const distanceFactor = 1 - distance / detectionRange;
    const closenessFactor = Math.pow(distanceFactor, 0.5);

    const isSameSpecies = other.species === creature.species;

    if (isSameSpecies) {
      // ===== 同種族への行動 =====
      // レッド系は同族を捕食対象として見る
      if (myTier === "apex") {
        // 空腹なら同族も追う
        if (creature.energy < 60) {
          const hungerForce =
            ((60 - creature.energy) / 60) * closenessFactor * 0.3;
          forceX += dirX * hungerForce;
          forceY += dirY * hungerForce;
        } else {
          // それほど空腹でなければ普通の同族行動
          const allyForce = program.approachAlly * closenessFactor * 0.5;
          forceX += dirX * allyForce;
          forceY += dirY * allyForce;
        }
      } else if (myTier === "herbivore") {
        // グリーン系は同族に集まらない（自由に動く）
        // 何もしない
      } else {
        // ブルー系は通常の同族行動（近すぎる場合は離れる）
        if (distance < 30) {
          // 近すぎる場合は離れる
          const separationForce = ((30 - distance) / 30) * 0.5;
          forceX -= dirX * separationForce;
          forceY -= dirY * separationForce;
        } else {
          // 遠い場合はゆるく近づく
          const allyForce = program.approachAlly * closenessFactor * 0.4; // 0.8から0.4に減少
          forceX += dirX * allyForce;
          forceY += dirY * allyForce;
        }
      }

      allyCount++;
      allyCenterX += other.position.x;
      allyCenterY += other.position.y;
    } else {
      // ===== 異種族への行動（食物連鎖に基づく） =====

      const iCanEatOther = canEat(creature, other);
      const otherCanEatMe = shouldFleeFrom(creature, other);

      if (otherCanEatMe) {
        // ===== 逃走 or 背後攻撃行動 =====
        const stealthAttack = program.stealthAttack ?? 0.3;
        const counterAttack = program.counterAttack ?? 0.1;
        const bravery = program.bravery ?? 0.5;

        // 背後攻撃のチャンス判定
        const canBackstab = canAttackFromBehind(creature, other);
        const creatureType = getSpeciesType(creature.species);

        // グリーン系は仲間が近くにいると勇敢になる
        let braveryBonus = 0;
        if (creatureType === "green" && greenAlliesInfo) {
          // 近くの仲間の数に応じて勇気ボーナス
          const nearbyAllies = greenAlliesInfo.allies.filter((ally) => {
            const dx = ally.position.x - creature.position.x;
            const dy = ally.position.y - creature.position.y;
            return Math.sqrt(dx * dx + dy * dy) < 100; // 100px以内の仲間
          });
          braveryBonus = Math.min(0.3, nearbyAllies.length * 0.1); // 最大+0.3
        }

        // レッドが無防備状態なら攻撃チャンス
        const isTargetVulnerable =
          getSpeciesType(other.species) === "red" && other.isVulnerable;

        if (isTargetVulnerable && creatureType === "green") {
          // 無防備なレッドには積極的に攻撃
          const attackForce = 1.2 + braveryBonus;
          forceX += dirX * attackForce;
          forceY += dirY * attackForce;
        } else if (
          canBackstab &&
          stealthAttack > 0.3 &&
          creatureType === "green"
        ) {
          // 背後から攻撃できる位置にいる！接近する
          const backstabForce = stealthAttack * closenessFactor * 1.2;
          forceX += dirX * backstabForce;
          forceY += dirY * backstabForce;
        } else if (
          (counterAttack + braveryBonus > 0.5 ||
            bravery + braveryBonus > 0.7) &&
          creature.energy > 70
        ) {
          // 反撃傾向が高く、体力がある場合は逃げずに向かう（仲間がいると強気）
          const counterForce =
            (counterAttack + braveryBonus) * closenessFactor * 0.5;
          // レッドの背後に回り込むように動く
          const perpX = -dirY; // 垂直方向
          const perpY = dirX;
          forceX += perpX * counterForce;
          forceY += perpY * counterForce;
        } else {
          // 通常の逃走行動（仲間が近くにいると逃げにくくなる）
          const adjustedFleeStrength = Math.max(0.3, 1.0 - braveryBonus);
          const fleeForce =
            closenessFactor *
            (0.8 + program.fleeWhenWeak * 0.5) *
            adjustedFleeStrength;
          forceX -= dirX * fleeForce;
          forceY -= dirY * fleeForce;
        }

        // 最も近い脅威を記録
        if (distance < nearestThreatDist) {
          nearestThreatDist = distance;
          nearestThreatX = dirX;
          nearestThreatY = dirY;
        }

        // 弱っている場合はさらに逃げる（背後攻撃傾向が低い場合のみ）
        if (creature.energy < 50 && stealthAttack < 0.5) {
          const panicForce =
            ((50 - creature.energy) / 50) * closenessFactor * 0.5;
          forceX -= dirX * panicForce;
          forceY -= dirY * panicForce;
        }
      } else if (iCanEatOther) {
        // ===== 捕食行動 =====
        // 鬼ごっこシステム: レッドは常にグリーンを追う（空腹度に関係なく）
        if (myTier === "apex") {
          // レッドは常に積極的に追跡
          const chaseForce = program.aggressiveness * closenessFactor * 1.5; // 常に強い追跡力
          forceX += dirX * chaseForce;
          forceY += dirY * chaseForce;

          // 最も近い獲物を記録
          if (distance < nearestPreyDist) {
            nearestPreyDist = distance;
            nearestPreyX = dirX;
            nearestPreyY = dirY;
          }
        } else {
          // その他の場合は空腹時のみ
          const HUNGER_THRESHOLD = 70;
          if (creature.energy < HUNGER_THRESHOLD) {
            const hungerFactor = Math.max(0.5, (100 - creature.energy) / 100);
            const chaseForce =
              hungerFactor * program.aggressiveness * closenessFactor * 1.2;
            forceX += dirX * chaseForce;
            forceY += dirY * chaseForce;

            if (distance < nearestPreyDist) {
              nearestPreyDist = distance;
              nearestPreyX = dirX;
              nearestPreyY = dirY;
            }
          }
        }
      } else {
        // 捕食関係なし - 通常の行動
        let neutralForce = program.approachEnemy * closenessFactor * 0.3;
        forceX += dirX * neutralForce;
        forceY += dirY * neutralForce;
      }
    }
  }

  // ===== 群れの中心に向かう力（レッドとグリーンは除外、ブルーは弱めに） =====
  if (allyCount > 0 && program.approachAlly > 0 && myTier === "predator") {
    allyCenterX /= allyCount;
    allyCenterY /= allyCount;

    const toCenterX = allyCenterX - creature.position.x;
    const toCenterY = allyCenterY - creature.position.y;
    const toCenterDist = Math.sqrt(
      toCenterX * toCenterX + toCenterY * toCenterY
    );

    // ブルー系は群れの中心への引力を弱くして、あまり密集しないようにする
    if (toCenterDist > 50) {
      // 距離を50に増加（元は30）
      const cohesionForce = program.approachAlly * 0.15; // 力を半分に減少（元は0.3）
      forceX += (toCenterX / toCenterDist) * cohesionForce;
      forceY += (toCenterY / toCenterDist) * cohesionForce;
    }
  }

  // ===== 縄張り意識（ブルー系のみ） =====
  if (
    program.territoriality > 0.3 &&
    creature.homePosition &&
    myTier === "predator"
  ) {
    const territoryDx = creature.homePosition.x - creature.position.x;
    const territoryDy = creature.homePosition.y - creature.position.y;
    const territoryDistance = Math.sqrt(
      territoryDx * territoryDx + territoryDy * territoryDy
    );

    const territoryRadius = 100 + (1 - program.territoriality) * 150;
    if (territoryDistance > territoryRadius) {
      const overflowRatio =
        (territoryDistance - territoryRadius) / territoryRadius;
      const territoryForce = program.territoriality * overflowRatio * 0.4;
      forceX += (territoryDx / territoryDistance) * territoryForce;
      forceY += (territoryDy / territoryDistance) * territoryForce;
    }
  }

  // ===== 好奇心によるランダム移動（獲物がいない時） =====
  if (program.curiosity > 0.2 && nearestPreyDist === Infinity) {
    if (Math.random() < program.curiosity * 0.1) {
      const randomAngle = Math.random() * Math.PI * 2;
      forceX += Math.cos(randomAngle) * program.curiosity * 0.5;
      forceY += Math.sin(randomAngle) * program.curiosity * 0.5;
    }
  }

  // ===== 脅威からの緊急逃走（近くに捕食者がいる場合） =====
  if (nearestThreatDist < 60) {
    const urgencyFactor = (60 - nearestThreatDist) / 60;
    forceX -= nearestThreatX * urgencyFactor * 1.5;
    forceY -= nearestThreatY * urgencyFactor * 1.5;
  }

  // ===== 境界回避 =====
  const borderMargin = 40;
  const borderForce = 0.15;

  if (creature.position.x < borderMargin) {
    forceX += (borderMargin - creature.position.x) * borderForce;
  }
  if (creature.position.x > canvasWidth - borderMargin) {
    forceX -=
      (creature.position.x - (canvasWidth - borderMargin)) * borderForce;
  }
  if (creature.position.y < borderMargin) {
    forceY += (borderMargin - creature.position.y) * borderForce;
  }
  if (creature.position.y > canvasHeight - borderMargin) {
    forceY -=
      (creature.position.y - (canvasHeight - borderMargin)) * borderForce;
  }

  // ===== 障害物回避 =====
  const obstacleAwareness = program.obstacleAwareness ?? 0.5;
  const obstacleStrategy = program.obstacleStrategy ?? "avoid";

  if (obstacleStrategy !== "ignore") {
    for (const obstacle of obstacles) {
      const obstacleCenterX = obstacle.position.x + obstacle.width / 2;
      const obstacleCenterY = obstacle.position.y + obstacle.height / 2;

      const dx = creature.position.x - obstacleCenterX;
      const dy = creature.position.y - obstacleCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 障害物の最大サイズを考慮した検知距離
      const obstacleRadius = Math.max(obstacle.width, obstacle.height) / 2;
      const detectionDistance = obstacleRadius + 50 + obstacleAwareness * 50;

      if (distance < detectionDistance && distance > 0) {
        const avoidStrength =
          ((detectionDistance - distance) / detectionDistance) *
          obstacleAwareness *
          0.8;

        if (obstacleStrategy === "use-as-cover" && nearestThreatDist < 100) {
          // 脅威がいる時は障害物に隠れる
          const threatDirX = nearestThreatX;
          const threatDirY = nearestThreatY;

          // 障害物を脅威との間に置くように動く
          const coverX = obstacleCenterX - threatDirX * obstacleRadius * 1.5;
          const coverY = obstacleCenterY - threatDirY * obstacleRadius * 1.5;
          const toCoverX = coverX - creature.position.x;
          const toCoverY = coverY - creature.position.y;
          const toCoverDist = Math.sqrt(
            toCoverX * toCoverX + toCoverY * toCoverY
          );

          if (toCoverDist > 10) {
            forceX += (toCoverX / toCoverDist) * avoidStrength * 0.5;
            forceY += (toCoverY / toCoverDist) * avoidStrength * 0.5;
          }
        } else {
          // 通常は障害物を避ける
          forceX += (dx / distance) * avoidStrength;
          forceY += (dy / distance) * avoidStrength;
        }
      }
    }
  }

  // ===== 最小移動量の保証（方向を保持して一定方向に動く） =====
  const forceMagnitude = Math.sqrt(forceX * forceX + forceY * forceY);
  if (forceMagnitude < 0.3) {
    // 現在の移動方向を基準に、少しずつ方向を変える
    const currentAngle =
      creature.wanderAngle ||
      Math.atan2(creature.velocity.y, creature.velocity.x) ||
      Math.random() * Math.PI * 2;
    // 方向変化率はランダム（-0.1 ～ +0.1 ラジアン）
    const angleChange = (Math.random() - 0.5) * 0.2;
    const newAngle = currentAngle + angleChange;
    const driftStrength = 0.25 + Math.random() * 0.1;
    forceX += Math.cos(newAngle) * driftStrength;
    forceY += Math.sin(newAngle) * driftStrength;
  }

  // ===== 速度制限 =====
  const finalMagnitude = Math.sqrt(forceX * forceX + forceY * forceY);
  if (finalMagnitude > baseSpeed) {
    forceX = (forceX / finalMagnitude) * baseSpeed;
    forceY = (forceY / finalMagnitude) * baseSpeed;
  }

  return { x: forceX, y: forceY };
}

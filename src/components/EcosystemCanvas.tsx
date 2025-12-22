import { useEffect, useRef, useState } from "react";
import { Creature, Plant, getFoodChainTier } from "../types/creature";
import CreatureSVG from "./CreatureSVG";
import {
  checkCollision,
  handleCombat,
  canReproduce,
  reproduce,
  checkVictory,
  checkPlantCollision,
  eatPlant,
  createInitialPlants,
  updatePlants,
  canSelfReproduce,
  selfReproduce,
} from "../utils/ecosystemSimulation";
import { calculateIntelligentMovement } from "../utils/intelligentMovement";
import "./EcosystemCanvas.css";

interface EcosystemCanvasProps {
  creatures: Creature[];
  onCreatureUpdate: (creatures: Creature[]) => void;
}

const INITIAL_PLANT_COUNT = 30;
const MAX_PLANTS = 50;
const HUNGER_RATE = 0.015; // 空腹によるエネルギー減少率（ゆっくり）

const EcosystemCanvas = ({
  creatures,
  onCreatureUpdate,
}: EcosystemCanvasProps) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [newArrival, setNewArrival] = useState<Creature | null>(null);
  const [victoryInfo, setVictoryInfo] = useState<{
    hasWinner: boolean;
    winner: string | null;
  }>({ hasWinner: false, winner: null });
  const plantsRef = useRef<Plant[]>([]);
  const creaturesRef = useRef<Creature[]>(creatures);
  const onCreatureUpdateRef = useRef(onCreatureUpdate);

  // refを最新に保つ
  useEffect(() => {
    creaturesRef.current = creatures;
  }, [creatures]);

  useEffect(() => {
    onCreatureUpdateRef.current = onCreatureUpdate;
  }, [onCreatureUpdate]);

  // 植物の初期化
  useEffect(() => {
    if (canvasRef.current && plants.length === 0) {
      const initialPlants = createInitialPlants(
        INITIAL_PLANT_COUNT,
        canvasRef.current.clientWidth,
        canvasRef.current.clientHeight
      );
      setPlants(initialPlants);
      plantsRef.current = initialPlants;
    }
  }, [canvasRef.current]);

  // 新着生物の検出
  useEffect(() => {
    const newCreature = creatures.find((c) => c.isNewArrival);
    if (newCreature) {
      setNewArrival(newCreature);
      setTimeout(() => {
        setNewArrival(null);
        onCreatureUpdate(
          creatures.map((c) =>
            c.id === newCreature.id ? { ...c, isNewArrival: false } : c
          )
        );
      }, 3000);
    }
  }, [creatures.length]);

  // シミュレーションループ
  useEffect(() => {
    const simulate = () => {
      if (!canvasRef.current) return;

      const canvasWidth = canvasRef.current.clientWidth;
      const canvasHeight = canvasRef.current.clientHeight;

      // refから最新の値を取得
      const currentCreatures = creaturesRef.current;

      // 植物の更新
      let currentPlants = updatePlants(
        plantsRef.current,
        canvasWidth,
        canvasHeight,
        MAX_PLANTS
      );

      let updatedCreatures = currentCreatures.map((creature) => {
        // 動作プログラムに基づいた知的移動を計算
        const intelligentForce = calculateIntelligentMovement(
          creature,
          currentCreatures,
          currentPlants,
          canvasWidth,
          canvasHeight
        );

        // 速度を更新（知的移動 + 現在の速度の慣性）- ゆっくり動く
        let newVelocityX = creature.velocity.x * 0.9 + intelligentForce.x * 0.2;
        let newVelocityY = creature.velocity.y * 0.9 + intelligentForce.y * 0.2;

        // 最大速度制限（さらに遅く）
        const maxSpeed = creature.attributes.speed * 0.15;
        const currentSpeed = Math.sqrt(newVelocityX ** 2 + newVelocityY ** 2);
        if (currentSpeed > maxSpeed) {
          newVelocityX = (newVelocityX / currentSpeed) * maxSpeed;
          newVelocityY = (newVelocityY / currentSpeed) * maxSpeed;
        }

        // 位置を更新
        let newX = creature.position.x + newVelocityX;
        let newY = creature.position.y + newVelocityY;

        // 境界判定 - 端に到達したら逆サイドからワープ
        const margin = 10;
        if (newX < -margin) {
          newX = canvasWidth + margin;
        } else if (newX > canvasWidth + margin) {
          newX = -margin;
        }

        if (newY < -margin) {
          newY = canvasHeight + margin;
        } else if (newY > canvasHeight + margin) {
          newY = -margin;
        }

        // 食物連鎖に基づく空腹処理
        const tier = getFoodChainTier(creature.species);
        let hungerPenalty = 0;

        // 草食以外は食べないとエネルギーが減る
        if (tier !== "herbivore") {
          hungerPenalty = HUNGER_RATE;
        }

        // 年齢の増加
        const newAge = creature.age + 1;

        // 繁殖クールダウン
        const newReproductionCooldown = Math.max(
          0,
          creature.reproductionCooldown - 1
        );

        // 移動方向角度を更新（速度から計算、急激な変化を防ぐ）
        const speed = Math.sqrt(newVelocityX ** 2 + newVelocityY ** 2);
        let newWanderAngle = creature.wanderAngle ?? 0;
        if (speed > 0.05) {
          // 十分な速度がある時のみ方向を更新
          const targetAngle = Math.atan2(newVelocityY, newVelocityX);
          // 角度をなめらかに補間（急な変化を防ぐ）
          let angleDiff = targetAngle - newWanderAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          newWanderAngle = newWanderAngle + angleDiff * 0.1;
        }

        return {
          ...creature,
          position: { x: newX, y: newY },
          velocity: { x: newVelocityX, y: newVelocityY },
          energy: Math.max(0, creature.energy - hungerPenalty),
          age: newAge,
          reproductionCooldown: newReproductionCooldown,
          wanderAngle: newWanderAngle,
        };
      });

      // 植物との衝突判定（草食動物が植物を食べる）
      for (let i = 0; i < updatedCreatures.length; i++) {
        const creature = updatedCreatures[i];

        for (let j = 0; j < currentPlants.length; j++) {
          const plant = currentPlants[j];

          if (!plant.isConsumed && checkPlantCollision(creature, plant)) {
            const result = eatPlant(creature, plant);

            if (result.canEat) {
              // 植物を食べた
              updatedCreatures[i] = {
                ...updatedCreatures[i],
                energy: Math.min(
                  100,
                  updatedCreatures[i].energy + result.energyGain
                ),
              };
              currentPlants[j] = {
                ...plant,
                isConsumed: true,
                regrowthTimer: 0,
              };
            }
          }
        }
      }

      // 衝突判定と戦闘・繁殖・捕食
      const newBabies: Creature[] = [];

      for (let i = 0; i < updatedCreatures.length; i++) {
        for (let j = i + 1; j < updatedCreatures.length; j++) {
          const c1 = updatedCreatures[i];
          const c2 = updatedCreatures[j];

          if (checkCollision(c1, c2)) {
            // 同じ種族なら繁殖を試みる（レッド系の共食い以外）
            if (canReproduce(c1, c2)) {
              const baby = reproduce(c1, c2, canvasWidth, canvasHeight);
              newBabies.push(baby);

              // 繁殖履歴を更新
              const c1History = { ...c1.reproductionHistory };
              c1History[c2.id] = (c1History[c2.id] || 0) + 1;
              const c2History = { ...c2.reproductionHistory };
              c2History[c1.id] = (c2History[c1.id] || 0) + 1;

              updatedCreatures[i] = {
                ...c1,
                energy: c1.energy - 20,
                reproductionCooldown: 300,
                reproductionHistory: c1History,
              };
              updatedCreatures[j] = {
                ...c2,
                energy: c2.energy - 20,
                reproductionCooldown: 300,
                reproductionHistory: c2History,
              };
            } else {
              // 戦闘・捕食処理
              const { c1Damage, c2Damage, c1EnergyGain, c2EnergyGain } =
                handleCombat(c1, c2);

              updatedCreatures[i] = {
                ...c1,
                energy: Math.min(
                  100,
                  Math.max(0, c1.energy - c1Damage + c1EnergyGain)
                ),
              };
              updatedCreatures[j] = {
                ...c2,
                energy: Math.min(
                  100,
                  Math.max(0, c2.energy - c2Damage + c2EnergyGain)
                ),
              };

              // 衝突で少し離す
              const dx = c2.position.x - c1.position.x;
              const dy = c2.position.y - c1.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const pushForce = 2;

              updatedCreatures[i] = {
                ...updatedCreatures[i],
                velocity: {
                  x: updatedCreatures[i].velocity.x - (dx / dist) * pushForce,
                  y: updatedCreatures[i].velocity.y - (dy / dist) * pushForce,
                },
              };
              updatedCreatures[j] = {
                ...updatedCreatures[j],
                velocity: {
                  x: updatedCreatures[j].velocity.x + (dx / dist) * pushForce,
                  y: updatedCreatures[j].velocity.y + (dy / dist) * pushForce,
                },
              };
            }
          }
        }
      }

      // エネルギーが0の生物を除去
      updatedCreatures = updatedCreatures.filter((c) => c.energy > 0);

      // グリーン系の単独繁殖（分裂）チェック
      for (let i = 0; i < updatedCreatures.length; i++) {
        const creature = updatedCreatures[i];
        if (canSelfReproduce(creature)) {
          const offspring = selfReproduce(creature, canvasWidth, canvasHeight);
          newBabies.push(offspring);

          // 親のエネルギーとクールダウンを更新
          updatedCreatures[i] = {
            ...creature,
            energy: creature.energy - 25,
            reproductionCooldown: 500,
          };
        }
      }

      // 新しく生まれた生物を追加
      updatedCreatures = [...updatedCreatures, ...newBabies];

      // 植物を更新
      plantsRef.current = currentPlants;
      setPlants(currentPlants);

      // 勝利判定
      const victory = checkVictory(updatedCreatures);
      setVictoryInfo(victory);

      onCreatureUpdateRef.current(updatedCreatures);
      animationFrameRef.current = requestAnimationFrame(simulate);
    };

    animationFrameRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []); // 依存配列を空にして一度だけ実行

  // 種族ごとの数を集計
  const speciesCount = creatures.reduce((acc, creature) => {
    acc[creature.species] = (acc[creature.species] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 植物の数を集計
  const activePlantCount = plants.filter((p) => !p.isConsumed).length;

  return (
    <div className="ecosystem-canvas" ref={canvasRef}>
      <svg className="ecosystem-svg" width="100%" height="100%">
        {/* グリッド背景 */}
        <defs>
          <pattern
            id="grid"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="rgba(100, 116, 139, 0.1)"
              strokeWidth="1"
            />
          </pattern>
          {/* 植物のグラデーション */}
          <radialGradient id="plantGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#16a34a" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* 植物を描画 */}
        {plants
          .filter((p) => !p.isConsumed)
          .map((plant) => (
            <g key={plant.id}>
              <circle
                cx={plant.position.x}
                cy={plant.position.y}
                r={plant.size}
                fill="url(#plantGradient)"
                opacity={0.8}
              />
              <circle
                cx={plant.position.x}
                cy={plant.position.y}
                r={plant.size * 0.5}
                fill="#86efac"
                opacity={0.6}
              />
            </g>
          ))}

        {/* 生物を描画 */}
        {creatures.map((creature) => (
          <CreatureSVG key={creature.id} creature={creature} />
        ))}
      </svg>

      {/* オーバーレイ情報 */}
      <div className="canvas-overlay">
        <div className="stats-panel">
          <div className="stat-item">
            <span className="stat-label">生物数:</span>
            <span className="stat-value">{creatures.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">種族数:</span>
            <span className="stat-value">
              {Object.keys(speciesCount).length}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">🌿 植物:</span>
            <span className="stat-value">{activePlantCount}</span>
          </div>
        </div>

        {/* 種族別カウント */}
        <div className="species-panel">
          {Object.entries(speciesCount).map(([species, count]) => {
            const tier = getFoodChainTier(species);
            const tierIcon =
              tier === "herbivore" ? "🌿" : tier === "predator" ? "🔵" : "🔴";
            return (
              <div key={species} className="species-item">
                <span className="species-name">
                  {tierIcon} {species}
                </span>
                <span className="species-count">{count}</span>
              </div>
            );
          })}
        </div>

        {/* 食物連鎖の説明 */}
        <div className="food-chain-legend">
          <div className="legend-title">食物連鎖</div>
          <div className="legend-item">
            🔴 レッド → 🔵 ブルー → 🌿 グリーン → 🌱 植物
          </div>
        </div>

        {/* 外来種登場アラート */}
        {newArrival && (
          <div className="new-arrival-alert">
            <div className="alert-icon">⚠️</div>
            <div className="alert-content">
              <h3>外来種が侵入！</h3>
              <p>
                <strong>{newArrival.name}</strong> ({newArrival.species})
              </p>
              <p className="alert-message">{newArrival.comment}</p>
            </div>
          </div>
        )}

        {/* 勝利表示 */}
        {victoryInfo.hasWinner && (
          <div className="victory-overlay">
            <div className="victory-content">
              <h1>🏆 勝利！ 🏆</h1>
              <h2>{victoryInfo.winner} の生態系が支配しました！</h2>
              <p>全ての競争相手を打ち負かしました</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EcosystemCanvas;

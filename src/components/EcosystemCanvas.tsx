import { useEffect, useRef, useState } from "react";
import { Creature, Plant, Obstacle, getFoodChainTier } from "../types/creature";
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
  canSplit,
  split,
  createRandomObstacles,
  checkObstacleCollision,
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
const RED_HUNGER_RATE = 0.018; // レッド族の追加減少率（寿命20%短縮）
const REPLENISH_COOLDOWN = 300; // 補充のクールダウン（フレーム数、約5秒）
const RED_REPLENISH_INTERVAL = 36000; // レッド族補充間隔（10分 = 600秒 = 36000フレーム）

interface PointNotification {
  id: string;
  x: number;
  y: number;
  amount: number;
  createdAt: number;
}

const EcosystemCanvas = ({
  creatures,
  onCreatureUpdate,
}: EcosystemCanvasProps) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [newArrival, setNewArrival] = useState<Creature | null>(null);
  const [victoryInfo, setVictoryInfo] = useState<{
    hasWinner: boolean;
    winner: string | null;
  }>({ hasWinner: false, winner: null });
  const [pointNotifications, setPointNotifications] = useState<
    PointNotification[]
  >([]);
  const plantsRef = useRef<Plant[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const creaturesRef = useRef<Creature[]>(creatures);
  const onCreatureUpdateRef = useRef(onCreatureUpdate);
  const replenishCooldownRef = useRef<{ red: number; green: number }>({
    red: 0,
    green: 0,
  });

  // refを最新に保つ（外部からの追加も反映）
  useEffect(() => {
    // 現在のrefのIDセット
    const currentIds = new Set(creaturesRef.current.map((c) => c.id));
    // 外部から渡されたcreaturesのIDセット
    const externalIds = new Set(creatures.map((c) => c.id));

    // 新しい生物（refにないが外部から渡された）
    const newCreatures = creatures.filter((c) => !currentIds.has(c.id));

    // 削除された生物（refにあるが外部から渡されない）を除外したリスト
    const survivingCreatures = creaturesRef.current.filter((c) =>
      externalIds.has(c.id)
    );

    if (newCreatures.length > 0) {
      // 新しい生物を追加
      creaturesRef.current = [...survivingCreatures, ...newCreatures];
      console.log(
        `Added ${newCreatures.length} new creatures from external source`
      );
    } else if (survivingCreatures.length !== creaturesRef.current.length) {
      // 削除のみ
      creaturesRef.current = survivingCreatures;
    }
    // それ以外の場合（位置更新など内部変更）はrefを保持
  }, [creatures]);

  useEffect(() => {
    onCreatureUpdateRef.current = onCreatureUpdate;
  }, [onCreatureUpdate]);

  // 植物と障害物の初期化
  useEffect(() => {
    if (canvasRef.current) {
      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;
      if (width > 0 && height > 0) {
        // 植物の初期化
        if (plantsRef.current.length === 0) {
          const initialPlants = createInitialPlants(
            INITIAL_PLANT_COUNT,
            width,
            height
          );
          setPlants(initialPlants);
          plantsRef.current = initialPlants;
          console.log(`Initialized ${initialPlants.length} plants`);
        }
        // 障害物の初期化
        if (obstaclesRef.current.length === 0) {
          const initialObstacles = createRandomObstacles(
            5 + Math.floor(Math.random() * 4),
            width,
            height
          );
          setObstacles(initialObstacles);
          obstaclesRef.current = initialObstacles;
          console.log(
            `Initialized ${initialObstacles.length} obstacles (sync)`
          );
        }
      }
    }
  }, []);

  // canvasがマウントされた後に植物と障害物を初期化（遅延）
  useEffect(() => {
    const checkAndInitPlants = () => {
      if (canvasRef.current) {
        const width = canvasRef.current.clientWidth;
        const height = canvasRef.current.clientHeight;
        if (width > 0 && height > 0) {
          // 植物の初期化（まだない場合）
          if (plantsRef.current.length === 0) {
            const initialPlants = createInitialPlants(
              INITIAL_PLANT_COUNT,
              width,
              height
            );
            setPlants(initialPlants);
            plantsRef.current = initialPlants;
            console.log(`Initialized ${initialPlants.length} plants (delayed)`);
          }

          // 障害物を初期化（まだない場合）
          if (obstaclesRef.current.length === 0) {
            const initialObstacles = createRandomObstacles(
              5 + Math.floor(Math.random() * 4),
              width,
              height
            );
            setObstacles(initialObstacles);
            obstaclesRef.current = initialObstacles;
            console.log(`Initialized ${initialObstacles.length} obstacles`);
          }
        }
      }
    };
    // 少し遅延させて確実にcanvasが描画された後に実行
    const timer = setTimeout(checkAndInitPlants, 100);
    return () => clearTimeout(timer);
  }, []);

  // 新着生物の検出（ユーザー生成のみ、システム補充は除外）
  const lastCreatureIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // 初回は既存のクリーチャーIDで初期化（新着アラートを出さない）
    if (lastCreatureIdsRef.current === null) {
      lastCreatureIdsRef.current = new Set(creatures.map((c) => c.id));
      return;
    }

    const currentIds = new Set(creatures.map((c) => c.id));

    // 新しく追加された生物を検出
    const newCreatures = creatures.filter(
      (c) =>
        !lastCreatureIdsRef.current!.has(c.id) &&
        c.isNewArrival &&
        c.author !== "システム" &&
        c.author !== "system" &&
        c.author !== "System"
    );

    if (newCreatures.length > 0) {
      const newCreature = newCreatures[0];
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

    lastCreatureIdsRef.current = currentIds;
  }, [creatures]);

  // シミュレーションループ
  useEffect(() => {
    let isRunning = true;
    let frameCount = 0;

    const simulate = () => {
      if (!isRunning) return;

      if (!canvasRef.current) {
        // canvasがまだ準備できていない場合は次フレームで再試行
        animationFrameRef.current = requestAnimationFrame(simulate);
        return;
      }

      const canvasWidth = canvasRef.current.clientWidth;
      const canvasHeight = canvasRef.current.clientHeight;

      // キャンバスサイズが0の場合も再試行
      if (canvasWidth === 0 || canvasHeight === 0) {
        animationFrameRef.current = requestAnimationFrame(simulate);
        return;
      }

      // デバッグ: 最初の数フレームだけログ出力
      frameCount++;
      if (frameCount <= 5 || frameCount % 300 === 0) {
        console.log(
          `Frame ${frameCount}: creatures=${creaturesRef.current.length}, plants=${plantsRef.current.length}`
        );
      }

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
          canvasHeight,
          obstaclesRef.current
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

        // レッド族は体力が自動で減らない（倒されるまで生き続ける）
        // グリーン族は植物を食べないと体力が減る仕組みなし（分裂ベース）
        // 中間捕食者のみ空腹処理
        if (tier === "predator") {
          hungerPenalty = HUNGER_RATE;
        }

        // 年齢の増加
        const newAge = creature.age + 1;

        // 繁殖クールダウン
        const newReproductionCooldown = Math.max(
          0,
          creature.reproductionCooldown - 1
        );

        // 分裂クールダウン
        const newSplitCooldown = Math.max(0, creature.splitCooldown - 1);

        // 生存ポイントの計算（10秒 = 600フレーム）
        const newSurvivalFrames = (creature.survivalFrames || 0) + 1;
        const survivalPointsToAdd =
          Math.floor(newSurvivalFrames / 600) -
          Math.floor((creature.survivalFrames || 0) / 600);
        const newSurvivalPoints =
          (creature.survivalPoints || 0) + survivalPointsToAdd;

        // 生存ポイント獲得時に通知を生成
        if (survivalPointsToAdd > 0) {
          setPointNotifications((prev) => [
            ...prev,
            {
              id: `survival-${creature.id}-${Date.now()}`,
              x: creature.position.x,
              y: creature.position.y,
              amount: survivalPointsToAdd,
              createdAt: Date.now(),
            },
          ]);
        }

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
          splitCooldown: newSplitCooldown,
          wanderAngle: newWanderAngle,
          survivalFrames: newSurvivalFrames,
          survivalPoints: newSurvivalPoints,
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
              // 植物を食べた（エネルギーと植物ポイントを獲得）
              updatedCreatures[i] = {
                ...updatedCreatures[i],
                energy: Math.min(
                  100,
                  updatedCreatures[i].energy + result.energyGain
                ),
                plantPoints:
                  updatedCreatures[i].plantPoints + result.plantPointsGain,
              };
              currentPlants[j] = {
                ...plant,
                isConsumed: true,
                regrowthTimer: 0,
              };

              // 植物ポイント獲得時に通知を生成
              if (result.plantPointsGain > 0) {
                setPointNotifications((prev) => [
                  ...prev,
                  {
                    id: `plant-${creature.id}-${Date.now()}`,
                    x: creature.position.x,
                    y: creature.position.y,
                    amount: result.plantPointsGain,
                    createdAt: Date.now(),
                  },
                ]);
              }
            }
          }
        }
      }

      // 障害物との衝突判定
      for (let i = 0; i < updatedCreatures.length; i++) {
        let creature = updatedCreatures[i];

        for (const obstacle of obstaclesRef.current) {
          const collision = checkObstacleCollision(creature, obstacle);
          if (collision.collides) {
            // 押し戻す
            creature = {
              ...creature,
              position: {
                x: creature.position.x + collision.pushX,
                y: creature.position.y + collision.pushY,
              },
              velocity: {
                // 衝突した方向の速度を反転
                x:
                  collision.pushX !== 0
                    ? -creature.velocity.x * 0.5
                    : creature.velocity.x,
                y:
                  collision.pushY !== 0
                    ? -creature.velocity.y * 0.5
                    : creature.velocity.y,
              },
            };
          }
        }

        updatedCreatures[i] = creature;
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

      // グリーンの分裂チェック（植物ポイントベース）
      for (let i = 0; i < updatedCreatures.length; i++) {
        const creature = updatedCreatures[i];
        if (canSplit(creature)) {
          const result = split(creature, canvasWidth, canvasHeight);
          newBabies.push(result.clone);

          // 親を更新（ポイント消費、エネルギー消費、クールダウン）
          updatedCreatures[i] = result.updatedParent;
        }
      }

      // 新しく生まれた生物を追加
      updatedCreatures = [...updatedCreatures, ...newBabies];

      // クールダウンを減らす
      if (replenishCooldownRef.current.red > 0) {
        replenishCooldownRef.current.red--;
      }
      if (replenishCooldownRef.current.green > 0) {
        replenishCooldownRef.current.green--;
      }

      // 自動補充システム（一定数を下回ったら追加）
      const MIN_RED_COUNT = 3; // レッド族の最小数を3体に変更
      const MIN_GREEN_COUNT = 3;

      const redCount = updatedCreatures.filter(
        (c) => c.species.includes("レッド") || c.species.includes("red")
      ).length;
      const greenCount = updatedCreatures.filter(
        (c) => c.species.includes("グリーン") || c.species.includes("green")
      ).length;

      // レッド族の自動補充（10分に1回、1体だけ補充）
      if (redCount < MIN_RED_COUNT && replenishCooldownRef.current.red === 0) {
        const needed = 1; // 1体だけ補充
        console.log(`Replenishing ${needed} Red creature (10min interval)...`);
        replenishCooldownRef.current.red = RED_REPLENISH_INTERVAL; // 10分間隔
        fetch("http://localhost:3001/api/creature/generate-red", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: needed }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              console.log(`Successfully replenished Red:`, data.creatures);
            }
          })
          .catch((err) => console.error("Failed to auto-replenish Red:", err));
      }

      // グリーン族の自動補充（クールダウン付き）
      if (
        greenCount < MIN_GREEN_COUNT &&
        replenishCooldownRef.current.green === 0
      ) {
        const needed = MIN_GREEN_COUNT - greenCount;
        console.log(`Replenishing ${needed} Green creatures...`);
        replenishCooldownRef.current.green = REPLENISH_COOLDOWN;
        fetch("http://localhost:3001/api/creature/generate-green", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: needed }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              console.log(`Successfully replenished Green:`, data.creatures);
            }
          })
          .catch((err) =>
            console.error("Failed to auto-replenish Green:", err)
          );
      }

      // 植物を更新
      plantsRef.current = currentPlants;
      setPlants(currentPlants);

      // 勝利判定
      const victory = checkVictory(updatedCreatures);
      setVictoryInfo(victory);

      // ポイント通知のクリーンアップ（2秒後に削除）
      const now = Date.now();
      setPointNotifications((prev) =>
        prev.filter((n) => now - n.createdAt < 2000)
      );

      // 重要: 更新されたcreaturesをrefに保存（次のフレームで使用）
      creaturesRef.current = updatedCreatures;

      onCreatureUpdateRef.current(updatedCreatures);
      animationFrameRef.current = requestAnimationFrame(simulate);
    };

    // シミュレーション開始
    console.log("Starting simulation loop...");
    animationFrameRef.current = requestAnimationFrame(simulate);

    return () => {
      isRunning = false;
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

        {/* 障害物を描画 */}
        {obstacles.map((obstacle) => (
          <g key={obstacle.id}>
            <rect
              x={obstacle.position.x}
              y={obstacle.position.y}
              width={obstacle.width}
              height={obstacle.height}
              fill={
                obstacle.type === "wall"
                  ? "#6b7280"
                  : obstacle.type === "rock"
                  ? "#78716c"
                  : "#3f6212"
              }
              stroke={
                obstacle.type === "wall"
                  ? "#4b5563"
                  : obstacle.type === "rock"
                  ? "#57534e"
                  : "#365314"
              }
              strokeWidth={2}
              rx={
                obstacle.type === "rock" ? 8 : obstacle.type === "tree" ? 4 : 2
              }
              opacity={0.9}
            />
            {/* 障害物のハイライト */}
            <rect
              x={obstacle.position.x + 3}
              y={obstacle.position.y + 3}
              width={obstacle.width - 6}
              height={obstacle.height * 0.3}
              fill="rgba(255,255,255,0.15)"
              rx={obstacle.type === "rock" ? 6 : 2}
            />
          </g>
        ))}

        {/* 生物を描画 */}
        {creatures.map((creature) => (
          <CreatureSVG key={creature.id} creature={creature} />
        ))}

        {/* ポイント獲得通知を描画 */}
        {pointNotifications.map((notification) => {
          const age = Date.now() - notification.createdAt;
          const opacity = Math.max(0, 1 - age / 2000); // 2秒でフェードアウト
          const yOffset = -(age / 20); // 上に浮き上がる
          return (
            <text
              key={notification.id}
              x={notification.x}
              y={notification.y + yOffset}
              fill="#4ade80"
              fontSize="16"
              fontWeight="bold"
              textAnchor="middle"
              opacity={opacity}
              style={{ pointerEvents: "none" }}
            >
              +{notification.amount}
            </text>
          );
        })}
      </svg>

      {/* オーバーレイ情報（シンプルにまとめ） */}
      <div className="canvas-overlay">
        {/* コンパクトなステータスバー */}
        <div className="compact-status">
          <span>
            <span className="icon icon-creature"></span> {creatures.length}
          </span>
          <span>
            <span className="icon icon-leaf"></span> {activePlantCount}
          </span>
          {Object.entries(speciesCount).map(([species, count]) => {
            const isRed = species.includes("レッド") || species.includes("red");
            return (
              <span
                key={species}
                className={isRed ? "red-count" : "green-count"}
              >
                {isRed ? (
                  <span className="icon icon-red"></span>
                ) : (
                  <span className="icon icon-green"></span>
                )}{" "}
                {count}
              </span>
            );
          })}
        </div>

        {/* 外来種登場アラート */}
        {newArrival && (
          <div className="new-arrival-alert">
            <div className="alert-icon">
              <span className="icon icon-alert icon-xl"></span>
            </div>
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
              <h1>
                <span className="icon icon-trophy icon-xl"></span> 勝利！
              </h1>
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

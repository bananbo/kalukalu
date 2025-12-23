import { useEffect, useRef, useState } from "react";
import {
  Creature,
  Plant,
  Obstacle,
  getFoodChainTier,
  getSpeciesType,
  isInFieldOfView,
} from "../types/creature";
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
  findSafeSpawnPosition,
} from "../utils/ecosystemSimulation";
import { calculateIntelligentMovement } from "../utils/intelligentMovement";
import SoundManager from "../utils/SoundManager";
import "./EcosystemCanvas.css";

interface EcosystemCanvasProps {
  creatures: Creature[];
  onCreatureUpdate: (creatures: Creature[]) => void;
}

const INITIAL_PLANT_COUNT = 30;
const MAX_PLANTS = 50;
const HUNGER_RATE = 0.015; // 空腹によるエネルギー減少率（ゆっくり）
const REPLENISH_COOLDOWN = 300; // 補充のクールダウン（フレーム数、約5秒）
const RED_REPLENISH_INTERVAL = 36000; // レッド族補充間隔（10分 = 600秒 = 36000フレーム）
const RED_SPAWN_WHEN_GREEN_MANY = 1800; // グリーンが多い時のレッド追加間隔（30秒）
const GREEN_THRESHOLD_FOR_RED_SPAWN = 6; // この数以上でレッド追加

interface PointNotification {
  id: string;
  x: number;
  y: number;
  amount: number;
  createdAt: number;
}

// 消滅アニメーション中のキャラクター
interface DyingCreature {
  creature: Creature;
  dieAt: number;
}

// 登場アニメーション中のキャラクターID
type SpawningCreatureId = string;

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
  const [dyingCreatures, setDyingCreatures] = useState<DyingCreature[]>([]);
  const [spawningIds, setSpawningIds] = useState<Set<SpawningCreatureId>>(
    new Set()
  );
  const plantsRef = useRef<Plant[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const creaturesRef = useRef<Creature[]>(creatures);
  const onCreatureUpdateRef = useRef(onCreatureUpdate);
  const replenishCooldownRef = useRef<{ red: number; green: number }>({
    red: 0,
    green: 0,
  });
  const frameCountRef = useRef<number>(0);
  const soundManager = useRef(SoundManager.getInstance());
  
  // ゲーム再開用の状態
  const [gameOverCountdown, setGameOverCountdown] = useState<number | null>(null);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 行動状態を判定する関数
  const getBehaviorState = (
    creature: Creature,
    allCreatures: Creature[]
  ):
    | "chasing"
    | "fleeing"
    | "eating"
    | "counter"
    | "vulnerable"
    | "retreating"
    | "idle" => {
    const speciesType = getSpeciesType(creature.species);

    // 無防備状態
    if (creature.isVulnerable) {
      return "vulnerable";
    }

    // 撤退中
    if (creature.isRetreating) {
      return "retreating";
    }

    // 反撃中
    if (creature.isCounterAttacking) {
      return "counter";
    }

    // レッド族の場合
    if (speciesType === "red") {
      // 近くにグリーンがいれば追跡中
      const nearbyGreen = allCreatures.find((c) => {
        if (getSpeciesType(c.species) !== "green") return false;
        const dx = c.position.x - creature.position.x;
        const dy = c.position.y - creature.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < (creature.vision?.range || 150);
      });
      if (nearbyGreen) {
        return "chasing";
      }
    }

    // グリーン族の場合
    if (speciesType === "green") {
      // 自分の視野内にレッドがいれば逃走中（障害物による遮蔽を考慮）
      const nearbyRed = allCreatures.find((c) => {
        if (getSpeciesType(c.species) !== "red") return false;
        // 自分の視野内にレッドがいるかチェック
        return isInFieldOfView(
          creature,
          c.position.x,
          c.position.y,
          obstaclesRef.current
        );
      });
      if (nearbyRed) {
        return "fleeing";
      }

      // 追跡中の攻撃者がいれば逃走中（視野外でも）
      if (
        creature.trackedAttackerPos &&
        creature.trackingUntil &&
        frameCountRef.current < creature.trackingUntil
      ) {
        return "fleeing";
      }

      // 植物を食べに行っている（foodGreed が高い場合）
      if (creature.behaviorProgram.foodGreed > 0.5 && creature.energy < 80) {
        return "eating";
      }
    }

    return "idle";
  };

  // refを最新に保つ（外部からの追加も反映）
  useEffect(() => {
    // 現在のrefのIDセット
    const currentIds = new Set(creaturesRef.current.map((c) => c.id));
    // 外部から渡されたcreaturesのIDセット
    const externalIds = new Set(creatures.map((c) => c.id));

    // 新しい生物（refにないが外部から渡された）
    let newCreatures = creatures.filter((c) => !currentIds.has(c.id));

    // 削除された生物（refにあるが外部から渡されない）を除外したリスト
    const survivingCreatures = creaturesRef.current.filter((c) =>
      externalIds.has(c.id)
    );

    if (newCreatures.length > 0) {
      // キャンバスサイズを取得
      const canvasWidth = canvasRef.current?.clientWidth || 800;
      const canvasHeight = canvasRef.current?.clientHeight || 600;

      // 新しい生物に安全な位置を設定（グリーン系と外来種）
      newCreatures = newCreatures.map((creature) => {
        const speciesType = getSpeciesType(creature.species);

        // 外来種（isNewArrival）は画面下中央から登場
        if (creature.isNewArrival) {
          return {
            ...creature,
            position: {
              x: canvasWidth / 2, // 画面中央
              y: canvasHeight - 50, // 画面下端から50px上
            },
          };
        }

        // グリーン系は安全な位置にスポーン
        if (speciesType === "green") {
          const safePosition = findSafeSpawnPosition(
            [...survivingCreatures, ...creaturesRef.current],
            canvasWidth,
            canvasHeight,
            "green"
          );
          return {
            ...creature,
            position: safePosition,
          };
        }
        return creature;
      });

      // 登場アニメーション用にIDを記録
      const newIds = newCreatures.map((c) => c.id);
      setSpawningIds((prev) => new Set([...prev, ...newIds]));

      // 0.6秒後に登場アニメーション終了
      setTimeout(() => {
        setSpawningIds((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 600);

      creaturesRef.current = [...survivingCreatures, ...newCreatures];
      console.log(
        `Added ${newCreatures.length} new creatures from external source (safe spawn)`
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
      frameCountRef.current = frameCount;
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

      let updatedCreatures: Creature[] = currentCreatures.map(
        (creature): Creature => {
          const currentFrame = frameCountRef.current;

          // 撤退状態・無防備状態の回復チェック
          let isRetreating = creature.isRetreating ?? false;
          let isVulnerable = creature.isVulnerable ?? false;
          let vulnerableUntil = creature.vulnerableUntil ?? 0;

          // グリーンの追跡位置更新（視野内にレッドがいれば更新）
          let trackedAttackerPos = creature.trackedAttackerPos;
          let trackingUntil = creature.trackingUntil;
          if (getSpeciesType(creature.species) === "green") {
            const nearbyRed = currentCreatures.find((c) => {
              if (getSpeciesType(c.species) !== "red") return false;
              return isInFieldOfView(
                creature,
                c.position.x,
                c.position.y,
                obstaclesRef.current
              );
            });
            if (nearbyRed) {
              // 視野内にレッドがいたら追跡位置を更新し、追跡期限を延長
              trackedAttackerPos = {
                x: nearbyRed.position.x,
                y: nearbyRed.position.y,
              };
              trackingUntil = currentFrame + 180; // 3秒間追跡継続
            }
          }

          // 無防備状態の終了チェック
          if (isVulnerable && currentFrame > vulnerableUntil) {
            isVulnerable = false;
          }

          // 撤退完了チェック（巣の近くに戻った場合）
          if (isRetreating && creature.homePosition) {
            const dx = creature.homePosition.x - creature.position.x;
            const dy = creature.homePosition.y - creature.position.y;
            const distToHome = Math.sqrt(dx * dx + dy * dy);
            if (distToHome < 20) {
              isRetreating = false;
            }
          }

          // 動作プログラムに基づいた知的移動を計算
          const creatureWithState = {
            ...creature,
            isRetreating,
            isVulnerable,
            vulnerableUntil,
            trackedAttackerPos,
            trackingUntil,
          };
          const intelligentForce = calculateIntelligentMovement(
            creatureWithState,
            currentCreatures,
            currentPlants,
            canvasWidth,
            canvasHeight,
            obstaclesRef.current,
            currentFrame
          );

          // 速度を更新（知的移動 + 現在の速度の慣性）- ゆっくり動く
          let newVelocityX =
            creature.velocity.x * 0.9 + intelligentForce.x * 0.2;
          let newVelocityY =
            creature.velocity.y * 0.9 + intelligentForce.y * 0.2;

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
            // 最大120度（2π/3ラジアン）までの変化に制限
            const maxAngleChange = (Math.PI * 2) / 3; // 120度
            angleDiff = Math.max(
              -maxAngleChange,
              Math.min(maxAngleChange, angleDiff)
            );
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
            isRetreating,
            isVulnerable,
            vulnerableUntil,
            trackedAttackerPos,
            trackingUntil,
          };
        }
      );

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

              // 食事音を再生
              soundManager.current.play("eat", 0.6);

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

              // 繁殖音を再生
              soundManager.current.play("spawn", 0.5);

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

              // グリーンの反撃判定（逃げずに立ち向かっている場合）
              const c1Type = getSpeciesType(c1.species);
              const c2Type = getSpeciesType(c2.species);

              // c1がグリーンでc2がレッドの場合、c1が反撃中かどうか判定
              let c1IsCounterAttacking = false;
              if (c1Type === "green" && c2Type === "red") {
                const counterAttack = c1.behaviorProgram.counterAttack ?? 0.1;
                const bravery = c1.behaviorProgram.bravery ?? 0.5;
                // 反撃傾向が高く、エネルギーがある場合は反撃中
                c1IsCounterAttacking =
                  (counterAttack > 0.3 || bravery > 0.5) && c1.energy > 50;
              }

              // c2がグリーンでc1がレッドの場合、c2が反撃中かどうか判定
              let c2IsCounterAttacking = false;
              if (c2Type === "green" && c1Type === "red") {
                const counterAttack = c2.behaviorProgram.counterAttack ?? 0.1;
                const bravery = c2.behaviorProgram.bravery ?? 0.5;
                c2IsCounterAttacking =
                  (counterAttack > 0.3 || bravery > 0.5) && c2.energy > 50;
              }

              // 反撃状態を設定してからhandleCombatを呼ぶ
              const c1WithState = {
                ...c1,
                isCounterAttacking: c1IsCounterAttacking,
              };
              const c2WithState = {
                ...c2,
                isCounterAttacking: c2IsCounterAttacking,
              };

              const {
                c1Damage,
                c2Damage,
                c1EnergyGain,
                c2EnergyGain,
                c1AttackPoints,
                c2AttackPoints,
                c1WasAttacked,
                c2WasAttacked,
              } = handleCombat(c1WithState, c2WithState);

              // 攻撃音を再生
              if (c1AttackPoints > 0) {
                // c1がバックスタブ成功
                soundManager.current.play("backstab", 0.8);
                if (c1AttackPoints >= 30) {
                  // ポイント獲得音
                  soundManager.current.play("point", 0.5);
                }
              } else if (c2AttackPoints > 0) {
                // c2がバックスタブ成功
                soundManager.current.play("backstab", 0.8);
                if (c2AttackPoints >= 30) {
                  soundManager.current.play("point", 0.5);
                }
              } else if (c1Damage > 0 || c2Damage > 0) {
                // 通常攻撃
                soundManager.current.play("attack", 0.5);
              }

              const currentFrame = frameCountRef.current;

              // c1の更新（攻撃を受けた場合の状態変更を含む）
              let c1Update: Partial<Creature> = {
                energy: Math.min(
                  100,
                  Math.max(0, c1.energy - c1Damage + c1EnergyGain)
                ),
                survivalPoints: c1.survivalPoints + c1AttackPoints,
              };

              if (c1WasAttacked && c1Damage > 0) {
                c1Update.lastAttackedBy = c2.id;
                c1Update.lastAttackedAt = currentFrame;

                // レッドがダメージを受けた場合、体力が50%以下なら撤退して無防備状態に
                if (getSpeciesType(c1.species) === "red") {
                  const newEnergy = c1.energy - c1Damage + c1EnergyGain;
                  if (newEnergy <= 50) {
                    c1Update.isRetreating = true;
                    c1Update.isVulnerable = true;
                    c1Update.vulnerableUntil = currentFrame + 300; // 5秒間無防備
                  }
                }

                // グリーンが攻撃を受けた場合、攻撃者の位置を5秒間追跡
                if (getSpeciesType(c1.species) === "green") {
                  c1Update.trackedAttackerPos = {
                    x: c2.position.x,
                    y: c2.position.y,
                  };
                  c1Update.trackingUntil = currentFrame + 300; // 5秒間追跡
                }
              }

              // c2の更新
              let c2Update: Partial<Creature> = {
                energy: Math.min(
                  100,
                  Math.max(0, c2.energy - c2Damage + c2EnergyGain)
                ),
                survivalPoints: c2.survivalPoints + c2AttackPoints,
              };

              if (c2WasAttacked && c2Damage > 0) {
                c2Update.lastAttackedBy = c1.id;
                c2Update.lastAttackedAt = currentFrame;

                // レッドがダメージを受けた場合、体力が50%以下なら撤退して無防備状態に
                if (getSpeciesType(c2.species) === "red") {
                  const newEnergy = c2.energy - c2Damage + c2EnergyGain;
                  if (newEnergy <= 50) {
                    c2Update.isRetreating = true;
                    c2Update.isVulnerable = true;
                    c2Update.vulnerableUntil = currentFrame + 300; // 5秒間無防備
                  }
                }

                // グリーンが攻撃を受けた場合、攻撃者の位置を5秒間追跡
                if (getSpeciesType(c2.species) === "green") {
                  c2Update.trackedAttackerPos = {
                    x: c1.position.x,
                    y: c1.position.y,
                  };
                  c2Update.trackingUntil = currentFrame + 300; // 5秒間追跡
                }
              }

              updatedCreatures[i] = {
                ...c1,
                ...c1Update,
              };
              updatedCreatures[j] = {
                ...c2,
                ...c2Update,
              };

              // 衝突で少し離す（攻撃を受けた側のみ押し戻す、攻撃者は追跡を継続）
              // ただし、体格が良いグリーンは攻撃者（レッド）を強くはじき返す
              const dx = c2.position.x - c1.position.x;
              const dy = c2.position.y - c1.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const basePushForce = 2;

              // c1が攻撃を受けた場合のみc1を押し戻す（攻撃者c2は追跡継続）
              if (c1WasAttacked && c1Damage > 0) {
                // グリーン(c1)がレッド(c2)から攻撃を受けた場合
                // 体格が良いグリーンはレッドをはじき返す
                const c1Type = getSpeciesType(c1.species);
                const c2Type = getSpeciesType(c2.species);

                if (c1Type === "green" && c2Type === "red") {
                  // グリーンの体格に応じてレッドをはじく（size 1-10 → force 3-15）
                  const knockbackForce = 3 + c1.attributes.size * 1.2;
                  updatedCreatures[j] = {
                    ...updatedCreatures[j],
                    velocity: {
                      x:
                        updatedCreatures[j].velocity.x +
                        (dx / dist) * knockbackForce,
                      y:
                        updatedCreatures[j].velocity.y +
                        (dy / dist) * knockbackForce,
                    },
                  };
                }

                // 攻撃を受けた側も少し押し戻される
                updatedCreatures[i] = {
                  ...updatedCreatures[i],
                  velocity: {
                    x:
                      updatedCreatures[i].velocity.x -
                      (dx / dist) * basePushForce,
                    y:
                      updatedCreatures[i].velocity.y -
                      (dy / dist) * basePushForce,
                  },
                };
              }
              // c2が攻撃を受けた場合のみc2を押し戻す（攻撃者c1は追跡継続）
              if (c2WasAttacked && c2Damage > 0) {
                // グリーン(c2)がレッド(c1)から攻撃を受けた場合
                // 体格が良いグリーンはレッドをはじき返す
                const c1Type = getSpeciesType(c1.species);
                const c2Type = getSpeciesType(c2.species);

                if (c2Type === "green" && c1Type === "red") {
                  // グリーンの体格に応じてレッドをはじく（size 1-10 → force 3-15）
                  const knockbackForce = 3 + c2.attributes.size * 1.2;
                  updatedCreatures[i] = {
                    ...updatedCreatures[i],
                    velocity: {
                      x:
                        updatedCreatures[i].velocity.x -
                        (dx / dist) * knockbackForce,
                      y:
                        updatedCreatures[i].velocity.y -
                        (dy / dist) * knockbackForce,
                    },
                  };
                }

                // 攻撃を受けた側も少し押し戻される
                updatedCreatures[j] = {
                  ...updatedCreatures[j],
                  velocity: {
                    x:
                      updatedCreatures[j].velocity.x +
                      (dx / dist) * basePushForce,
                    y:
                      updatedCreatures[j].velocity.y +
                      (dy / dist) * basePushForce,
                  },
                };
              }
            }
          }
        }
      }

      // エネルギーが0の生物を消滅アニメーション付きで除去
      const deadCreatures = updatedCreatures.filter((c) => c.energy <= 0);
      if (deadCreatures.length > 0) {
        // 死亡音を再生
        soundManager.current.play("death", 0.7);

        // 消滅アニメーション用に追加
        const newDying = deadCreatures.map((c) => ({
          creature: c,
          dieAt: Date.now(),
        }));
        setDyingCreatures((prev) => [...prev, ...newDying]);

        // 0.5秒後に消滅アニメーション終了
        setTimeout(() => {
          setDyingCreatures((prev) =>
            prev.filter(
              (d) => !deadCreatures.some((dc) => dc.id === d.creature.id)
            )
          );
        }, 500);
      }
      updatedCreatures = updatedCreatures.filter((c) => c.energy > 0);

      // グリーンの分裂チェック（植物ポイントベース）
      for (let i = 0; i < updatedCreatures.length; i++) {
        const creature = updatedCreatures[i];
        if (canSplit(creature)) {
          const result = split(creature, canvasWidth, canvasHeight);
          newBabies.push(result.clone);

          // 親を更新（ポイント消費、エネルギー消費、クールダウン）
          updatedCreatures[i] = result.updatedParent;

          // 分裂時にスポーン音を再生
          soundManager.current.play("spawn", 0.6);
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

      // グリーンが多い時（6体以上）、30秒に1回レッドを追加
      if (
        greenCount >= GREEN_THRESHOLD_FOR_RED_SPAWN &&
        replenishCooldownRef.current.red === 0
      ) {
        console.log(
          `Green count (${greenCount}) >= ${GREEN_THRESHOLD_FOR_RED_SPAWN}, spawning new Red...`
        );
        replenishCooldownRef.current.red = RED_SPAWN_WHEN_GREEN_MANY; // 30秒間隔
        fetch("http://localhost:3001/api/creature/generate-red", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 1 }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              console.log(
                `Spawned new Red due to many Greens:`,
                data.creatures
              );
            }
          })
          .catch((err) =>
            console.error("Failed to spawn Red for many Greens:", err)
          );
      }

      // グリーンが3体以下の時、レッドも3体になるまで退場（energy最大のレッドを残す）
      if (greenCount <= MIN_GREEN_COUNT && redCount > MIN_RED_COUNT) {
        // レッド族を取得し、energyの降順でソート
        const redCreatures = updatedCreatures
          .filter(
            (c) => c.species.includes("レッド") || c.species.includes("red")
          )
          .sort((a, b) => b.energy - a.energy);

        // 上位3体のIDを取得
        const redsToKeep = new Set(
          redCreatures.slice(0, MIN_RED_COUNT).map((c) => c.id)
        );

        // 退場するレッドを除外
        const redsToRemove = redCreatures.slice(MIN_RED_COUNT);
        if (redsToRemove.length > 0) {
          console.log(
            `Green count (${greenCount}) <= ${MIN_GREEN_COUNT}, removing ${redsToRemove.length} Red creatures...`
          );
          updatedCreatures = updatedCreatures.filter(
            (c) =>
              !(c.species.includes("レッド") || c.species.includes("red")) ||
              redsToKeep.has(c.id)
          );
        }
      }

      // 植物を更新
      plantsRef.current = currentPlants;
      setPlants(currentPlants);

      // 勝利判定
      const victory = checkVictory(updatedCreatures);
      setVictoryInfo(victory);

      // 絶滅チェック（グリーンが0になったら1分後に再開）
      if (greenCount === 0 && !restartTimerRef.current) {
        console.log("All Green creatures extinct! Restarting in 60 seconds...");
        setGameOverCountdown(60);
        
        // カウントダウン開始
        let countdown = 60;
        const countdownInterval = setInterval(() => {
          countdown--;
          setGameOverCountdown(countdown);
          if (countdown <= 0) {
            clearInterval(countdownInterval);
          }
        }, 1000);
        
        // 1分後に再開
        restartTimerRef.current = setTimeout(() => {
          console.log("Restarting game...");
          clearInterval(countdownInterval);
          setGameOverCountdown(null);
          restartTimerRef.current = null;
          
          // 新しいゲームを開始（グリーンとレッドを生成）
          Promise.all([
            fetch("http://localhost:3001/api/creature/generate-green", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ count: 3 }),
            }),
            fetch("http://localhost:3001/api/creature/generate-red", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ count: 1 }),
            }),
          ])
            .then(() => console.log("New game started!"))
            .catch((err) => console.error("Failed to restart game:", err));
        }, 60000);
      } else if (greenCount > 0 && restartTimerRef.current) {
        // グリーンが復活したらタイマーをキャンセル
        console.log("Green creatures recovered! Cancelling restart...");
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
        setGameOverCountdown(null);
      }

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

  // --- レッドの巣の定義 ---
  const RED_NEST = {
    x: 120,
    y: 120,
    radius: 38,
  };

  // SVG内で巣を描画する関数
  const renderRedNest = () => (
    <g className="red-nest">
      {/* Outer Danger Zone (Rotating dashed ring) */}
      <circle
        cx={RED_NEST.x}
        cy={RED_NEST.y}
        r={RED_NEST.radius}
        fill="transparent"
        stroke="#ef4444"
        strokeWidth={2}
        strokeDasharray="8 6"
        className="nest-ring-outer"
      />
      {/* Inner Hazard Area (Pulsing) */}
      <circle
        cx={RED_NEST.x}
        cy={RED_NEST.y}
        r={RED_NEST.radius * 0.7}
        fill="rgba(239, 68, 68, 0.2)"
        stroke="none"
        className="nest-ring-inner"
      />
      {/* Core (Solid) */}
      <circle
        cx={RED_NEST.x}
        cy={RED_NEST.y}
        r={RED_NEST.radius * 0.35}
        fill="#ef4444"
        fillOpacity="0.8"
        stroke="none"
        filter="drop-shadow(0 0 8px #ef4444)"
      />
    </g>
  );

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
        {creatures.map((creature) => {
          const behaviorState = getBehaviorState(creature, creatures);
          const isSpawning = spawningIds.has(creature.id);
          return (
            <CreatureSVG
              key={creature.id}
              creature={creature}
              behaviorState={behaviorState}
              isSpawning={isSpawning}
              obstacles={obstacles}
            />
          );
        })}

        {/* 消滅アニメーション中のキャラクターを描画 */}
        {dyingCreatures.map((dying) => (
          <CreatureSVG
            key={`dying-${dying.creature.id}`}
            creature={dying.creature}
            isDying={true}
            obstacles={obstacles}
          />
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

        {/* レッドの巣を描画 */}
        {renderRedNest()}
      </svg>

      {/* グリーンスコアボード（右下オーバーレイ） */}
      <div className="green-scoreboard">
        <div className="scoreboard-header">グリーン スコア</div>
        <div className="scoreboard-list">
          {(() => {
            // 分身を含むグリーンを元の名前でグループ化
            const greenCreatures = creatures.filter(
              (c) => getSpeciesType(c.species) === "green"
            );
            const grouped = new Map<
              string,
              { baseName: string; totalScore: number; count: number; typeId: string }
            >();

            greenCreatures.forEach((c) => {
              // 「分身」を除去してベース名を取得
              const baseName = c.name.replace(/分身+$/, "");
              const score = (c.survivalPoints || 0) + (c.plantPoints || 0);

              if (grouped.has(baseName)) {
                const existing = grouped.get(baseName)!;
                existing.totalScore += score;
                existing.count += 1;
              } else {
                grouped.set(baseName, {
                  baseName,
                  totalScore: score,
                  count: 1,
                  typeId: c.typeId,
                });
              }
            });

            // スコアで降順ソートして表示
            return Array.from(grouped.values())
              .sort((a, b) => b.totalScore - a.totalScore)
              .map((g) => {
                const displayName =
                  g.baseName.length > 6
                    ? g.baseName.substring(0, 6) + "…"
                    : g.baseName;
                return (
                  <div key={g.baseName} className="scoreboard-item">
                    <span className="scoreboard-name" title={g.typeId}>
                      {displayName}
                      {g.count > 1 && (
                        <span className="scoreboard-count">×{g.count}</span>
                      )}
                    </span>
                    <span className="scoreboard-score">{g.totalScore}pt</span>
                  </div>
                );
              });
          })()}
        </div>
      </div>

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

        {/* ゲームオーバー & 再開カウントダウン */}
        {gameOverCountdown !== null && (
          <div className="gameover-overlay">
            <div className="gameover-content">
              <h1>🌿 グリーン絶滅 🌿</h1>
              <h2>新しいゲームまで</h2>
              <div className="countdown-timer">{gameOverCountdown}</div>
              <p>秒</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EcosystemCanvas;

import { Creature, getSpeciesType } from "../types/creature";
import { GameConfig } from "../config/gameConfig";
import CreatureSVG from "./CreatureSVG";
import "./CreatureStats.css";
import { useEffect, useState, useRef, useCallback } from "react";

const DISPLAY_DURATION = 30000; // 30秒表示

interface CreatureStatsProps {
  creatures: Creature[];
}

export default function CreatureStats({ creatures }: CreatureStatsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [latestCreature, setLatestCreature] = useState<Creature | null>(null);
  const [progress, setProgress] = useState(100); // プログレスバー（100% -> 0%）
  const lastCreatureIdRef = useRef<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // タイマーをクリア
  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // AI生成キャラクターを取得（svgCodeを持つユーザー作成キャラのみ）
  const aiGeneratedCreatures = creatures.filter((creature) => {
    const isSystem =
      creature.author === "システム" ||
      creature.author === "system" ||
      creature.author === "System";
    return !isSystem && creature.svgCode; // AI生成 = svgCodeがある
  });

  const lastCreature =
    aiGeneratedCreatures.length > 0
      ? aiGeneratedCreatures[aiGeneratedCreatures.length - 1]
      : null;

  // 新しいAI生成キャラクターが追加されたらスライドイン
  useEffect(() => {
    if (lastCreature && lastCreature.id !== lastCreatureIdRef.current) {
      // 新しいキャラクターが来た
      lastCreatureIdRef.current = lastCreature.id;

      // 既存のタイマーをクリア
      clearTimers();

      // 一旦非表示にしてから表示（アニメーション用）
      setIsVisible(false);
      setProgress(100);

      // 少し遅延してから表示
      const showTimeout = setTimeout(() => {
        setLatestCreature(lastCreature);
        setIsVisible(true);
        startTimeRef.current = Date.now();

        // プログレスバーの更新（60fpsで更新）
        progressIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - startTimeRef.current;
          const remaining = Math.max(
            0,
            100 - (elapsed / DISPLAY_DURATION) * 100
          );
          setProgress(remaining);
        }, 16);

        // 30秒後に非表示
        timerRef.current = setTimeout(() => {
          setIsVisible(false);
          clearTimers();
        }, DISPLAY_DURATION);
      }, 300);

      return () => clearTimeout(showTimeout);
    }
  }, [lastCreature, clearTimers]);

  // クリーンアップ
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // 手動で閉じる
  const handleClose = useCallback(() => {
    setIsVisible(false);
    clearTimers();
  }, [clearTimers]);

  if (!latestCreature) {
    return null; // キャラクターがいない場合は何も表示しない
  }

  const creature = latestCreature;
  const speciesType = getSpeciesType(creature.species);
  const isRed = speciesType === "red";

  // 生成時刻と無敵期間の計算
  const now = Date.now();
  const createdAt = creature.createdAt || now;
  const invulnerableUntil =
    creature.invulnerableUntil ||
    createdAt + GameConfig.combat.invulnerabilityDuration;
  const isInvulnerable = now < invulnerableUntil;
  const remainingTime = Math.max(
    0,
    Math.ceil((invulnerableUntil - now) / 1000)
  ); // 秒単位

  // 生成時刻をフォーマット
  const createdDate = new Date(createdAt);
  const hours = createdDate.getHours().toString().padStart(2, "0");
  const minutes = createdDate.getMinutes().toString().padStart(2, "0");
  const formattedTime = `${hours}:${minutes}`;

  // 生成状態（完了済みと仮定、生成中の状態管理は別途実装が必要）
  const generationStatus = `${formattedTime} 生成完了`;

  // キャラクターの特徴を抽出
  const features = [
    ...creature.traits.strengths.slice(0, 2), // 強み2つ
  ];

  return (
    <div
      className={`creature-stats-notification ${isVisible ? "visible" : ""}`}
    >
      {/* 入力されたコメント（カードの外・上部） */}
      {creature.comment && (
        <div className="creature-comment-outside">
          <div className="comment-label">
            <span className="icon icon-pen"></span> 入力されたコメント by{" "}
            {creature.author}
          </div>
          <div className="comment-text">{creature.comment}</div>
        </div>
      )}

      {/* 矢印アイコン */}
      {creature.comment && <div className="generation-arrow">↓</div>}

      {/* 生成されたキャラクターカード */}
      <div
        className={`creature-card-horizontal ${
          isRed ? "red-card" : "green-card"
        }`}
      >
        {/* 閉じるボタン */}
        <button className="close-notification-btn" onClick={handleClose}>
          <span className="icon icon-close"></span>
        </button>

        {/* 左側：キャラクターイラスト */}
        <div className="creature-left">
          <div className="creature-illustration">
            <svg width="70" height="70" viewBox="0 0 70 70">
              <g transform="translate(35, 35)">
                <CreatureSVG
                  creature={{
                    ...creature,
                    position: { x: 0, y: 0 },
                  }}
                  behaviorState="idle"
                />
              </g>
            </svg>
          </div>
        </div>

        {/* 右側：詳細情報 */}
        <div className="creature-right">
          {/* 基本情報 */}
          <div className="creature-basic-info">
            <div className="creature-name-row">
              <span className="creature-name">{creature.name}</span>
            </div>
            <div className="creature-generation-time">{generationStatus}</div>
          </div>

          {/* キャラクターの特徴 */}
          <div className="creature-features">
            <div className="features-label">
              <span className="icon icon-star"></span> 特徴
            </div>
            <div className="features-list">
              {features.map((feature, index) => (
                <span key={index} className="feature-tag">
                  {feature}
                </span>
              ))}
            </div>
          </div>

          {/* 無敵状態の表示 */}
          {isInvulnerable && (
            <div className="invulnerability-status">
              <span className="icon icon-shield"></span>
              無敵: 残り {remainingTime}秒
            </div>
          )}
        </div>

        {/* プログレスバー（30秒カウントダウン） */}
        <div className="notification-progress-bar">
          <div
            className="notification-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

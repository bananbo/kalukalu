import { Creature, getSpeciesType } from "../types/creature";
import { GameConfig } from "../config/gameConfig";
import CreatureSVG from "./CreatureSVG";
import "./CreatureStats.css";
import { useEffect, useState } from "react";

interface CreatureStatsProps {
  creatures: Creature[];
}

export default function CreatureStats({ creatures }: CreatureStatsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [latestCreature, setLatestCreature] = useState<Creature | null>(null);
  const [showSpawnNotice, setShowSpawnNotice] = useState(false);

  // システム生成のキャラクターを除外し、ユーザーが作成した最新のキャラクターを表示
  const userCreatures = creatures.filter((creature) => {
    const isSystem =
      creature.author === "システム" ||
      creature.author === "system" ||
      creature.author === "System";
    return !isSystem;
  });

  const lastCreature = userCreatures.length > 0 ? userCreatures[userCreatures.length - 1] : null;

  // 新しいキャラクターが追加されたらスライドイン
  useEffect(() => {
    if (lastCreature && lastCreature !== latestCreature) {
      setIsVisible(false);
      setShowSpawnNotice(false);

      // ① コメント表示（500ms）
      setTimeout(() => {
        setLatestCreature(lastCreature);
        setIsVisible(true);
      }, 500);

      // ② キャラクター情報表示後、3秒後に「まもなく追加」通知
      setTimeout(() => {
        setShowSpawnNotice(true);
      }, 3500);

      // ③ 5秒後に通知を非表示（キャラクターがゲーム内に追加された後）
      setTimeout(() => {
        setShowSpawnNotice(false);
      }, 8000);
    }
  }, [lastCreature, latestCreature]);

  if (!latestCreature) {
    return null; // キャラクターがいない場合は何も表示しない
  }

  const creature = latestCreature;
  const speciesType = getSpeciesType(creature.species);
  const isRed = speciesType === "red";

  // 生成時刻と無敵期間の計算
  const now = Date.now();
  const createdAt = creature.createdAt || now;
  const invulnerableUntil = creature.invulnerableUntil || (createdAt + GameConfig.combat.invulnerabilityDuration);
  const isInvulnerable = now < invulnerableUntil;
  const remainingTime = Math.max(0, Math.ceil((invulnerableUntil - now) / 1000)); // 秒単位

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
    <div className={`creature-stats-notification ${isVisible ? "visible" : ""}`}>
      {/* 入力されたコメント（カードの外・上部） */}
      {creature.comment && (
        <div className="creature-comment-outside">
          <div className="comment-label">
            <span className="icon icon-pen"></span> 入力されたコメント by {creature.author}
          </div>
          <div className="comment-text">{creature.comment}</div>
        </div>
      )}

      {/* 矢印アイコン */}
      {creature.comment && <div className="generation-arrow">↓</div>}

      {/* 生成されたキャラクターカード */}
      <div className={`creature-card-horizontal ${isRed ? "red-card" : "green-card"}`}>
        {/* 閉じるボタン */}
        <button className="close-notification-btn" onClick={() => setIsVisible(false)}>
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
      </div>

      {/* まもなく追加通知 */}
      {showSpawnNotice && (
        <div className="spawn-notice">
          <span className="icon icon-alert"></span>
          まもなくキャラが画面内に追加されます
        </div>
      )}
    </div>
  );
}

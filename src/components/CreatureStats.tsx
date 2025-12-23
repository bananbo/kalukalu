import { useState, useEffect } from "react";
import { Creature, getSpeciesType } from "../types/creature";
import "./CreatureStats.css";

interface CreatureStatsProps {
  creatures: Creature[];
}

export default function CreatureStats({ creatures }: CreatureStatsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // 3秒ごとに表示するキャラクターを切り替え
  useEffect(() => {
    if (creatures.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % creatures.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [creatures.length]);

  // インデックスが範囲外になったらリセット
  useEffect(() => {
    if (currentIndex >= creatures.length && creatures.length > 0) {
      setCurrentIndex(0);
    }
  }, [currentIndex, creatures.length]);

  if (creatures.length === 0) {
    return (
      <div className="creature-stats-panel">
        <h2>キャラクター性質</h2>
        <div className="no-creatures">キャラクターがいません</div>
      </div>
    );
  }

  const creature = creatures[currentIndex];

  // クリーチャーが存在しない場合の安全チェック
  if (!creature) {
    return (
      <div className="creature-stats-panel">
        <div className="stats-header">
          <h2>キャラクター性質</h2>
        </div>
        <div className="no-creatures">キャラクターがいません</div>
      </div>
    );
  }

  const speciesType = getSpeciesType(creature.species);
  const isRed = speciesType === "red";

  return (
    <div className="creature-stats-panel">
      <div className="stats-header">
        <h2>
          <span className="icon icon-intelligence icon-lg"></span>{" "}
          キャラクター性質
        </h2>
        <div className="stats-counter">
          {currentIndex + 1} / {creatures.length}
        </div>
      </div>

      <div className={`creature-card ${isRed ? "red-card" : "green-card"}`}>
        {/* 基本情報 */}
        <div className="creature-basic-info">
          <div className="creature-name-row">
            <span className="creature-name">{creature.name}</span>
            <span className={`species-badge ${isRed ? "red" : "green"}`}>
              {creature.species}
            </span>
          </div>
          <div className="creature-author">by {creature.author}</div>
        </div>

        {/* 属性 */}
        <div className="stats-section">
          <h3>属性</h3>
          <div className="stat-bars">
            <StatBar
              label={
                <>
                  <span className="icon icon-speed"></span> 速度
                </>
              }
              value={creature.attributes.speed}
              max={10}
              color="#60a5fa"
            />
            <StatBar
              label={
                <>
                  <span className="icon icon-strength"></span> 体格
                </>
              }
              value={creature.attributes.size}
              max={10}
              color="#a78bfa"
            />
            <StatBar
              label={
                <>
                  <span className="icon icon-strength"></span> 力
                </>
              }
              value={creature.attributes.strength}
              max={10}
              color="#f87171"
            />
            <StatBar
              label={
                <>
                  <span className="icon icon-intelligence"></span> 知性
                </>
              }
              value={creature.attributes.intelligence}
              max={10}
              color="#fbbf24"
            />
            <StatBar
              label={
                <>
                  <span className="icon icon-social"></span> 社会性
                </>
              }
              value={creature.attributes.social}
              max={10}
              color="#4ade80"
            />
          </div>
        </div>

        {/* ステータス */}
        <div className="stats-section">
          <h3>ステータス</h3>
          <div className="status-grid">
            <div className="status-item">
              <span className="status-label">
                <span className="icon icon-energy"></span> エナジー
              </span>
              <span className="status-value">
                {Math.round(creature.energy)}
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">
                <span className="icon icon-time"></span> 年齢
              </span>
              <span className="status-value">
                {Math.floor(creature.age / 60)}s
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">
                <span className="icon icon-leaf"></span> 植物pt
              </span>
              <span className="status-value">{creature.plantPoints}</span>
            </div>
            <div className="status-item">
              <span className="status-label">
                <span className="icon icon-shield"></span> 生存pt
              </span>
              <span className="status-value">
                {creature.survivalPoints || 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 属性バー
function StatBar({
  label,
  value,
  max,
  color,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  color: string;
}) {
  const percentage = (value / max) * 100;
  return (
    <div className="stat-bar">
      <div className="stat-bar-label">
        <span>{label}</span>
        <span>{value.toFixed(1)}</span>
      </div>
      <div className="stat-bar-bg">
        <div
          className="stat-bar-fill"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

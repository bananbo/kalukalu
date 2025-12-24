import { Creature, getSpeciesType } from "../types/creature";
import CreatureSVG from "./CreatureSVG";
import "./CreatureStats.css";

interface CreatureStatsProps {
  creatures: Creature[];
}

export default function CreatureStats({ creatures }: CreatureStatsProps) {
  // システム生成のキャラクターを除外し、ユーザーが作成した最新のキャラクターを表示
  const userCreatures = creatures.filter((creature) => {
    const isSystem =
      creature.author === "システム" ||
      creature.author === "system" ||
      creature.author === "System";
    return !isSystem;
  });

  const lastCreature = userCreatures.length > 0 ? userCreatures[userCreatures.length - 1] : null;

  if (!lastCreature) {
    return (
      <div className="creature-stats-panel">
        <h2>キャラクター性質</h2>
        <div className="no-creatures">ユーザー作成のキャラクターがいません</div>
      </div>
    );
  }

  const creature = lastCreature;
  const speciesType = getSpeciesType(creature.species);
  const isRed = speciesType === "red";

  return (
    <div className="creature-stats-panel">
      <div className="stats-header">
        <h2>
          <span className="icon icon-intelligence icon-lg"></span>{" "}
          最新キャラクター
        </h2>
      </div>

      <div className={`creature-card ${isRed ? "red-card" : "green-card"}`}>
        {/* キャラクターイラスト */}
        <div className="creature-illustration">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <g transform="translate(40, 40)">
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

        {/* プロンプト（コメント） */}
        {creature.comment && (
          <div className="creature-comment">
            <div className="comment-label">
              <span className="icon icon-pen"></span> コメント
            </div>
            <div className="comment-text">{creature.comment}</div>
          </div>
        )}

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

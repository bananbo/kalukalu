import { useEffect, useState, useRef } from "react";
import { Creature, getSpeciesType } from "../types/creature";
import "./Ranking.css";

interface RankingProps {
  creatures: Creature[];
}

// typeIDごとのスコア
interface TypeScore {
  typeId: string;
  name: string;
  author: string;
  points: number;
  count: number; // 現在の個体数
}

interface StoredRanking {
  // typeIDごとの累計ポイント
  allTime: Record<
    string,
    { typeId: string; name: string; author: string; points: number }
  >;
  today: Record<
    string,
    { typeId: string; name: string; author: string; points: number }
  >;
  todayDate: string;
}

const RANKING_STORAGE_KEY = "ecosystem_ranking_v2";

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function loadStoredRanking(): StoredRanking {
  try {
    const stored = localStorage.getItem(RANKING_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as StoredRanking;
      if (data.todayDate !== getTodayDate()) {
        data.today = {};
        data.todayDate = getTodayDate();
      }
      return data;
    }
  } catch (e) {
    console.error("Failed to load ranking:", e);
  }
  return { allTime: {}, today: {}, todayDate: getTodayDate() };
}

function saveStoredRanking(ranking: StoredRanking): void {
  try {
    localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(ranking));
  } catch (e) {
    console.error("Failed to save ranking:", e);
  }
}

export default function Ranking({ creatures }: RankingProps) {
  const [storedRanking, setStoredRanking] = useState<StoredRanking>(() =>
    loadStoredRanking()
  );
  const lastPointsRef = useRef<Record<string, number>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // ランキングリセット関数
  const handleResetRanking = () => {
    const newRanking: StoredRanking = {
      allTime: {},
      today: {},
      todayDate: getTodayDate(),
    };
    setStoredRanking(newRanking);
    saveStoredRanking(newRanking);
    lastPointsRef.current = {};
    setShowResetConfirm(false);
  };

  // グリーン族のみ（ユーザー生成のみ）
  const greenCreatures = creatures.filter((creature) => {
    const type = getSpeciesType(creature.species);
    const isSystem =
      creature.author === "システム" ||
      creature.author === "system" ||
      creature.author === "System";
    return type === "green" && !isSystem;
  });

  // typeIDごとに集計（現在のスコア）
  const typeScores = new Map<string, TypeScore>();
  greenCreatures.forEach((c) => {
    if (!typeScores.has(c.typeId)) {
      typeScores.set(c.typeId, {
        typeId: c.typeId,
        name: c.name.replace(/分身$/, ""), // "分身"を除去して元の名前に
        author: c.author,
        points: 0,
        count: 0,
      });
    }
    const score = typeScores.get(c.typeId)!;
    // 植物ポイント + 生存ポイントを合計
    score.points += c.plantPoints + (c.survivalPoints || 0);
    score.count++;
  });

  const currentScores = Array.from(typeScores.values()).sort(
    (a, b) => b.points - a.points
  );

  // ポイント変動を検知して保存
  useEffect(() => {
    const newStored = { ...storedRanking };
    let changed = false;

    currentScores.forEach((score) => {
      const key = score.typeId;
      const lastPoints = lastPointsRef.current[key] || 0;
      const diff = score.points - lastPoints;

      if (diff > 0) {
        // 累計更新
        if (!newStored.allTime[key]) {
          newStored.allTime[key] = {
            typeId: score.typeId,
            name: score.name,
            author: score.author,
            points: 0,
          };
        }
        newStored.allTime[key].points += diff;

        // 今日の更新
        if (!newStored.today[key]) {
          newStored.today[key] = {
            typeId: score.typeId,
            name: score.name,
            author: score.author,
            points: 0,
          };
        }
        newStored.today[key].points += diff;

        changed = true;
      }

      lastPointsRef.current[key] = score.points;
    });

    if (changed) {
      newStored.todayDate = getTodayDate();
      setStoredRanking(newStored);
      saveStoredRanking(newStored);
    }
  }, [currentScores.map((s) => `${s.typeId}:${s.points}`).join(",")]);

  // 累計1位
  const allTimeRanking = Object.values(storedRanking.allTime).sort(
    (a, b) => b.points - a.points
  );
  const allTimeFirst = allTimeRanking[0];

  // 今日の1位
  const todayRanking = Object.values(storedRanking.today).sort(
    (a, b) => b.points - a.points
  );
  const todayFirst = todayRanking[0];

  // 現在のランキング（生存中 + 保存済み）
  const aliveTypeIds = new Set(currentScores.map((s) => s.typeId));

  const combinedRanking = Object.entries(storedRanking.allTime)
    .filter(([typeId]) => {
      // システム生成のtypeIDを除外
      const isSystemTypeId =
        typeId.startsWith("green-system-") || typeId.startsWith("red-system-");
      return !isSystemTypeId;
    })
    .map(([typeId, data]) => {
      const currentScore = currentScores.find((s) => s.typeId === typeId);
      return {
        typeId,
        name: data.name,
        author: data.author,
        allTimePoints: data.points,
        todayPoints: storedRanking.today[typeId]?.points || 0,
        currentPoints: currentScore?.points || 0,
        count: currentScore?.count || 0,
        isAlive: aliveTypeIds.has(typeId),
      };
    })
    .sort((a, b) => b.allTimePoints - a.allTimePoints);

  return (
    <div className="ranking-panel">
      <div className="ranking-header">
        <h2>
          <span className="icon icon-trophy icon-lg"></span> スコアボード
        </h2>
        <button
          className="reset-ranking-btn"
          onClick={() => setShowResetConfirm(true)}
          title="ランキングをリセット"
        >
          <span className="icon icon-refresh"></span>
        </button>
      </div>

      {/* リセット確認モーダル */}
      {showResetConfirm && (
        <div
          className="reset-confirm-overlay"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="reset-confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reset-confirm-header">
              <span className="icon icon-alert"></span>
              <h3>ランキングリセット</h3>
            </div>
            <div className="reset-confirm-content">
              <p>ランキングデータをすべてリセットしますか？</p>
              <p className="warning-text">この操作は取り消せません。</p>
            </div>
            <div className="reset-confirm-buttons">
              <button
                className="btn-cancel"
                onClick={() => setShowResetConfirm(false)}
              >
                キャンセル
              </button>
              <button className="btn-confirm" onClick={handleResetRanking}>
                リセット
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 左右分割レイアウト */}
      <div className="score-layout">
        {/* 左側: 現在のスコア */}
        <div className="current-scores-section">
          <div className="section-header">
            <span className="icon icon-leaf"></span> 現在のスコア
          </div>
          <div className="current-scores-list">
            {currentScores.length === 0 ? (
              <div className="no-data">参加者なし</div>
            ) : (
              currentScores.slice(0, 8).map((score, index) => (
                <div
                  key={score.typeId}
                  className={`current-score-item ${
                    index === 0 ? "top-score" : ""
                  }`}
                >
                  <div className="score-rank">{index + 1}</div>
                  <div className="score-info">
                    <span className="score-name">
                      {score.name.length > 5
                        ? score.name.substring(0, 5) + "…"
                        : score.name}
                    </span>
                    {score.count > 1 && (
                      <span className="score-count">×{score.count}</span>
                    )}
                  </div>
                  <div className="score-points">{score.points}pt</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右側: 累計ランキング */}
        <div className="ranking-section">
          <div className="section-header">
            <span className="icon icon-crown"></span> 累計ランキング
          </div>
          <div className="ranking-list">
            {combinedRanking.length === 0 ? (
              <div className="no-data">データなし</div>
            ) : (
              combinedRanking.slice(0, 8).map((score, index) => (
                <div
                  key={score.typeId}
                  className={`ranking-item ${
                    index === 0 ? "first-place" : ""
                  } ${!score.isAlive ? "inactive" : ""}`}
                >
                  <div className="rank">{index + 1}</div>
                  <div className="author-info">
                    <div className="creature-name">
                      {score.name.length > 5
                        ? score.name.substring(0, 5) + "…"
                        : score.name}
                    </div>
                  </div>
                  <div className="points-info">
                    <div className="points">{score.allTimePoints}pt</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

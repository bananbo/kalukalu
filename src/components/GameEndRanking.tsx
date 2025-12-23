import { useEffect, useState } from "react";
import "./GameEndRanking.css";

interface GameEndRankingProps {
  onRestart: () => void;
}

interface RankingEntry {
  typeId: string;
  name: string;
  author: string;
  points: number;
}

interface StoredRanking {
  allTime: Record<string, RankingEntry>;
  today: Record<string, RankingEntry>;
  todayDate: string;
}

const RANKING_STORAGE_KEY = "ecosystem_ranking_v2";

function loadStoredRanking(): StoredRanking | null {
  try {
    const stored = localStorage.getItem(RANKING_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredRanking;
    }
  } catch (e) {
    console.error("Failed to load ranking:", e);
  }
  return null;
}

export default function GameEndRanking({ onRestart }: GameEndRankingProps) {
  const [todayRanking, setTodayRanking] = useState<RankingEntry[]>([]);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    // ランキングデータを取得
    const stored = loadStoredRanking();
    if (stored && stored.today) {
      const ranking = Object.values(stored.today)
        .filter((entry) => {
          // システム生成を除外
          const isSystem =
            entry.typeId.startsWith("green-system-") ||
            entry.typeId.startsWith("red-system-");
          return !isSystem && entry.points > 0;
        })
        .sort((a, b) => b.points - a.points)
        .slice(0, 10);
      setTodayRanking(ranking);
    }

    // アニメーション用のディレイ
    setTimeout(() => setShowContent(true), 300);
  }, []);

  const getRankIcon = (index: number) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `${index + 1}`;
  };

  return (
    <div className="game-end-overlay">
      <div className={`game-end-modal ${showContent ? "show" : ""}`}>
        <div className="game-end-header">
          <h1>🎉 本日の配信終了！</h1>
          <p>2時間の配信お疲れさまでした</p>
        </div>

        <div className="game-end-ranking">
          <h2>
            <span className="icon icon-trophy"></span>
            今日のランキング
          </h2>

          {todayRanking.length === 0 ? (
            <div className="no-ranking">今日のデータがありません</div>
          ) : (
            <div className="ranking-list">
              {todayRanking.map((entry, index) => (
                <div
                  key={entry.typeId}
                  className={`ranking-entry rank-${index + 1}`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="rank-badge">{getRankIcon(index)}</div>
                  <div className="entry-info">
                    <div className="entry-name">{entry.name}</div>
                    <div className="entry-author">by {entry.author}</div>
                  </div>
                  <div className="entry-points">{entry.points}pt</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="game-end-footer">
          <p>ご視聴ありがとうございました！</p>
          <button className="restart-btn" onClick={onRestart}>
            <span className="icon icon-refresh"></span>
            もう一度プレイ
          </button>
        </div>
      </div>
    </div>
  );
}

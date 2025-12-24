import { useState, useEffect, useRef, useCallback } from "react";
import { Creature, getSpeciesType } from "./types/creature";
import EcosystemCanvas from "./components/EcosystemCanvas";
import Ranking from "./components/Ranking";
import CreatureStats from "./components/CreatureStats";
import AIGeneratorPopup from "./components/AIGeneratorPopup";
import SoundControl from "./components/SoundControl";
import YouTubeControl from "./components/YouTubeControl";
import GameEndRanking from "./components/GameEndRanking";
import "./App.css";

function App() {
  const [creatures, setCreatures] = useState<Creature[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAIPopupOpen, setIsAIPopupOpen] = useState(false);

  // タイマー関連のstate (2時間 = 7200秒)
  const GAME_DURATION = 2 * 60 * 60; // 2時間
  const [remainingTime, setRemainingTime] = useState(GAME_DURATION);
  const [isGameEnded, setIsGameEnded] = useState(false);
  const timerRef = useRef<number | null>(null);

  // タイマーをフォーマット
  const formatTime = useCallback((seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }, []);

  // カウントダウンタイマー
  useEffect(() => {
    if (isGameEnded) return;

    timerRef.current = window.setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsGameEnded(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isGameEnded]);

  // ゲームをリスタート
  const handleRestartGame = useCallback(() => {
    setRemainingTime(GAME_DURATION);
    setIsGameEnded(false);
  }, []);

  // 生物数が変わったらサーバーに通知
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const redCount = creatures.filter(
        (c) => getSpeciesType(c.species) === "red"
      ).length;
      const greenCount = creatures.filter(
        (c) => getSpeciesType(c.species) === "green"
      ).length;

      wsRef.current.send(
        JSON.stringify({
          type: "creatureCountUpdate",
          redCount,
          greenCount,
          totalCount: creatures.length,
        })
      );
    }
  }, [creatures]);

  // 初期種族をロード
  useEffect(() => {
    const loadInitialSpecies = async () => {
      try {
        const response = await fetch(
          "http://localhost:3001/api/initial-species"
        );
        const data = await response.json();

        if (data.success) {
          setCreatures(data.creatures);
        }
      } catch (error) {
        console.error("Error loading initial species:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialSpecies();
  }, []);

  // WebSocket接続
  useEffect(() => {
    const websocket = new WebSocket(`ws://localhost:3001/ws`);

    websocket.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "newCreature") {
        setCreatures((prev) => [...prev, data.creature]);
      } else if (data.type === "newCreatures") {
        // 複数の生物を追加
        setCreatures((prev) => [...prev, ...data.creatures]);
      }
    };

    websocket.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    wsRef.current = websocket;

    return () => {
      websocket.close();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="app loading">
        <div className="loading-content">
          <h2>生態系を準備中...</h2>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-title-row">
          <h1>
            <span className="app-logo"></span> Kalukalu
          </h1>
          <div className="header-info">
            <span className="header-subtitle">
              配信連動型シミュレーションゲーム
            </span>
            <span className="header-hint">
              コメントで「○○作って」と送ると文章に応じたキャラが生成されます！
            </span>
          </div>
        </div>
        <div className="header-controls">
          <div
            className={`header-timer ${remainingTime < 300 ? "warning" : ""} ${
              remainingTime < 60 ? "critical" : ""
            }`}
          >
            <span className="icon icon-clock"></span>
            <span className="timer-value">{formatTime(remainingTime)}</span>
          </div>
          <button
            className="header-add-btn"
            onClick={() => setIsAIPopupOpen(!isAIPopupOpen)}
            title="キャラクター追加"
          >
            <span className="icon icon-pen"></span>
            <span>ADD</span>
          </button>
          <YouTubeControl />
          <SoundControl />
          <div
            className={`connection-status ${
              isConnected ? "connected" : "disconnected"
            }`}
          >
            <span className="icon icon-wifi"></span>
            {isConnected ? "接続中" : "未接続"}
          </div>
        </div>
      </header>

      <div className="app-content">
        <div className="main-area">
          <EcosystemCanvas
            creatures={creatures}
            onCreatureUpdate={setCreatures}
          />
        </div>

        <aside className="sidebar">
          <Ranking creatures={creatures} />
        </aside>
      </div>

      {/* キャラクター通知（画面下から表示） */}
      <CreatureStats creatures={creatures} />

      {/* AI生成ポップアップ */}
      <AIGeneratorPopup
        isOpen={isAIPopupOpen}
        onToggle={() => setIsAIPopupOpen(!isAIPopupOpen)}
      />

      {/* ゲーム終了ランキング */}
      {isGameEnded && <GameEndRanking onRestart={handleRestartGame} />}
    </div>
  );
}

export default App;

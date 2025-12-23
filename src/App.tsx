import { useState, useEffect, useRef } from "react";
import { Creature, getSpeciesType } from "./types/creature";
import EcosystemCanvas from "./components/EcosystemCanvas";
import Ranking from "./components/Ranking";
import CreatureStats from "./components/CreatureStats";
import AIGeneratorPopup from "./components/AIGeneratorPopup";
import SoundControl from "./components/SoundControl";
import "./App.css";

function App() {
  const [creatures, setCreatures] = useState<Creature[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAIPopupOpen, setIsAIPopupOpen] = useState(false);

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
        <h1>
          <span className="app-logo"></span> Kalukalu -
          配信連動型シミュレーションゲーム
        </h1>
        <div className="header-controls">
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
          <CreatureStats creatures={creatures} />
          <Ranking creatures={creatures} />
        </aside>
      </div>

      {/* AI生成ポップアップ */}
      <AIGeneratorPopup
        isOpen={isAIPopupOpen}
        onToggle={() => setIsAIPopupOpen(!isAIPopupOpen)}
      />
    </div>
  );
}

export default App;

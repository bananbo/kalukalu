import { useState } from "react";
import "./YouTubeControl.css";

export default function YouTubeControl() {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    if (isActive) {
      // 停止
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("http://localhost:3001/api/youtube/stop", {
          method: "POST",
        });
        const data = await response.json();
        if (data.success) {
          setIsActive(false);
        } else {
          setError("停止に失敗しました");
        }
      } catch (err) {
        setError("サーバーに接続できません");
      } finally {
        setIsLoading(false);
      }
    } else {
      // 開始
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          "http://localhost:3001/api/youtube/start-auto",
          {
            method: "POST",
          }
        );
        const data = await response.json();
        if (data.success) {
          setIsActive(true);
        } else {
          setError(data.error || "開始に失敗しました");
        }
      } catch (err) {
        setError("サーバーに接続できません");
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="youtube-control">
      <button
        className={`youtube-toggle-btn ${isActive ? "active" : ""}`}
        onClick={handleToggle}
        disabled={isLoading}
        title="YouTubeコメント連動"
      >
        <span className="icon icon-robot"></span>
        <span className="youtube-status-text">
          {isLoading ? "..." : isActive ? "ON" : "OFF"}
        </span>
      </button>

      {error && <div className="youtube-error">{error}</div>}
    </div>
  );
}

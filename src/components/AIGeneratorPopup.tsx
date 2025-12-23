import { useState } from "react";
import "./AIGeneratorPopup.css";

interface AIGeneratorPopupProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function AIGeneratorPopup({ isOpen, onToggle }: AIGeneratorPopupProps) {
  const [aiAuthor, setAiAuthor] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  // AI生成をテスト（プレビューのみ）
  const handleAIPreview = async () => {
    if (!aiAuthor.trim() || !aiMessage.trim()) {
      alert("作者名とメッセージを入力してください");
      return;
    }

    setAiLoading(true);
    setAiResult(null);

    try {
      const response = await fetch("http://localhost:3001/api/creature/preview-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: aiAuthor,
          message: aiMessage,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAiResult(JSON.stringify(data.creature, null, 2));
      } else {
        setAiResult(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("AI生成エラー:", error);
      setAiResult(`Network Error: ${error}`);
    } finally {
      setAiLoading(false);
    }
  };

  // AI生成して実際にキャラクターを追加
  const handleAIGenerate = async () => {
    if (!aiAuthor.trim() || !aiMessage.trim()) {
      alert("作者名とメッセージを入力してください");
      return;
    }

    setAiLoading(true);
    setAiResult(null);

    try {
      const response = await fetch("http://localhost:3001/api/creature/create-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: aiAuthor,
          message: aiMessage,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAiResult(`生成成功: ${data.creature.name}`);
        setAiAuthor("");
        setAiMessage("");
      } else {
        setAiResult(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("AI生成エラー:", error);
      setAiResult(`Network Error: ${error}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <>
      {/* トグルボタン */}
      <button
        className={`ai-popup-toggle ${isOpen ? "open" : ""}`}
        onClick={onToggle}
        title="AI生成"
      >
        {isOpen ? "✕" : "🤖 AI"}
      </button>

      {/* ポップアップパネル */}
      <div className={`ai-popup-panel ${isOpen ? "open" : ""}`}>
        <div className="ai-popup-header">
          <h3>🤖 AI キャラクター生成</h3>
        </div>

        <div className="ai-popup-content">
          <div className="ai-inputs">
            <input
              type="text"
              value={aiAuthor}
              onChange={(e) => setAiAuthor(e.target.value)}
              placeholder="作者名"
              className="text-input"
            />
            <textarea
              value={aiMessage}
              onChange={(e) => setAiMessage(e.target.value)}
              placeholder="キャラクターの説明（例: 素早く逃げ回る小さな草食動物）"
              className="text-input ai-textarea"
            />
          </div>

          <div className="ai-buttons">
            <button
              onClick={handleAIPreview}
              disabled={aiLoading}
              className="btn btn-secondary"
            >
              {aiLoading ? "生成中..." : "プレビュー"}
            </button>
            <button
              onClick={handleAIGenerate}
              disabled={aiLoading}
              className="btn btn-primary"
            >
              {aiLoading ? "生成中..." : "生成して追加"}
            </button>
          </div>

          {aiResult && (
            <div className="ai-result">
              <pre>{aiResult}</pre>
            </div>
          )}

          <p className="help-text">
            Gemini 2.0 Flashが自然言語からパラメータを生成します
          </p>
        </div>
      </div>
    </>
  );
}

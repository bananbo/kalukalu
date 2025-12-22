import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { YouTubeLiveChat } from "./services/youtubeLiveChat";
import { CreatureGenerator } from "./services/creatureGenerator";
import { initialSpeciesData } from "./services/initialSpecies";

// .env.local を優先して読み込む
dotenv.config({ path: ".env.local" });
dotenv.config(); // .env もフォールバックとして読み込む

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const creatureGenerator = new CreatureGenerator();
let youtubeLiveChat: YouTubeLiveChat | null = null;

// WebSocket接続管理
wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (message) => {
    console.log("Received:", message.toString());
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// 全クライアントにブロードキャスト
function broadcast(data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

// YouTube Live Chat開始
app.post("/api/youtube/start", async (req, res) => {
  const { videoId } = req.body;

  try {
    if (youtubeLiveChat) {
      youtubeLiveChat.stop();
    }

    youtubeLiveChat = new YouTubeLiveChat(videoId);

    // コメント受信時の処理
    youtubeLiveChat.on("comment", async (comment) => {
      console.log("New comment:", comment);

      // LLMでコメントを解析して生物を生成
      const creature = await creatureGenerator.generateFromComment(comment);

      // 全クライアントに新しい生物を送信
      broadcast({
        type: "newCreature",
        creature,
      });
    });

    await youtubeLiveChat.start();
    res.json({ success: true, message: "YouTube Live Chat started" });
  } catch (error) {
    console.error("Error starting YouTube Live Chat:", error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// YouTube Live Chat停止
app.post("/api/youtube/stop", (_req, res) => {
  if (youtubeLiveChat) {
    youtubeLiveChat.stop();
    youtubeLiveChat = null;
    res.json({ success: true, message: "YouTube Live Chat stopped" });
  } else {
    res.status(400).json({ success: false, message: "No active Live Chat" });
  }
});

// 初期種族を取得
app.get("/api/initial-species", async (req, res) => {
  try {
    const creatures = [];

    for (const species of initialSpeciesData) {
      for (const comment of species.comments) {
        const creature = await creatureGenerator.generateFromComment({
          author: species.author,
          message: comment,
          timestamp: new Date(),
        });
        // 初期種族は外来種フラグをfalseに
        creature.isNewArrival = false;
        creatures.push(creature);
      }
    }

    res.json({ success: true, creatures });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 手動で生物を作成（テスト用） - 2匹セットで追加
app.post("/api/creature/create", async (req, res) => {
  try {
    const { comment } = req.body;

    // 2匹作成（兄弟として）
    const creature1 = await creatureGenerator.generateFromComment(comment);
    const creature2 = await creatureGenerator.generateFromComment({
      ...comment,
      message: comment.message + " (兄弟)",
    });

    // 2匹目は少し離れた位置に配置
    creature2.position.x += 50;
    creature2.position.y += 30;

    broadcast({
      type: "newCreatures",
      creatures: [creature1, creature2],
    });

    res.json({ success: true, creatures: [creature1, creature2] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// AI生成で生物を作成（テスト用）
app.post("/api/creature/create-ai", async (req, res) => {
  try {
    const { author, message } = req.body;

    if (!author || !message) {
      return res.status(400).json({
        success: false,
        error: "author and message are required",
      });
    }

    const comment = {
      author,
      message,
      timestamp: new Date(),
    };

    // AI生成を強制使用
    const creature = await creatureGenerator.generateWithAIForced(comment);

    broadcast({
      type: "newCreature",
      creature,
    });

    res.json({ success: true, creature });
  } catch (error) {
    console.error("AI creature generation error:", error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// AI生成のプレビュー（追加せずにパラメータだけ確認）
app.post("/api/creature/preview-ai", async (req, res) => {
  try {
    const { author, message } = req.body;

    if (!author || !message) {
      return res.status(400).json({
        success: false,
        error: "author and message are required",
      });
    }

    const comment = {
      author,
      message,
      timestamp: new Date(),
    };

    // AI生成を強制使用（追加はしない）
    const creature = await creatureGenerator.generateWithAIForced(comment);

    res.json({ success: true, creature });
  } catch (error) {
    console.error("AI creature preview error:", error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

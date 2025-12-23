import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { YouTubeLiveChat } from "./services/youtubeLiveChat";
import { YouTubeLiveDetector } from "./services/youtubeLiveDetector";
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

      // 「キャラ生成」というキーワードが含まれているかチェック
      if (!comment.message.includes("キャラ生成")) {
        console.log("Comment does not contain 'キャラ生成', skipping...");
        return;
      }

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

// YouTube Live Chat自動開始（チャンネルIDからライブ配信を自動検出）
app.post("/api/youtube/auto-start", async (req, res) => {
  const { channelId } = req.body;

  if (!channelId) {
    return res.status(400).json({
      success: false,
      error:
        "channelId is required. You can find it in YouTube Studio or your channel URL.",
    });
  }

  try {
    if (youtubeLiveChat) {
      youtubeLiveChat.stop();
    }

    // ライブ配信を自動検出
    const detector = new YouTubeLiveDetector(channelId);
    const videoId = await detector.findLiveVideoId();

    if (!videoId) {
      return res.status(404).json({
        success: false,
        error:
          "No live stream found on this channel. Make sure the stream is live.",
      });
    }

    console.log(`Auto-detected live stream: ${videoId}`);

    youtubeLiveChat = new YouTubeLiveChat(videoId);

    // コメント受信時の処理（通常のstartと同じ）
    youtubeLiveChat.on("comment", async (comment) => {
      console.log("New comment:", comment);

      if (!comment.message.includes("キャラ生成")) {
        console.log("Comment does not contain 'キャラ生成', skipping...");
        return;
      }

      const creature = await creatureGenerator.generateFromComment(comment);

      broadcast({
        type: "newCreature",
        creature,
      });
    });

    await youtubeLiveChat.start();
    res.json({
      success: true,
      message: "YouTube Live Chat started (auto-detected)",
      videoId: videoId,
    });
  } catch (error) {
    console.error("Error auto-starting YouTube Live Chat:", error);
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

    // グリーン族を生成
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

    // レッド族（鬼）を自動生成（初期3体）
    const INITIAL_RED_COUNT = 3;
    for (let i = 0; i < INITIAL_RED_COUNT; i++) {
      const redCreature = creatureGenerator.generateRedCreature(i);
      creatures.push(redCreature);
    }

    res.json({ success: true, creatures });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 手動で生物を作成（テスト用） - 1匹ずつ追加
app.post("/api/creature/create", async (req, res) => {
  try {
    const { comment } = req.body;

    // 1匹作成
    const creature = await creatureGenerator.generateFromComment(comment);

    broadcast({
      type: "newCreature",
      creature: creature,
    });

    res.json({ success: true, creature: creature });
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

// レッド族を生成（自動補充用）
app.post("/api/creature/generate-red", async (req, res) => {
  try {
    const { count = 1 } = req.body;
    const creatures = [];

    for (let i = 0; i < count; i++) {
      const redCreature = creatureGenerator.generateRedCreature(Date.now() + i);
      creatures.push(redCreature);

      broadcast({
        type: "newCreature",
        creature: redCreature,
      });
    }

    res.json({ success: true, creatures });
  } catch (error) {
    console.error("Red creature generation error:", error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// グリーン族を生成（自動補充用）
app.post("/api/creature/generate-green", async (req, res) => {
  try {
    const { count = 1 } = req.body;
    const creatures = [];

    for (let i = 0; i < count; i++) {
      const greenCreature = creatureGenerator.generateGreenCreature(
        Date.now() + i
      );
      creatures.push(greenCreature);

      broadcast({
        type: "newCreature",
        creature: greenCreature,
      });
    }

    res.json({ success: true, creatures });
  } catch (error) {
    console.error("Green creature generation error:", error);
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

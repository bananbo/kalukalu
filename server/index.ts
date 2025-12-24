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

// 現在の生物数を追跡（クライアントから更新される）
let currentCreatureCounts = {
  red: 0,
  green: 0,
  total: 0,
};

// WebSocket接続管理
wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      // クライアントから生物数の更新を受け取る
      if (data.type === "creatureCountUpdate") {
        currentCreatureCounts = {
          red: data.redCount || 0,
          green: data.greenCount || 0,
          total: data.totalCount || 0,
        };
        // ログ出力を削除（頻繁に更新されるため）
      }
    } catch (e) {
      console.log("Received non-JSON message:", message.toString());
    }
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

    // コメントキュー
    const commentQueue: any[] = [];

    // コメント受信時の処理（キューに追加）
    youtubeLiveChat.on("comment", (comment) => {
      console.log("Buffered comment:", comment.message);
      commentQueue.push(comment);
    });

    // 10秒ごとにキューを処理して1つだけ生成
    const processInterval = setInterval(async () => {
      if (commentQueue.length === 0) return;

      console.log(`Processing queue: ${commentQueue.length} comments`);

      // 1. キャラ生成リクエストのみをフィルタリング
      const validRequests = [];
      for (const comment of commentQueue) {
        const analysis = creatureGenerator.analyzeComment(comment.message);
        if (analysis.isCreatureRequest) {
          validRequests.push(comment);
        }
      }

      if (validRequests.length === 0) {
        // 有効なリクエストがなければキューをクリアして終了
        commentQueue.length = 0;
        return;
      }

      // 2. 抽選ロジック（スーパーチャット優先 or ランダム）
      // TODO: スーパーチャット情報の取得が可能ならここで優先度付けを行う
      // 現状はランダムに1つ選択
      const selectedComment =
        validRequests[Math.floor(Math.random() * validRequests.length)];

      console.log("Selected comment for generation:", selectedComment.message);

      // 3. 選択されたコメントからキャラクター生成
      try {
        // メッセージを30文字に制限
        const truncatedMessage = selectedComment.message.slice(0, 30);

        // 種族を決定
        const speciesDecision = creatureGenerator.determineSpecies(
          truncatedMessage,
          currentCreatureCounts.red,
          3
        );
        console.log("Species decision:", speciesDecision);

        const truncatedComment = {
          ...selectedComment,
          message: truncatedMessage,
        };

        // LLMでコメントを解析して生物を生成
        const creature = await creatureGenerator.generateFromComment(
          truncatedComment,
          { species: speciesDecision.species }
        );

        // YouTubeからの生成フラグを設定
        creature.isFromYouTube = true;

        // 全クライアントに新しい生物を送信
        broadcast({
          type: "newCreature",
          creature,
        });
      } catch (error) {
        console.error("Error generating creature from batched comment:", error);
      }

      // 4. キューをクリア（選ばれなかったコメントは破棄）
      commentQueue.length = 0;
    }, 10000); // 10秒間隔

    // チャット停止時にインターバルもクリア
    const originalStop = youtubeLiveChat.stop.bind(youtubeLiveChat);
    youtubeLiveChat.stop = () => {
      clearInterval(processInterval);
      originalStop();
    };

    await youtubeLiveChat.start();
    res.json({ success: true, message: "YouTube Live Chat started" });
  } catch (error) {
    console.error("Error starting YouTube Live Chat:", error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// YouTube Live Chat自動開始（チャンネルIDからライブ配信を自動検出）
app.post("/api/youtube/start-auto", async (req, res) => {
  // .envからチャンネルIDを取得
  const channelId = process.env.YOUTUBE_CHANNEL_ID;

  if (!channelId) {
    return res.status(400).json({
      success: false,
      error:
        "YOUTUBE_CHANNEL_ID is not set in .env.local file. Please add your YouTube channel ID.",
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

      // コメントを分析
      const analysis = creatureGenerator.analyzeComment(comment.message);
      console.log("Comment analysis:", analysis);

      // キャラ生成リクエストでなければスキップ
      if (!analysis.isCreatureRequest) {
        console.log("Not a creature request, skipping...");
        return;
      }

      // メッセージを30文字に制限
      const truncatedMessage = comment.message.slice(0, 30);

      // 種族を決定（レッド族は2体未満の時のみ生成可能）
      const speciesDecision = creatureGenerator.determineSpecies(
        truncatedMessage,
        currentCreatureCounts.red,
        2 // レッド族の上限
      );
      console.log("Species decision:", speciesDecision);

      const truncatedComment = {
        ...comment,
        message: truncatedMessage,
      };

      const creature = await creatureGenerator.generateFromComment(
        truncatedComment,
        { species: speciesDecision.species }
      );

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
        const creature = await creatureGenerator.generateFromComment(
          {
            author: species.author,
            message: comment,
            timestamp: new Date(),
          },
          { isDumb: species.isDumb } // おバカフラグを渡す
        );
        // 初期種族は外来種フラグをfalseに
        creature.isNewArrival = false;
        creatures.push(creature);
      }
    }

    // レッド族（鬼）を自動生成（初期2体）
    const INITIAL_RED_COUNT = 2;
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
    const { author, message, species } = req.body;

    if (!author || !message) {
      return res.status(400).json({
        success: false,
        error: "author and message are required",
      });
    }

    // speciesがレッド族の場合はバリデーションが必要（クライアント側でチェック）
    const validSpecies: ("グリーン族" | "レッド族") | undefined =
      species === "レッド族" ? "レッド族" : undefined;

    const comment = {
      author,
      message,
      timestamp: new Date(),
    };

    // AI生成を強制使用
    const creature = await creatureGenerator.generateWithAIForced(
      comment,
      validSpecies
    );

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
    const { author, message, species } = req.body;

    if (!author || !message) {
      return res.status(400).json({
        success: false,
        error: "author and message are required",
      });
    }

    const validSpecies: ("グリーン族" | "レッド族") | undefined =
      species === "レッド族" ? "レッド族" : undefined;

    const comment = {
      author,
      message,
      timestamp: new Date(),
    };

    // AI生成を強制使用（追加はしない）
    const creature = await creatureGenerator.generateWithAIForced(
      comment,
      validSpecies
    );

    res.json({ success: true, creature });
  } catch (error) {
    console.error("AI creature preview error:", error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

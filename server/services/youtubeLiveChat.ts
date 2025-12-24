import { google } from "googleapis";
import { EventEmitter } from "events";

interface YouTubeComment {
  author: string;
  message: string;
  timestamp: Date;
}

export class YouTubeLiveChat extends EventEmitter {
  private youtube;
  private videoId: string;
  private liveChatId: string | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private nextPageToken: string | undefined;
  // YouTube API Quota対策: 1日10,000ユニット制限を守るため、
  // 1リクエスト5ユニット消費  private nextPollTime: number = 0;
  private readonly MIN_POLLING_INTERVAL = 20000; // 10 seconds (Cost: ~3600 quota for 2 hours)
  constructor(videoId: string) {
    super();
    this.videoId = videoId;
    this.youtube = google.youtube({
      version: "v3",
      auth: process.env.YOUTUBE_API_KEY,
    });
  }

  async start() {
    try {
      // 動画からライブチャットIDを取得
      const videoResponse = await this.youtube.videos.list({
        part: ["liveStreamingDetails"],
        id: [this.videoId],
      });

      const liveChatId =
        videoResponse.data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;

      if (!liveChatId) {
        throw new Error("この動画にアクティブなライブチャットが見つかりません");
      }

      this.liveChatId = liveChatId;
      console.log("Live Chat ID:", this.liveChatId);

      // コメントのポーリング開始
      this.startPolling();
    } catch (error) {
      console.error("Error starting YouTube Live Chat:", error);
      throw error;
    }
  }

  private async startPolling() {
    if (!this.liveChatId) return;

    const pollMessages = async () => {
      try {
        const response = await this.youtube.liveChatMessages.list({
          liveChatId: this.liveChatId!,
          part: ["snippet", "authorDetails"],
          pageToken: this.nextPageToken,
        });

        // 新しいメッセージを処理
        const messages = response.data.items || [];
        messages.forEach((message) => {
          const comment: YouTubeComment = {
            author: message.authorDetails?.displayName || "Unknown",
            message: message.snippet?.displayMessage || "",
            timestamp: new Date(message.snippet?.publishedAt || Date.now()),
          };

          this.emit("comment", comment);
        });

        // 次回のポーリング用トークンを保存
        this.nextPageToken = response.data.nextPageToken || undefined;

        // ポーリング間隔（ミリ秒）
        // API指定の間隔と、自前の最小間隔(45秒)のうち、長い方を採用する
        const apiSuggestedInterval =
          response.data.pollingIntervalMillis || 5000;
        const pollingInterval = Math.max(
          apiSuggestedInterval,
          this.MIN_POLLING_INTERVAL
        );

        console.log(`Next poll in ${pollingInterval / 1000}s`);

        // 次回のポーリングをスケジュール
        this.pollingInterval = setTimeout(pollMessages, pollingInterval);
      } catch (error) {
        console.error("Error polling messages:", error);
        // エラーが発生しても再試行
        this.pollingInterval = setTimeout(pollMessages, 60000);
      }
    };

    // 最初のポーリングを開始
    pollMessages();
  }

  stop() {
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
    // liveChatIdは保持しておく（再開時のため）
    this.nextPageToken = undefined;
    console.log("YouTube Live Chat stopped");
  }
}

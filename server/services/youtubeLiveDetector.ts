import { google } from "googleapis";

/**
 * YouTubeチャンネルで現在ライブ配信中の動画IDを自動検出するサービス
 */
export class YouTubeLiveDetector {
  private youtube;
  private channelId: string;

  constructor(channelId: string) {
    this.channelId = channelId;
    this.youtube = google.youtube({
      version: "v3",
      auth: process.env.YOUTUBE_API_KEY,
    });
  }

  /**
   * 指定されたチャンネルで現在ライブ配信中の動画IDを取得
   * @returns ライブ配信中の動画ID、見つからない場合はnull
   */
  async findLiveVideoId(): Promise<string | null> {
    try {
      // search.list API で eventType=live のストリームを検索
      // Quota消費: 100ユニット（頻繁に呼ばないこと）
      const response = await this.youtube.search.list({
        part: ["id"],
        channelId: this.channelId,
        eventType: "live",
        type: ["video"],
        maxResults: 1,
      });

      const items = response.data.items;
      if (items && items.length > 0 && items[0].id?.videoId) {
        console.log(`Live stream found: ${items[0].id.videoId}`);
        return items[0].id.videoId;
      }

      console.log("No live stream found for this channel");
      return null;
    } catch (error) {
      console.error("Error searching for live stream:", error);
      throw error;
    }
  }

  /**
   * ライブ配信が見つかるまでポーリングし続ける
   * @param intervalMs ポーリング間隔（ミリ秒）、デフォルト60秒
   * @param maxAttempts 最大試行回数、デフォルト60回（1時間）
   * @returns 見つかった動画ID
   */
  async waitForLiveStream(
    intervalMs: number = 60000,
    maxAttempts: number = 60
  ): Promise<string> {
    console.log(`Waiting for live stream on channel ${this.channelId}...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const videoId = await this.findLiveVideoId();

      if (videoId) {
        return videoId;
      }

      console.log(
        `Attempt ${attempt}/${maxAttempts}: No live stream yet. Retrying in ${
          intervalMs / 1000
        }s...`
      );
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`No live stream found after ${maxAttempts} attempts`);
  }
}

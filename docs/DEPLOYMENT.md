# Kalukalu 24 時間配信サーバー デプロイ手順書

このドキュメントでは、AWS Lightsail (Amazon Linux) を使用して、Kalukalu を 24 時間 365 日 YouTube 配信するための手順を説明します。

---

## 1. サーバーの準備 (AWS Lightsail)

1.  **インスタンスの作成**:

    - **プラットフォーム**: Linux/Unix
    - **OS**: **Amazon Linux 2** (または Amazon Linux 2023)
      - ※ `Ubuntu`ではなく`Amazon Linux`を選択してください（Docker インストール手順が異なります）。
    - **プラン**: **$20/月** (4GB メモリ, 2 vCPU) 推奨
      - ※ $10 プラン以下ではメモリ不足で動作しない可能性が高いです。
    - **ネットワーキング**: **デュアルスタック (IPv4 & IPv6)** 推奨
      - ※ IPv6 のみだと手元の PC からの接続が難しい場合があります。

2.  **SSH キーのダウンロード**:
    - Lightsail コンソールの「アカウント」→「SSH キー」から、デフォルトのキー（`.pem`ファイル）をダウンロードします。
    - 保存場所例: `C:\Users\YourName\.ssh\` やプロジェクトフォルダ直下。

---

## 2. アプリケーションのアップロード

手元の PC（Windows PowerShell）から `scp` コマンドでコード一式をサーバーに送信します。

**コマンド構文:**

```powershell
scp -i "鍵ファイルのパス" -r . ec2-user@<IPアドレス>:~/kalukalu
```

**実行例 (IPv6 の場合 - アドレスを `[]` で囲むのが必須):**

```powershell
scp -i ".\LightsailDefaultKey-ap-northeast-1.pem" -r . ec2-user@[2406:da14:52e:7a00:6d86:9719:f2fb:a4f8]:~/kalukalu
```

**実行例 (IPv4 の場合):**

```powershell
scp -i ".\LightsailDefaultKey-ap-northeast-1.pem" -r . ec2-user@3.112.123.45:~/kalukalu
```

---

## 3. サーバー環境構築 (SSH 接続)

サーバーに SSH 接続し、以下のコマンドを実行して Docker 環境を整えます。

**接続コマンド:**

```powershell
ssh -i "Key.pem" ec2-user@<IPアドレス>
```

**セットアップコマンド (Amazon Linux 用):**

```bash
# 1. システム更新とDockerインストール
sudo yum update -y
sudo amazon-linux-extras install docker -y   # AL2の場合
# sudo yum install docker -y                 # AL2023の場合

# 2. Docker起動と権限設定
sudo service docker start
sudo usermod -a -G docker ec2-user

# ※重要: 設定反映のため、ここで一度 exit して再接続してください
exit
```

---

## 4. 動作確認 (スクリーンショットテスト)

配信前に、アプリと Chrome が正常に動くか確認します。

```bash
cd ~/kalukalu

# 1. コンテナのビルド
docker build -t kalukalu-stream .

# 2. スクリーンショットテスト実行
docker run --rm \
  -v $(pwd):/output \
  --entrypoint /bin/bash \
  kalukalu-stream \
  -c "chmod +x test-screenshot.sh && ./test-screenshot.sh && cp screenshot.png /output/"

# 3. 確認
ls -l screenshot.png
```

生成された `screenshot.png` を `scp` で手元にダウンロードして確認してください。

---

## 5. 本番配信の開始

テストが OK なら、配信を開始します。

1.  **`.env`ファイルの作成**:

    ```bash
    nano .env
    ```

    以下の内容を貼り付けて保存します (`Ctrl+O` → `Enter` → `Ctrl+X`):

    ```env
    YOUTUBE_API_KEY=あなたのYouTube_APIキー
    YOUTUBE_STREAM_KEY=あなたのYouTubeストリームキー
    ```

2.  **配信スタート**:
    ```bash
    docker run -d \
      --name stream \
      --restart always \
      --env-file .env \
      kalukalu-stream
    ```

**運用コマンド:**

- **ログ確認**: `docker logs -f stream`
- **停止**: `docker stop stream`
- **再開**: `docker start stream`
- **削除**: `docker rm -f stream`

---

## 注意事項

- **API 制限対策**: `server/services/youtubeLiveChat.ts` にて、ポーリング間隔を最低 45 秒に設定しています。これにより API の無料枠内で 24 時間運用可能です。
- **コスト**: AWS Lightsail $20 プランは、月額固定料金で約 4TB の転送量が含まれています。配信設定（ビットレート 3000kbps 程度）であれば、通信料超過の心配はありません。

---

## 6. スケジュール配信（毎日特定の時間に配信）

### 前提条件

- YouTube Studio で「予約配信」を毎日作成しておくか、または「常時ライブ」設定を使用。
- 環境変数に `YOUTUBE_CHANNEL_ID` を追加（`.env` に記載）。

### チャンネル ID の確認方法

1. YouTube Studio にログイン
2. 左メニューの「カスタマイズ」→「基本情報」
3. 「チャンネル URL」の末尾にある文字列（`UC...` で始まる）がチャンネル ID

### 自動接続の仕組み

新しく追加された `/api/youtube/auto-start` エンドポイントは、チャンネル ID を指定するだけで、そのチャンネルで現在ライブ配信中の動画を自動検出し、コメント取得を開始します。

**リクエスト例:**

```bash
curl -X POST http://localhost:3001/api/youtube/auto-start \
  -H "Content-Type: application/json" \
  -d '{"channelId": "UCxxxxxxxx"}'
```

### Cron によるスケジュール実行

```bash
# タイムゾーンをJSTに設定
sudo timedatectl set-timezone Asia/Tokyo

# cron設定を開く
crontab -e

# 毎日20:00に配信開始、翌02:00に停止
0 20 * * * docker start stream
0 2 * * * docker stop stream
```

### 完全自動化のヒント

1. **start-stream.sh** 内で `/api/youtube/auto-start` を自動呼び出しするように変更すれば、コンテナ起動と同時に自動でライブ検出＆接続が行われます。
2. 配信が見つからない場合のリトライロジック（`waitForLiveStream` メソッド）も用意されています。

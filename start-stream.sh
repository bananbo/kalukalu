#!/bin/bash

# エラーで停止するように設定
set -e

echo "Starting Kalukalu Streaming Container..."

# 1. 仮想ディスプレイ (Xvfb) の起動
# -ac: アクセス制御を無効化
# -screen 0: スクリーン0を $RESOLUTION (例: 1280x720) の24bitカラーで作成
echo "Starting Xvfb..."
Xvfb :99 -ac -screen 0 $RESOLUTION"x24" > /dev/null 2>&1 &
XVFB_PID=$!
sleep 2

# 2. Kalukalu アプリケーションの起動（バックグラウンド）
echo "Starting Kalukalu App..."
# npm run dev は開発用なので、本番は node server/index.js + vite preview 等が良いが
# ここでは簡易的に npm run dev を使用（またはビルド後の配信なら serve -s dist と node server）
# 今回は既存の package.json に従い、concurrentlyで両方立ち上げる dev を使用
npm run dev > /dev/null 2>&1 &
APP_PID=$!

# アプリが立ち上がるまで待機（ポーリング）
echo "Waiting for app to be ready on port $PORT..."
timeout 60 bash -c 'until echo > /dev/tcp/localhost/'$PORT'; do sleep 1; done'
echo "App is ready!"

# 3. Google Chrome の起動（キオスクモード）
# --kiosk: 全画面表示
# --no-sandbox: コンテナ内で動かすために必要
# --disable-infobars: 「Chromeは制御されています」等のバーを消す
echo "Starting Google Chrome..."
google-chrome-stable \
  --no-sandbox \
  --disable-gpu \
  --kiosk \
  --window-position=0,0 \
  --window-size=${RESOLUTION/x/,} \
  --autoplay-policy=no-user-gesture-required \
  --display=:99 \
  "http://localhost:3000?auto=true" \
  > /dev/null 2>&1 &
CHROME_PID=$!
sleep 5

# 4. 配信開始の確認
if [ -z "$YOUTUBE_STREAM_KEY" ]; then
  echo "WARNING: YOUTUBE_STREAM_KEY is not set. Streaming (FFmpeg) will NOT start."
  echo "The app is running internally. You can connect via VNC (if installed) to debug."
else
  echo "Starting FFmpeg streaming to YouTube..."
  
  # FFmpegで画面キャプチャして配信
  # -f x11grab: X11画面をキャプチャ
  # -i :99: ディスプレイ番号
  # -r 30: 30fps
  # -g 60: Keyframe interval 2秒
  ffmpeg \
    -f x11grab -s $RESOLUTION -r 30 -i :99 \
    -vcodec libx264 -preset veryfast -maxrate 3000k -bufsize 6000k \
    -pix_fmt yuv420p -g 60 -c:a aac -b:a 128k -ar 44100 \
    -f flv "rtmp://a.rtmp.youtube.com/live2/$YOUTUBE_STREAM_KEY"
fi

# FFmpegが終了したら（エラー等）、ここに来る
echo "FFmpeg process exited."

# クリーンアップ
kill $CHROME_PID
kill $APP_PID
kill $XVFB_PID

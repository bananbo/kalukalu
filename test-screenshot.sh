#!/bin/bash

# エラーで停止するように設定
set -e

echo "Starting Screenshot Test..."

# 1. 仮想ディスプレイ (Xvfb) の起動
Xvfb :99 -ac -screen 0 1280x720x24 > /dev/null 2>&1 &
XVFB_PID=$!
sleep 2

# 2. Kalukalu アプリケーションの起動（バックグラウンド）
# スクショ用に一時的に環境変数をセット
echo "Starting app..."
PORT=3000 npm run dev > /dev/null 2>&1 &
APP_PID=$!

# アプリが立ち上がるまで待機
echo "Waiting for app..."
timeout 60 bash -c 'until echo > /dev/tcp/localhost/3000; do sleep 1; done'
echo "App is ready!"

# 3. Chromeでページを開いてスクリーンショットを撮る
# --screenshot オプションを使用
echo "Taking screenshot..."
google-chrome-stable \
  --no-sandbox \
  --disable-gpu \
  --headless \
  --disable-infobars \
  --window-size=1280,720 \
  --screenshot=/app/screenshot.png \
  "http://localhost:3000?auto=true"

echo "Screenshot saved to /app/screenshot.png"

# プロセス終了
kill $APP_PID
kill $XVFB_PID

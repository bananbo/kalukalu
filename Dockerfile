FROM node:18-slim

# 必要なパッケージ（Chrome, Xvfb, FFmpeg）のインストール
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    xvfb \
    ffmpeg \
    procps \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 作業ディレクトリ設定
WORKDIR /app

# 依存関係のインストール
COPY package*.json ./
RUN npm install

# ソースコードのコピー
COPY . .

# ビルド
RUN npm run build

# 実行用スクリプトのコピーと権限付与
COPY start-stream.sh .
RUN chmod +x start-stream.sh

# 環境変数のデフォルト値（実行時に上書き可能）
ENV DISPLAY=:99
ENV RESOLUTION=1280x720
ENV PORT=3000

# ポート開放
EXPOSE 3000

# 起動コマンド
CMD ["./start-stream.sh"]

/**
 * SE生成スクリプト
 * Web Audio APIを使用してゲーム用の効果音を生成します
 */

const fs = require('fs');
const path = require('path');

// WAVファイルヘッダーを生成
function createWavHeader(dataLength, sampleRate, numChannels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);

  // RIFF chunk
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);

  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // byte rate
  header.writeUInt16LE(numChannels * bitsPerSample / 8, 32); // block align
  header.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

// オーディオバッファをWAVファイルに変換
function audioBufferToWav(samples, sampleRate) {
  const buffer = Buffer.alloc(samples.length * 2);

  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(sample * 0x7FFF, i * 2);
  }

  const header = createWavHeader(buffer.length, sampleRate);
  return Buffer.concat([header, buffer]);
}

// 攻撃音 - 鋭い打撃音
function generateAttackSound() {
  const sampleRate = 44100;
  const duration = 0.15;
  const samples = new Array(Math.floor(sampleRate * duration));

  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const freq = 200 - t * 1500; // 周波数を急降下
    const envelope = Math.exp(-t * 25); // 急速に減衰
    const noise = (Math.random() * 2 - 1) * 0.3;
    samples[i] = (Math.sin(2 * Math.PI * freq * t) * 0.7 + noise) * envelope;
  }

  return audioBufferToWav(samples, sampleRate);
}

// 食事音 - 柔らかい咀嚼音
function generateEatSound() {
  const sampleRate = 44100;
  const duration = 0.25;
  const samples = new Array(Math.floor(sampleRate * duration));

  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.sin(Math.PI * t / duration) * 0.6;
    const noise = (Math.random() * 2 - 1);
    const lowFreq = Math.sin(2 * Math.PI * 150 * t) * 0.3;
    samples[i] = (noise * 0.4 + lowFreq) * envelope;
  }

  return audioBufferToWav(samples, sampleRate);
}

// スポーン音 - 上昇する明るい音
function generateSpawnSound() {
  const sampleRate = 44100;
  const duration = 0.3;
  const samples = new Array(Math.floor(sampleRate * duration));

  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const freq1 = 400 + t * 600;
    const freq2 = 600 + t * 800;
    const envelope = Math.sin(Math.PI * t / duration) * Math.exp(-t * 3);
    samples[i] = (Math.sin(2 * Math.PI * freq1 * t) * 0.5 +
                  Math.sin(2 * Math.PI * freq2 * t) * 0.3) * envelope;
  }

  return audioBufferToWav(samples, sampleRate);
}

// 死亡音 - 下降する暗い音
function generateDeathSound() {
  const sampleRate = 44100;
  const duration = 0.5;
  const samples = new Array(Math.floor(sampleRate * duration));

  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const freq = 300 - t * 250;
    const envelope = Math.exp(-t * 4);
    const noise = (Math.random() * 2 - 1) * 0.2 * Math.exp(-t * 6);
    samples[i] = (Math.sin(2 * Math.PI * freq * t) * 0.6 + noise) * envelope;
  }

  return audioBufferToWav(samples, sampleRate);
}

// バックスタブ成功音 - クリティカルヒット
function generateBackstabSound() {
  const sampleRate = 44100;
  const duration = 0.25;
  const samples = new Array(Math.floor(sampleRate * duration));

  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const freq1 = 800;
    const freq2 = 1200;
    const freq3 = 300 - t * 200;
    const envelope = Math.exp(-t * 15);
    const harmonic = Math.sin(2 * Math.PI * freq1 * t) * 0.4 +
                     Math.sin(2 * Math.PI * freq2 * t) * 0.3 +
                     Math.sin(2 * Math.PI * freq3 * t) * 0.5;
    samples[i] = harmonic * envelope;
  }

  return audioBufferToWav(samples, sampleRate);
}

// 植物消滅音 - 静かな消失音
function generatePlantDisappearSound() {
  const sampleRate = 44100;
  const duration = 0.4;
  const samples = new Array(Math.floor(sampleRate * duration));

  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const freq = 600 - t * 400;
    const envelope = Math.exp(-t * 5) * Math.sin(Math.PI * t / duration);
    samples[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.4;
  }

  return audioBufferToWav(samples, sampleRate);
}

// 逃走音 - 素早い足音
function generateFleeSound() {
  const sampleRate = 44100;
  const duration = 0.2;
  const samples = new Array(Math.floor(sampleRate * duration));

  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const pulseFreq = 15;
    const pulse = Math.sin(2 * Math.PI * pulseFreq * t);
    const envelope = Math.exp(-t * 10) * (pulse > 0 ? 1 : 0);
    const noise = (Math.random() * 2 - 1);
    samples[i] = noise * envelope * 0.5;
  }

  return audioBufferToWav(samples, sampleRate);
}

// ポイント獲得音 - 明るいベル音
function generatePointSound() {
  const sampleRate = 44100;
  const duration = 0.35;
  const samples = new Array(Math.floor(sampleRate * duration));

  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const freq1 = 800;
    const freq2 = 1000;
    const freq3 = 1200;
    const envelope = Math.exp(-t * 8);
    samples[i] = (Math.sin(2 * Math.PI * freq1 * t) * 0.4 +
                  Math.sin(2 * Math.PI * freq2 * t) * 0.3 +
                  Math.sin(2 * Math.PI * freq3 * t) * 0.2) * envelope;
  }

  return audioBufferToWav(samples, sampleRate);
}

// メイン処理
function main() {
  const outputDir = path.join(__dirname, '../public/sounds');

  // ディレクトリが存在しない場合は作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('🎵 SE生成を開始します...\n');

  const sounds = [
    { name: 'attack.wav', generator: generateAttackSound, description: '攻撃音' },
    { name: 'eat.wav', generator: generateEatSound, description: '食事音' },
    { name: 'spawn.wav', generator: generateSpawnSound, description: 'スポーン音' },
    { name: 'death.wav', generator: generateDeathSound, description: '死亡音' },
    { name: 'backstab.wav', generator: generateBackstabSound, description: 'バックスタブ音' },
    { name: 'plant-disappear.wav', generator: generatePlantDisappearSound, description: '植物消滅音' },
    { name: 'flee.wav', generator: generateFleeSound, description: '逃走音' },
    { name: 'point.wav', generator: generatePointSound, description: 'ポイント獲得音' }
  ];

  sounds.forEach(sound => {
    const wavData = sound.generator();
    const filePath = path.join(outputDir, sound.name);
    fs.writeFileSync(filePath, wavData);
    console.log(`✅ ${sound.description} (${sound.name}) を生成しました`);
  });

  console.log(`\n🎉 全ての効果音を生成しました！`);
  console.log(`📁 出力先: ${outputDir}`);
}

main();

import { GoogleGenerativeAI } from "@google/generative-ai";

interface BehaviorProgram {
  approachAlly: number;
  approachEnemy: number;
  fleeWhenWeak: number;
  aggressiveness: number;
  curiosity: number;
  territoriality: number;
  obstacleAwareness: number;
  obstacleStrategy: "avoid" | "use-as-cover" | "ignore";
  stealthAttack: number; // 背後攻撃傾向
  counterAttack: number; // 反撃傾向
}

// AIが返すJSON形式の定義
interface AIGeneratedCreatureParams {
  name: string;
  attributes: {
    speed: number;
    size: number;
    strength: number;
    intelligence: number;
    social: number;
  };
  appearance: {
    bodyType: "circle" | "triangle" | "square" | "star" | "organic";
    primaryColor: string;
    secondaryColor: string;
    hasEyes: boolean;
    hasTentacles: boolean;
    hasWings: boolean;
    pattern: "solid" | "stripes" | "spots" | "gradient";
  };
  behavior: {
    diet: "herbivore" | "carnivore" | "omnivore";
    activity: "diurnal" | "nocturnal" | "cathemeral";
    social: "solitary" | "pack" | "swarm";
  };
  traits: {
    strengths: string[];
    weaknesses: string[];
  };
  behaviorProgram: BehaviorProgram;
  vision: {
    angle: number;
    range: number;
  };
}

interface Creature {
  id: string;
  name: string;
  typeId: string; // キャラクタータイプID（分裂しても継承される）
  attributes: {
    speed: number; // 0-10
    size: number; // 0-10
    strength: number; // 0-10
    intelligence: number; // 0-10
    social: number; // 0-10
  };
  appearance: {
    bodyType: "circle" | "triangle" | "square" | "star" | "organic";
    primaryColor: string;
    secondaryColor: string;
    hasEyes: boolean;
    hasTentacles: boolean;
    hasWings: boolean;
    pattern: "solid" | "stripes" | "spots" | "gradient";
  };
  behavior: {
    diet: "herbivore" | "carnivore" | "omnivore";
    activity: "diurnal" | "nocturnal" | "cathemeral";
    social: "solitary" | "pack" | "swarm";
  };
  traits: {
    strengths: string[];
    weaknesses: string[];
  };
  behaviorProgram: BehaviorProgram;
  position: {
    x: number;
    y: number;
  };
  homePosition: {
    // 縄張りの中心（初期位置）
    x: number;
    y: number;
  };
  velocity: {
    x: number;
    y: number;
  };
  energy: number;
  age: number;
  author: string;
  comment: string;
  species: string; // 'レッド族' または 'グリーン族'
  isNewArrival?: boolean;
  reproductionCooldown: number;
  reproductionHistory: { [partnerId: string]: number };
  wanderAngle: number;
  vision: {
    angle: number; // 視野角（ラジアン）
    range: number; // 視野距離
  };
  plantPoints: number; // 植物ポイント（グリーンのみ）
  splitCooldown: number; // 分裂クールダウン
  survivalPoints: number; // 生存ポイント（10秒ごとに+1）
  survivalFrames: number; // 生存フレーム数（60fps想定）
}

export class CreatureGenerator {
  private debugMode: boolean;
  private genAI: GoogleGenerativeAI | null = null;

  constructor(debugMode: boolean = true) {
    this.debugMode = debugMode;

    // Gemini APIキーがあれば初期化
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      console.log("Gemini API initialized");
    } else {
      console.log("Gemini API key not found, using debug mode");
    }
  }

  async generateFromComment(comment: {
    author: string;
    message: string;
    timestamp: Date;
  }): Promise<Creature> {
    // デバッグモードまたはGeminiが初期化されていない場合
    if (this.debugMode || !this.genAI) {
      return this.generateDebugCreature(comment);
    }

    try {
      return await this.generateWithAI(comment);
    } catch (error) {
      console.error("AI generation failed, falling back to debug mode:", error);
      return this.generateDebugCreature(comment);
    }
  }

  // AI生成を強制的に使用（テスト用）
  async generateWithAIForced(comment: {
    author: string;
    message: string;
    timestamp: Date;
  }): Promise<Creature> {
    if (!this.genAI) {
      throw new Error(
        "Gemini API is not initialized. Please set GEMINI_API_KEY in .env.local"
      );
    }
    return this.generateWithAI(comment);
  }

  private async generateWithAI(comment: {
    author: string;
    message: string;
    timestamp: Date;
  }): Promise<Creature> {
    const prompt = this.buildPrompt(comment);

    const model = this.genAI!.getGenerativeModel({
      model: "gemini-2.0-flash-exp", // Gemini 2.0 Flash
      generationConfig: {
        temperature: 0.8,
        responseMimeType: "application/json",
      },
    });

    const systemPrompt = `あなたは生態系シミュレーションゲームのキャラクター生成AIです。
ユーザーのコメントを解析して、そのコメントにふさわしい生物のパラメータをJSON形式で生成してください。
必ず指定されたJSON形式のみを返してください。説明文は不要です。`;

    const result = await model.generateContent([systemPrompt, prompt]);

    const content = result.response.text();
    if (!content) {
      throw new Error("No response from AI");
    }

    const aiParams: AIGeneratedCreatureParams = JSON.parse(content);
    return this.createCreatureFromAI(aiParams, comment);
  }

  private buildPrompt(comment: { author: string; message: string }): string {
    return `
コメント投稿者: ${comment.author}
コメント内容: ${comment.message}

以下のJSON形式で生物のパラメータを生成してください：

{
  "name": "生物の名前（コメントから連想される面白い名前）",
  "attributes": {
    "speed": 0-10の数値（コメントに「速い」「素早い」などあれば高く）,
    "size": 0-10の数値（「大きい」「巨大」などあれば高く）,
    "strength": 0-10の数値（「強い」「力強い」などあれば高く）,
    "intelligence": 0-10の数値（「賢い」「知的」などあれば高く）,
    "social": 0-10の数値（「群れ」「仲間」などあれば高く）
  },
  "appearance": {
    "bodyType": "circle" | "triangle" | "square" | "star" | "organic" のいずれか,
    "primaryColor": "#RRGGBB形式の色（コメントの雰囲気に合う色）",
    "secondaryColor": "#RRGGBB形式の色",
    "hasEyes": true/false,
    "hasTentacles": true/false（触手があるか）,
    "hasWings": true/false（翼があるか）,
    "pattern": "solid" | "stripes" | "spots" | "gradient" のいずれか
  },
  "behavior": {
    "diet": "herbivore"（草食）| "carnivore"（肉食）| "omnivore"（雑食）,
    "activity": "diurnal"（昼行性）| "nocturnal"（夜行性）| "cathemeral"（両方）,
    "social": "solitary"（単独）| "pack"（群れ）| "swarm"（大群）
  },
  "traits": {
    "strengths": ["長所1", "長所2"]（2-3個）,
    "weaknesses": ["短所1", "短所2"]（2-3個）
  },
  "behaviorProgram": {
    "approachAlly": -1.0〜1.0（同種族への接近度、正で近づく）,
    "approachEnemy": -1.0〜1.0（異種族への接近度）,
    "fleeWhenWeak": 0.0〜1.0（弱い時の逃走傾向）,
    "aggressiveness": 0.0〜1.0（攻撃性）,
    "curiosity": 0.0〜1.0（好奇心・探索傾向）,
    "territoriality": 0.0〜1.0（縄張り意識）,
    "obstacleAwareness": 0.0〜1.0（障害物認識度、高いと早めに回避）,
    "obstacleStrategy": "avoid" | "use-as-cover" | "ignore"（障害物戦略）,
    "stealthAttack": 0.0〜1.0（背後攻撃傾向、高いとレッド族の背後を狙う）,
    "counterAttack": 0.0〜1.0（反撃傾向、高いと逃げずに反撃を試みる）
  },
  "vision": {
    "angle": 視野角（ラジアン、0.5〜6.28、捕食者は狭く、草食は広く）,
    "range": 視野距離（50〜200）
  }
}

【ゲームシステム】
- マップには壁や岩などの障害物があります
- レッド族（鬼）は倒されるまで永遠に生き続けます（裏ボス）
- グリーン族は背後からレッドを攻撃すると倒せるチャンスがあります！

【背後攻撃について】
- stealthAttack: 高い＝狡猾・戦略的、レッドの背後を狙って行動
- counterAttack: 高い＝勇敢・戦闘的、逃げずに反撃を試みる
- コメントに「攻撃」「戦う」「倒す」「勇敢」「狡猾」などがあれば高く設定

【障害物戦略】
- obstacleAwareness: 高い＝賢い・慎重、低い＝突進型・無謀
- obstacleStrategy:
  - "avoid": 障害物を避けて移動（一般的）
  - "use-as-cover": 障害物を隠れ場所として活用（臆病な草食動物向け）
  - "ignore": 障害物を気にしない（突進型の捕食者向け）

コメント内容から生物の性格や特徴を推測し、面白いキャラクターを生成してください。
`;
  }

  private createCreatureFromAI(
    aiParams: AIGeneratedCreatureParams,
    comment: { author: string; message: string; timestamp: Date }
  ): Creature {
    // ユーザーが作成するのは常にグリーン族
    const species = "グリーン族";

    const position = {
      x: Math.random() * 800,
      y: Math.random() * 600,
    };

    const velocity = {
      x: (Math.random() - 0.5) * aiParams.attributes.speed * 0.5,
      y: (Math.random() - 0.5) * aiParams.attributes.speed * 0.5,
    };

    // ランダムなtypeIDを生成（8文字の英数字）
    const typeId = `type-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .substr(2, 5)}`;

    return {
      id: `creature-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}-${performance.now()}`,
      name: aiParams.name,
      typeId: typeId, // キャラクタータイプID
      attributes: aiParams.attributes,
      appearance: aiParams.appearance,
      behavior: aiParams.behavior,
      traits: aiParams.traits,
      behaviorProgram: aiParams.behaviorProgram,
      position,
      homePosition: { ...position },
      velocity,
      energy: 100,
      age: 0,
      author: comment.author,
      comment: comment.message,
      species: species, // ユーザーが作成するのは常にグリーン族
      isNewArrival: true,
      reproductionCooldown: 0,
      reproductionHistory: {},
      wanderAngle: Math.random() * Math.PI * 2,
      vision: aiParams.vision,
      plantPoints: 0, // 植物ポイント初期値
      splitCooldown: 0, // 分裂クールダウン初期値
      survivalPoints: 0, // 生存ポイント初期値
      survivalFrames: 0, // 生存フレーム数初期値
    };
  }

  private generateDebugCreature(comment: {
    author: string;
    message: string;
    timestamp: Date;
  }): Creature {
    // コメントから簡易的にパラメータを抽出（デバッグ用）
    const message = comment.message.toLowerCase();

    // ユーザーが作成するのは常にグリーン族
    const species = "グリーン族";

    // キーワードベースの簡易解析
    const keywords = {
      speed: ["速い", "早い", "fast", "quick", "swift"],
      size: ["大きい", "巨大", "big", "large", "huge", "giant"],
      strength: ["強い", "力", "strong", "powerful", "mighty"],
      intelligence: ["賢い", "知的", "smart", "intelligent", "clever"],
      social: ["群れ", "仲間", "social", "friendly", "pack"],
    };

    let attributes = {
      speed: this.calculateAttribute(message, keywords.speed),
      size: this.calculateAttribute(message, keywords.size),
      strength: this.calculateAttribute(message, keywords.strength),
      intelligence: this.calculateAttribute(message, keywords.intelligence),
      social: this.calculateAttribute(message, keywords.social),
    };

    // グリーン族は小さめ（サイズ 1-3）
    attributes.size = Math.min(3, Math.max(1, attributes.size - 3));

    // 外見の決定
    const bodyTypes: Creature["appearance"]["bodyType"][] = [
      "circle",
      "triangle",
      "square",
      "star",
      "organic",
    ];
    const patterns: Creature["appearance"]["pattern"][] = [
      "solid",
      "stripes",
      "spots",
      "gradient",
    ];

    const appearance: Creature["appearance"] = {
      bodyType: bodyTypes[Math.floor(Math.random() * bodyTypes.length)],
      primaryColor: this.generateColor(message),
      secondaryColor: this.generateColor(message + "secondary"),
      hasEyes: Math.random() > 0.3,
      hasTentacles:
        message.includes("触手") ||
        message.includes("tentacle") ||
        Math.random() > 0.7,
      hasWings:
        message.includes("翼") ||
        message.includes("wing") ||
        Math.random() > 0.7,
      pattern: patterns[Math.floor(Math.random() * patterns.length)],
    };

    // 行動パターンの決定
    const behavior: Creature["behavior"] = {
      diet: this.determineDiet(message, attributes),
      activity: Math.random() > 0.5 ? "diurnal" : "nocturnal",
      social:
        attributes.social > 6
          ? "pack"
          : attributes.social > 3
          ? "swarm"
          : "solitary",
    };

    // ランダムな初期位置
    const position = {
      x: Math.random() * 800,
      y: Math.random() * 600,
    };

    const velocity = {
      x: (Math.random() - 0.5) * attributes.speed * 0.5,
      y: (Math.random() - 0.5) * attributes.speed * 0.5,
    };

    // 長所・短所を生成
    const traits = this.generateTraits(attributes, appearance, behavior);

    // 動作プログラムを生成
    const behaviorProgram = this.generateBehaviorProgram(
      comment.message,
      attributes,
      behavior
    );

    // パラメータの合計を調整（バランス調整）
    const balancedAttributes = this.balanceAttributes(attributes);

    // 視野を生成（種族に基づく）
    const vision = this.generateVision(species);

    // ランダムなtypeIDを生成
    const typeId = `type-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .substring(2, 7)}`;

    return {
      id: `creature-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}-${performance.now()}`,
      name: this.generateName(comment.message, comment.author),
      typeId: typeId, // キャラクタータイプID
      attributes: balancedAttributes,
      appearance,
      behavior,
      traits,
      behaviorProgram,
      position,
      homePosition: { ...position }, // 縄張りの中心（初期位置）
      velocity,
      energy: 100,
      age: 0,
      author: comment.author,
      comment: comment.message,
      species: species, // ユーザーが作成するのは常にグリーン族
      isNewArrival: true, // 新着の外来種フラグ
      reproductionCooldown: 0,
      reproductionHistory: {}, // 繁殖履歴（空）
      wanderAngle: Math.random() * Math.PI * 2, // ランダムな初期方向
      vision, // 視野
      plantPoints: 0, // 植物ポイント初期値
      splitCooldown: 0, // 分裂クールダウン初期値
      survivalPoints: 0, // 生存ポイント初期値
      survivalFrames: 0, // 生存フレーム数初期値
    };
  }

  private calculateAttribute(message: string, keywords: string[]): number {
    let score = 5; // ベーススコア

    keywords.forEach((keyword) => {
      if (message.includes(keyword)) {
        score += 2;
      }
    });

    // 0-10の範囲にクランプ
    return Math.min(10, Math.max(0, score + Math.random() * 2 - 1));
  }

  private generateColor(seed: string): string {
    // シード文字列からハッシュを生成
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }

    // ハッシュから色を生成
    const hue = Math.abs(hash % 360);
    const saturation = 60 + (Math.abs(hash) % 30);
    const lightness = 50 + (Math.abs(hash >> 8) % 20);

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  private determineDiet(
    message: string,
    attributes: Creature["attributes"]
  ): "herbivore" | "carnivore" | "omnivore" {
    if (message.includes("肉食") || message.includes("carnivore"))
      return "carnivore";
    if (message.includes("草食") || message.includes("herbivore"))
      return "herbivore";
    if (message.includes("雑食") || message.includes("omnivore"))
      return "omnivore";

    // 強さに基づいて決定
    if (attributes.strength > 7) return "carnivore";
    if (attributes.strength < 4) return "herbivore";
    return "omnivore";
  }

  // 種族に応じた視野を生成
  private generateVision(species: string): { angle: number; range: number } {
    // グリーン系：全方位だが狭い（逃げるために周囲を警戒）
    if (species === "グリーン族") {
      return {
        angle: Math.PI * 2, // 360°
        range: 50 + Math.random() * 30, // 50-80
      };
    }

    // レッド系：前方のみだが遠くまで見える（鬼として追跡）
    if (species === "レッド族") {
      return {
        angle: Math.PI * 0.5 + Math.random() * Math.PI * 0.3, // 90°～144°
        range: 150 + Math.random() * 80, // 150-230
      };
    }

    // デフォルト（グリーン）
    return {
      angle: Math.PI * 2,
      range: 50,
    };
  }

  private generateName(message: string, author: string): string {
    // ランダムな生物名の接頭辞と接尾辞
    const prefixes = [
      "キラ",
      "モフ",
      "ゴロ",
      "ピカ",
      "ズン",
      "ニャ",
      "ワン",
      "クル",
      "フワ",
      "ドン",
    ];
    const suffixes = [
      "ザウルス",
      "モン",
      "ちゃん",
      "くん",
      "ー",
      "リン",
      "ポン",
      "タン",
      "マル",
      "ノフ",
    ];

    // メッセージから特徴的なキーワードを抽出
    const message_lower = message.toLowerCase();
    let baseName = "";

    // 色から名前を生成
    const colorMap: { [key: string]: string } = {
      赤: "レッド",
      青: "ブルー",
      緑: "グリーン",
      黄: "イエロー",
      白: "ホワイト",
      黒: "ブラック",
      紫: "パープル",
      橙: "オレンジ",
      red: "レッド",
      blue: "ブルー",
      green: "グリーン",
      yellow: "イエロー",
    };

    for (const [key, value] of Object.entries(colorMap)) {
      if (message_lower.includes(key)) {
        baseName = value;
        break;
      }
    }

    // ベース名がない場合はランダム生成
    if (!baseName) {
      const hash = this.simpleHash(message + author);
      const prefix = prefixes[hash % prefixes.length];
      const suffix = suffixes[(hash >> 4) % suffixes.length];
      baseName = prefix + suffix;
    }

    return baseName;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private generateTraits(
    attributes: Creature["attributes"],
    appearance: Creature["appearance"],
    behavior: Creature["behavior"]
  ): { strengths: string[]; weaknesses: string[] } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // 属性に基づいて長所を決定
    if (attributes.speed > 7) strengths.push("素早い移動");
    if (attributes.size > 7) strengths.push("巨体");
    if (attributes.strength > 7) strengths.push("強力な攻撃力");
    if (attributes.intelligence > 7) strengths.push("高い知性");
    if (attributes.social > 7) strengths.push("群れでの連携");

    // 属性に基づいて短所を決定
    if (attributes.speed < 3) weaknesses.push("鈍足");
    if (attributes.size < 3) weaknesses.push("小さな体");
    if (attributes.strength < 3) weaknesses.push("非力");
    if (attributes.intelligence < 3) weaknesses.push("低い知性");
    if (attributes.social < 3) weaknesses.push("孤独");

    // 外見の特徴に基づいて
    if (appearance.hasWings) {
      strengths.push("飛行能力");
    }
    if (appearance.hasTentacles) {
      strengths.push("触手による器用さ");
    }
    if (!appearance.hasEyes) {
      weaknesses.push("視覚なし");
    }

    // 行動パターンに基づいて
    if (behavior.diet === "carnivore") {
      strengths.push("狩猟本能");
      weaknesses.push("植物を食べられない");
    }
    if (behavior.diet === "herbivore") {
      strengths.push("穏やかな性格");
      weaknesses.push("戦闘力が低い");
    }
    if (behavior.social === "pack") {
      strengths.push("仲間との絆");
    }
    if (behavior.social === "solitary") {
      weaknesses.push("単独行動");
    }

    // 最低1つずつは保証
    if (strengths.length === 0) strengths.push("適応力が高い");
    if (weaknesses.length === 0) weaknesses.push("平凡");

    return { strengths, weaknesses };
  }

  // パラメータのバランス調整（合計を一定に保つ）
  private balanceAttributes(
    attributes: Creature["attributes"]
  ): Creature["attributes"] {
    const targetTotal = 30; // 合計目標値
    const currentTotal = Object.values(attributes).reduce(
      (sum, val) => sum + val,
      0
    );

    if (currentTotal === 0) return attributes;

    // 各属性を比例配分
    const ratio = targetTotal / currentTotal;

    return {
      speed: Math.min(10, Math.max(1, attributes.speed * ratio)),
      size: Math.min(10, Math.max(1, attributes.size * ratio)),
      strength: Math.min(10, Math.max(1, attributes.strength * ratio)),
      intelligence: Math.min(10, Math.max(1, attributes.intelligence * ratio)),
      social: Math.min(10, Math.max(1, attributes.social * ratio)),
    };
  }

  // 動作プログラム生成（コメントから周囲の状況に応じた動き方を生成）
  private generateBehaviorProgram(
    message: string,
    attributes: Creature["attributes"],
    behavior: Creature["behavior"]
  ): BehaviorProgram {
    const message_lower = message.toLowerCase();

    // デフォルト値
    let approachAlly = 0.5; // 同種族への接近度
    let approachEnemy = -0.3; // 異種族への接近度
    let fleeWhenWeak = 0.5; // 弱い時の逃走傾向
    let aggressiveness = 0.3; // 攻撃性
    let curiosity = 0.5; // 好奇心
    let territoriality = 0.3; // 縄張り意識

    // ===== キーワード辞書による動作プログラム調整 =====

    // 攻撃・戦闘系キーワード
    const aggressiveKeywords = [
      "攻撃",
      "戦う",
      "戦闘",
      "狩り",
      "捕食",
      "凶暴",
      "獰猛",
      "猛",
      "aggressive",
      "attack",
      "fight",
      "hunt",
      "predator",
      "fierce",
      "violent",
      "キラー",
      "殺",
      "襲う",
      "噛む",
      "bite",
      "kill",
      "hunter",
    ];
    if (aggressiveKeywords.some((k) => message_lower.includes(k))) {
      aggressiveness = Math.min(1, aggressiveness + 0.5);
      approachEnemy = Math.min(1, approachEnemy + 0.8);
      fleeWhenWeak = Math.max(0, fleeWhenWeak - 0.3);
    }

    // 臆病・逃走系キーワード
    const shyKeywords = [
      "臆病",
      "逃げ",
      "慎重",
      "怖がり",
      "警戒",
      "用心",
      "隠れ",
      "shy",
      "timid",
      "flee",
      "escape",
      "cautious",
      "careful",
      "hide",
      "coward",
      "怯え",
      "小心",
      "nervous",
      "scared",
    ];
    if (shyKeywords.some((k) => message_lower.includes(k))) {
      fleeWhenWeak = Math.min(1, fleeWhenWeak + 0.4);
      approachEnemy = Math.max(-1, approachEnemy - 0.6);
      aggressiveness = Math.max(0, aggressiveness - 0.3);
    }

    // 群れ・社会性キーワード
    const socialKeywords = [
      "群れ",
      "仲間",
      "集団",
      "協力",
      "社会",
      "団結",
      "家族",
      "友達",
      "pack",
      "group",
      "social",
      "team",
      "together",
      "friend",
      "family",
      "swarm",
      "コロニー",
      "colony",
      "集まる",
      "gather",
    ];
    if (socialKeywords.some((k) => message_lower.includes(k))) {
      approachAlly = Math.min(1, approachAlly + 0.4);
      territoriality = Math.max(0, territoriality - 0.3);
    }

    // 孤独・一匹狼系キーワード
    const solitaryKeywords = [
      "孤独",
      "一匹",
      "単独",
      "独り",
      "ぼっち",
      "一人",
      "solitary",
      "alone",
      "lone",
      "solo",
      "independent",
      "loner",
    ];
    if (solitaryKeywords.some((k) => message_lower.includes(k))) {
      approachAlly = Math.max(-1, approachAlly - 0.5);
      territoriality = Math.min(1, territoriality + 0.3);
    }

    // 縄張り・防衛系キーワード
    const territorialKeywords = [
      "縄張り",
      "守る",
      "防衛",
      "テリトリー",
      "領域",
      "巣",
      "territory",
      "defend",
      "protect",
      "guard",
      "defensive",
      "nest",
      "home",
    ];
    if (territorialKeywords.some((k) => message_lower.includes(k))) {
      territoriality = Math.min(1, territoriality + 0.5);
      approachEnemy = Math.max(-1, approachEnemy - 0.2);
    }

    // 好奇心・探索系キーワード
    const curiousKeywords = [
      "好奇心",
      "探索",
      "冒険",
      "探検",
      "調べ",
      "興味",
      "curious",
      "explore",
      "adventure",
      "investigate",
      "wander",
      "roam",
      "discover",
    ];
    if (curiousKeywords.some((k) => message_lower.includes(k))) {
      curiosity = Math.min(1, curiosity + 0.4);
      territoriality = Math.max(0, territoriality - 0.2);
    }

    // 速い・俊敏系キーワード（逃走に影響）
    const fastKeywords = [
      "速い",
      "早い",
      "俊敏",
      "素早い",
      "スピード",
      "fast",
      "quick",
      "swift",
      "speedy",
      "agile",
      "nimble",
    ];
    if (fastKeywords.some((k) => message_lower.includes(k))) {
      fleeWhenWeak = Math.min(1, fleeWhenWeak + 0.2); // 速いと逃げやすい
      curiosity = Math.min(1, curiosity + 0.1);
    }

    // 大きい・巨大系キーワード（攻撃性に影響）
    const bigKeywords = [
      "大きい",
      "巨大",
      "でかい",
      "巨",
      "ビッグ",
      "big",
      "large",
      "huge",
      "giant",
      "massive",
    ];
    if (bigKeywords.some((k) => message_lower.includes(k))) {
      aggressiveness = Math.min(1, aggressiveness + 0.2);
      fleeWhenWeak = Math.max(0, fleeWhenWeak - 0.2); // 大きいと逃げにくい
    }

    // 賢い・知的系キーワード
    const smartKeywords = [
      "賢い",
      "知的",
      "頭がいい",
      "聡明",
      "知恵",
      "smart",
      "intelligent",
      "clever",
      "wise",
      "genius",
    ];
    if (smartKeywords.some((k) => message_lower.includes(k))) {
      fleeWhenWeak = Math.min(1, fleeWhenWeak + 0.2); // 賢いと危険を回避
      curiosity = Math.min(1, curiosity + 0.2);
    }

    // ===== 食性による調整 =====
    if (behavior.diet === "carnivore") {
      approachEnemy = Math.min(1, approachEnemy + 0.4); // 肉食は獲物に近づく
      aggressiveness = Math.min(1, aggressiveness + 0.3);
      fleeWhenWeak = Math.max(0, fleeWhenWeak - 0.2);
    } else if (behavior.diet === "herbivore") {
      approachEnemy = Math.max(-1, approachEnemy - 0.4); // 草食は敵から逃げる
      aggressiveness = Math.max(0, aggressiveness - 0.2);
      fleeWhenWeak = Math.min(1, fleeWhenWeak + 0.3);
    }

    // ===== 社会性による調整 =====
    if (behavior.social === "pack" || behavior.social === "swarm") {
      approachAlly = Math.min(1, approachAlly + 0.3);
      territoriality = Math.max(0, territoriality - 0.2);
    } else if (behavior.social === "solitary") {
      approachAlly = Math.max(-1, approachAlly - 0.3);
      territoriality = Math.min(1, territoriality + 0.2);
    }

    // ===== 属性値による微調整 =====
    if (attributes.strength > 7) {
      aggressiveness = Math.min(1, aggressiveness + 0.15);
      fleeWhenWeak = Math.max(0, fleeWhenWeak - 0.1);
    }
    if (attributes.strength < 3) {
      fleeWhenWeak = Math.min(1, fleeWhenWeak + 0.15);
      aggressiveness = Math.max(0, aggressiveness - 0.1);
    }

    if (attributes.intelligence > 7) {
      fleeWhenWeak = Math.min(1, fleeWhenWeak + 0.1);
      curiosity = Math.min(1, curiosity + 0.15);
    }

    if (attributes.social > 7) {
      approachAlly = Math.min(1, approachAlly + 0.15);
    }
    if (attributes.social < 3) {
      approachAlly = Math.max(-1, approachAlly - 0.15);
    }

    if (attributes.speed > 7) {
      curiosity = Math.min(1, curiosity + 0.1);
    }

    // -1.0 ~ 1.0 または 0.0 ~ 1.0 に正規化
    // 障害物対応を追加
    let obstacleAwareness = 0.5;
    let obstacleStrategy: "avoid" | "use-as-cover" | "ignore" = "avoid";

    // 賢い生物は障害物をよく認識
    if (attributes.intelligence > 6) {
      obstacleAwareness = Math.min(1, obstacleAwareness + 0.3);
    }

    // 臆病な草食動物は隠れる
    if (behavior.diet === "herbivore" && fleeWhenWeak > 0.6) {
      obstacleStrategy = "use-as-cover";
      obstacleAwareness = Math.min(1, obstacleAwareness + 0.2);
    }

    // 攻撃的な肉食動物は障害物を無視することがある
    if (behavior.diet === "carnivore" && aggressiveness > 0.7) {
      obstacleStrategy = Math.random() > 0.5 ? "ignore" : "avoid";
    }

    // 背後攻撃・反撃傾向の計算
    let stealthAttack = 0.3; // デフォルト
    let counterAttack = 0.2; // デフォルト

    // 賢い生物は背後攻撃を好む
    if (attributes.intelligence > 6) {
      stealthAttack = Math.min(1, stealthAttack + 0.3);
    }

    // 攻撃的な生物は反撃を好む
    if (aggressiveness > 0.5) {
      counterAttack = Math.min(1, counterAttack + aggressiveness * 0.4);
      stealthAttack = Math.min(1, stealthAttack + 0.2);
    }

    // 臆病な生物は背後攻撃を好むが反撃はしない
    if (fleeWhenWeak > 0.7) {
      stealthAttack = Math.min(1, stealthAttack + 0.2);
      counterAttack = Math.max(0, counterAttack - 0.2);
    }

    return {
      approachAlly: Math.max(-1, Math.min(1, approachAlly)),
      approachEnemy: Math.max(-1, Math.min(1, approachEnemy)),
      fleeWhenWeak: Math.max(0, Math.min(1, fleeWhenWeak)),
      aggressiveness: Math.max(0, Math.min(1, aggressiveness)),
      curiosity: Math.max(0, Math.min(1, curiosity)),
      territoriality: Math.max(0, Math.min(1, territoriality)),
      obstacleAwareness: Math.max(0, Math.min(1, obstacleAwareness)),
      obstacleStrategy,
      stealthAttack: Math.max(0, Math.min(1, stealthAttack)),
      counterAttack: Math.max(0, Math.min(1, counterAttack)),
    };
  }

  // レッド族（鬼）を生成する
  generateRedCreature(index: number): Creature {
    const redNames = [
      "ハンター",
      "ストーカー",
      "シャドウ",
      "プレデター",
      "レイヴン",
      "ダークネス",
      "レッドアイ",
      "ブラッドハウンド",
    ];

    const position = {
      x: Math.random() * 800,
      y: Math.random() * 600,
    };

    // レッド族の属性（大きく、強く、グリーンより10%速い）
    const attributes = {
      speed: 7 + Math.floor(Math.random() * 3), // 7-9（グリーンの平均6より10%程度速い）
      size: 5 + Math.floor(Math.random() * 3), // 5-7
      strength: 7 + Math.floor(Math.random() * 3), // 7-9
      intelligence: 5 + Math.floor(Math.random() * 3), // 5-7
      social: 2 + Math.floor(Math.random() * 3), // 2-4（単独行動）
    };

    const appearance = {
      bodyType: "triangle" as const,
      primaryColor: `#${Math.floor(180 + Math.random() * 75).toString(16)}0000`,
      secondaryColor: `#${Math.floor(100 + Math.random() * 80).toString(
        16
      )}0000`,
      hasEyes: true,
      hasTentacles: false,
      hasWings: false,
      pattern: "solid" as const,
    };

    const behavior = {
      diet: "carnivore" as const,
      activity: "cathemeral" as const,
      social: "solitary" as const,
    };

    const traits = {
      strengths: ["追跡能力", "攻撃力", "持久力"],
      weaknesses: ["背後から弱い", "群れない"],
    };

    // 鬼らしい行動プログラム
    const behaviorProgram = {
      approachAlly: -0.3, // 同族をあまり気にしない
      approachEnemy: 0.9, // グリーンに積極的に接近
      fleeWhenWeak: 0.1, // ほとんど逃げない
      aggressiveness: 0.9, // 非常に攻撃的
      curiosity: 0.7, // 積極的に動き回る
      territoriality: 0.2, // 縄張り意識は低い
      obstacleAwareness: 0.4, // 障害物認識は中程度
      obstacleStrategy: "avoid" as const, // 基本は避ける
      stealthAttack: 0.0, // 背後攻撃しない（鬼側）
      counterAttack: 0.0, // 反撃不要（常に攻撃側）
    };

    const vision = this.generateVision("レッド族");

    // システム生成のレッドは固定typeID
    const typeId = `red-system-${index}`;

    return {
      id: `red-creature-${Date.now()}-${index}-${performance.now()}`,
      name: redNames[index % redNames.length],
      typeId: typeId, // システムレッドの固定typeID
      attributes,
      appearance,
      behavior,
      traits,
      behaviorProgram,
      position,
      homePosition: { ...position },
      velocity: {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
      },
      energy: 100,
      age: 0,
      author: "システム",
      comment: "自動生成されたレッド族（鬼）",
      species: "レッド族",
      isNewArrival: false,
      reproductionCooldown: 0,
      reproductionHistory: {},
      wanderAngle: Math.random() * Math.PI * 2,
      vision,
      plantPoints: 0, // レッドはポイントを集めない
      splitCooldown: 0,
      survivalPoints: 0, // 生存ポイント初期値
      survivalFrames: 0, // 生存フレーム数初期値
    };
  }

  // グリーン族（逃げる側）を生成する（自動補充用）
  generateGreenCreature(index: number): Creature {
    const greenNames = [
      "リーフ",
      "モス",
      "フォレスト",
      "スプラウト",
      "バド",
      "クローバー",
      "ミント",
      "セージ",
    ];

    const position = {
      x: 50 + Math.random() * 700, // 画面端を避ける
      y: 50 + Math.random() * 500,
    };

    // グリーン族の属性（小さめ、素早い、知的）
    const attributes = {
      speed: 5 + Math.floor(Math.random() * 3), // 5-7
      size: 3 + Math.floor(Math.random() * 2), // 3-4
      strength: 2 + Math.floor(Math.random() * 2), // 2-3
      intelligence: 6 + Math.floor(Math.random() * 3), // 6-8
      social: 5 + Math.floor(Math.random() * 4), // 5-8（群れる傾向）
    };

    const appearance = {
      bodyType: "circle" as const,
      primaryColor: `#${Math.floor(40 + Math.random() * 40).toString(
        16
      )}${Math.floor(180 + Math.random() * 75).toString(16)}${Math.floor(
        40 + Math.random() * 40
      ).toString(16)}`,
      secondaryColor: `#${Math.floor(60 + Math.random() * 40).toString(
        16
      )}${Math.floor(120 + Math.random() * 60).toString(16)}${Math.floor(
        60 + Math.random() * 40
      ).toString(16)}`,
      hasEyes: true,
      hasTentacles: false,
      hasWings: false,
      pattern: "solid" as const,
    };

    const behavior = {
      diet: "herbivore" as const,
      activity: "diurnal" as const,
      social: "pack" as const,
    };

    const traits = {
      strengths: ["逃走能力", "警戒心", "繁殖力"],
      weaknesses: ["戦闘力が低い", "肉食動物に弱い"],
    };

    // 草食動物らしい行動プログラム
    const behaviorProgram = {
      approachAlly: 0.3, // 仲間に近づく
      approachEnemy: -0.9, // 敵から逃げる
      fleeWhenWeak: 0.9, // 弱いと逃げる
      aggressiveness: 0.1, // 攻撃性は低い
      curiosity: 0.5, // 適度に動く
      territoriality: 0.3, // 縄張り意識は低め
      obstacleAwareness: 0.7, // 障害物をよく認識
      obstacleStrategy: "use-as-cover" as const, // 隠れ場所として活用
      stealthAttack: 0.4, // 背後攻撃は中程度
      counterAttack: 0.1, // 反撃はほぼしない
    };

    const vision = this.generateVision("グリーン族");

    // システム生成のグリーンは固定typeID
    const typeId = `green-system-${index}`;

    return {
      id: `green-creature-${Date.now()}-${index}-${performance.now()}`,
      name: greenNames[index % greenNames.length],
      typeId: typeId, // システムグリーンの固定typeID
      attributes,
      appearance,
      behavior,
      traits,
      behaviorProgram,
      position,
      homePosition: { ...position },
      velocity: {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
      },
      energy: 100,
      age: 0,
      author: "システム",
      comment: "自動生成されたグリーン族",
      species: "グリーン族",
      isNewArrival: false,
      reproductionCooldown: 0,
      reproductionHistory: {},
      wanderAngle: Math.random() * Math.PI * 2,
      vision,
      plantPoints: 0,
      splitCooldown: 0,
      survivalPoints: 0, // 生存ポイント初期値
      survivalFrames: 0, // 生存フレーム数初期値
    };
  }

  // 将来的にLLM APIを使用する場合のプレースホルダー
  private async analyzeWithLLM(message: string): Promise<any> {
    // TODO: OpenAI or Anthropic APIを使用
    // コメントから生物の特徴と動作プログラムを生成
    throw new Error("LLM API not implemented yet");
  }
}

import { GoogleGenerativeAI } from "@google/generative-ai";
import { DUMB_BEHAVIOR_PROGRAM, initialSpeciesData } from "./initialSpecies";

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
  ignoreObstacleBlockedTargets: boolean; // 障害物で遮られた目標を無視するか
  avoidObstacleInterior: boolean; // 障害物の内部を目標にしないか
  activeHunterAttack: number; // ハンター積極攻撃度 (0.0 ~ 1.0)
  // 新しい行動パラメータ
  flockingBehavior: number; // 群れ行動 (0.0 ~ 1.0)
  foodGreed: number; // 食欲 (0.0 ~ 1.0)
  panicThreshold: number; // パニック閾値 (0.0 ~ 1.0)
  bravery: number; // 勇敢さ (0.0 ~ 1.0)
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
  svgCode: string; // AI生成されたSVGコード
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
  svgCode?: string; // AI生成されたSVGコード（オプション、なければappearanceから生成）
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
  isFromYouTube?: boolean; // YouTube コメントからの生成か
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
  // 戦闘状態
  isRetreating: boolean; // 巣に撤退中（レッド用）
  isVulnerable: boolean; // 無防備状態（攻撃されやすい）
  vulnerableUntil: number; // 無防備状態の終了フレーム
  lastAttackedBy: string | null; // 最後に攻撃してきた相手のID
  lastAttackedAt: number; // 最後に攻撃された時刻（フレーム数）
  isCounterAttacking: boolean; // 反撃中（回避せず立ち向かっている）
  // 生成時刻と無敵期間
  createdAt?: number; // 生成された時刻（ミリ秒）
  isInvulnerable?: boolean; // 無敵状態（新規生成後の保護期間）
  invulnerableUntil?: number; // 無敵状態の終了時刻（ミリ秒）
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

  /**
   * コメントを分析して、キャラ生成リクエストかどうか、どの種族かを判定
   */
  analyzeComment(message: string): {
    isCreatureRequest: boolean;
    requestsRed: boolean;
    keywords: string[];
  } {
    const lowerMessage = message.toLowerCase();

    // キャラ生成キーワード
    const creatureKeywords = [
      "キャラ生成",
      "キャラ作成",
      "生成",
      "作成",
      "作って",
      "つくって",
      "create",
      "generate",
    ];

    // レッド族（攻撃キャラ）キーワード
    const redKeywords = [
      "レッド",
      "赤",
      "鬼",
      "攻撃キャラ",
      "敵キャラ",
      "敵",
      "ボス",
      "モンスター",
      "捕食者",
      "ハンター",
      "red",
      "enemy",
      "boss",
      "predator",
      "hunter",
      "攻撃側",
      "追いかける",
      "追う側",
    ];

    const foundKeywords: string[] = [];

    // キャラ生成リクエストかチェック
    const isCreatureRequest = creatureKeywords.some((keyword) => {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
        return true;
      }
      return false;
    });

    // レッド族を要求しているかチェック
    const requestsRed = redKeywords.some((keyword) => {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
        return true;
      }
      return false;
    });

    return {
      isCreatureRequest,
      requestsRed,
      keywords: foundKeywords,
    };
  }

  /**
   * コメントと現在の状況から、生成すべき種族を決定
   */
  determineSpecies(
    message: string,
    currentRedCount: number,
    maxRedForUserCreation: number = 3
  ): {
    species: "グリーン族" | "レッド族";
    reason: string;
  } {
    const analysis = this.analyzeComment(message);

    // レッド族を要求していて、かつ現在のレッド数が上限未満の場合のみレッド族
    if (analysis.requestsRed && currentRedCount < maxRedForUserCreation) {
      return {
        species: "レッド族",
        reason: `レッド族キーワード検出 (${analysis.keywords.join(
          ", "
        )}), 現在${currentRedCount}体 < 上限${maxRedForUserCreation}体`,
      };
    }

    // それ以外はグリーン族
    if (analysis.requestsRed && currentRedCount >= maxRedForUserCreation) {
      return {
        species: "グリーン族",
        reason: `レッド族要求あるが上限到達 (現在${currentRedCount}体 >= 上限${maxRedForUserCreation}体)`,
      };
    }

    return {
      species: "グリーン族",
      reason: "デフォルト（グリーン族）",
    };
  }

  async generateFromComment(
    comment: {
      author: string;
      message: string;
      timestamp: Date;
    },
    options?: {
      species?: "グリーン族" | "レッド族";
      isDumb?: boolean; // おバカモード（ランダム移動のみ）
    }
  ): Promise<Creature> {
    // デバッグモードまたはGeminiが初期化されていない場合
    if (this.debugMode || !this.genAI) {
      return this.generateDebugCreature(
        comment,
        options?.species,
        options?.isDumb
      );
    }

    try {
      return await this.generateWithAI(comment, options?.species);
    } catch (error) {
      console.error("AI generation failed, falling back to debug mode:", error);
      return this.generateDebugCreature(
        comment,
        options?.species,
        options?.isDumb
      );
    }
  }

  // AI生成を強制的に使用（テスト用）
  async generateWithAIForced(
    comment: {
      author: string;
      message: string;
      timestamp: Date;
    },
    species?: "グリーン族" | "レッド族"
  ): Promise<Creature> {
    if (!this.genAI) {
      throw new Error(
        "Gemini API is not initialized. Please set GEMINI_API_KEY in .env.local"
      );
    }
    return this.generateWithAI(comment, species);
  }

  private async generateWithAI(
    comment: {
      author: string;
      message: string;
      timestamp: Date;
    },
    species?: "グリーン族" | "レッド族"
  ): Promise<Creature> {
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
    return this.createCreatureFromAI(aiParams, comment, species);
  }

  private buildPrompt(comment: { author: string; message: string }): string {
    return `
コメント投稿者: ${comment.author}
コメント内容: ${comment.message}

【重要】キャラクター名の生成について：
- 投稿者名「${comment.author}」を参考にした名前を提案してください
- 例: 投稿者名が「太郎」なら「タロウティー」、「sakura」なら「サクラティー」など
- 投稿者名 + 「ティー」「茶」などを組み合わせるとゲームの世界観に合います
- コメント内容からも特徴を取り入れてください

以下のJSON形式で生物のパラメータを生成してください：

{
  "name": "生物の名前（投稿者名を参考に、ティー系の名前を提案）",
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
  "svgCode": "SVGコード（以下の仕様に従って生成）",
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
    "counterAttack": 0.0〜1.0（反撃傾向、高いと逃げずに反撃を試みる）,
    "ignoreObstacleBlockedTargets": true/false（障害物で遮られた目標を無視するか、賢い生物はtrue）,
    "avoidObstacleInterior": true/false（障害物の内部を目標にしないか、普通はtrue）,
    "activeHunterAttack": 0.0〜1.0（ハンター積極攻撃度、高いと回り込んで攻撃）,
    "flockingBehavior": 0.0〜1.0（群れ行動、高いと仲間と一緒に移動）,
    "foodGreed": 0.0〜1.0（食欲、高いと植物を積極的に探す）,
    "panicThreshold": 0.0〜1.0（パニック閾値、低いとすぐパニック逃走）,
    "bravery": 0.0〜1.0（勇敢さ、高いと仲間を助けに行く）
  },
  "vision": {
    "angle": 視野角（ラジアン、0.5〜6.28、捕食者は狭く、草食は広く）,
    "range": 視野距離（50〜200）
  }
}

【SVGコード生成の仕様】
- viewBox="0 0 100 100"で中心が(50, 50)のSVGコードを生成してください
- コメント内容に基づいて、生物の特徴を視覚的に表現してください
- 複数のSVG要素（circle、rect、polygon、path等）を組み合わせて、ユニークで面白いデザインにしてください
- primaryColorとsecondaryColorを使用して色付けしてください
- hasEyes=trueの場合は目を表現してください
- hasTentacles=trueの場合は触手を表現してください
- hasWings=trueの場合は翼を表現してください
- patternに応じて模様を追加してください（stripes=縞模様、spots=斑点、gradient=グラデーション）
- 完全なSVGコード（<svg>タグを含まない、内部要素のみ）を文字列として返してください
- 例: "<circle cx='50' cy='50' r='30' fill='#22c55e'/><circle cx='40' cy='45' r='5' fill='#000'/><circle cx='60' cy='45' r='5' fill='#000'/>"

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

【障害物認識の詳細設定】
- ignoreObstacleBlockedTargets: true＝賢い、壁の反対側のアイテムを探らない
- avoidObstacleInterior: true＝賢い、壁の中のアイテムを目標にしない
- 通常の生物はどちらもtrue推奨、極端に知性が低い生物のみfalse

【ハンター攻撃】
- activeHunterAttack: 高い＝積極的にレッド族を攻撃し、回り込む動きをする
- コメントに「攻撃的」「戦闘」「ハンター」「狩る」などがあれば高く設定

【群れ・社会行動（新機能）】
- flockingBehavior: 高い＝群れで行動、仲間の近くにいようとする
  コメントに「群れ」「仲間」「集団」「チーム」などがあれば高く
- foodGreed: 高い＝食いしん坊、植物を見つけるとすぐ食べに行く
  コメントに「食べる」「腹減り」「グルメ」「飢餓」などがあれば高く
- panicThreshold: 低い＝臆病でパニックになりやすい
  コメントに「臆病」「怖がり」「ビビり」などがあれば低く（0.2〜0.4）
- bravery: 高い＝勇敢、仲間がピンチの時に助けに行く
  コメントに「勇者」「ヒーロー」「守護」「正義」などがあれば高く

コメント内容から生物の性格や特徴を推測し、面白いキャラクターを生成してください。
`;
  }

  private createCreatureFromAI(
    aiParams: AIGeneratedCreatureParams,
    comment: { author: string; message: string; timestamp: Date },
    speciesParam?: "グリーン族" | "レッド族"
  ): Creature {
    // 種族を決定（指定があればそれを使用、なければグリーン族）
    const species = speciesParam || "グリーン族";

    // パラメータの合計を調整（バランス調整）- 全属性MAXを防ぐ
    const balancedAttributes = this.balanceAttributes(aiParams.attributes);

    // キャラクターを画面下部から追加（矢印マーク位置付近）
    const position = {
      x: 400 + (Math.random() - 0.5) * 200, // 中央付近（300-500の範囲）
      y: 550, // 画面下部
    };

    const velocity = {
      x: (Math.random() - 0.5) * balancedAttributes.speed * 0.5,
      y: (Math.random() - 0.5) * balancedAttributes.speed * 0.5,
    };

    // ランダムなtypeIDを生成（8文字の英数字）
    const typeId = `type-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .substr(2, 5)}`;

    // グリーン族はティー系の名前を使用
    const creatureName =
      species === "グリーン族"
        ? this.generateName(comment.message, comment.author, balancedAttributes)
        : aiParams.name;

    return {
      id: `creature-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}-${performance.now()}`,
      name: creatureName,
      typeId: typeId, // キャラクタータイプID
      attributes: balancedAttributes,
      appearance: aiParams.appearance,
      svgCode: aiParams.svgCode, // AI生成されたSVGコード
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
      // 戦闘状態の初期値
      isRetreating: false, // 撤退中ではない
      isVulnerable: false, // 無防備ではない
      vulnerableUntil: 0, // 無防備状態の終了フレーム
      lastAttackedBy: null, // 最後に攻撃してきた相手
      lastAttackedAt: 0, // 最後に攻撃された時刻
      isCounterAttacking: false, // 反撃中ではない
      // 生成時刻と無敵期間（30秒間）
      createdAt: Date.now(),
      isInvulnerable: true,
      invulnerableUntil: Date.now() + 30000, // 30秒間無敵
    };
  }

  private generateDebugCreature(
    comment: {
      author: string;
      message: string;
      timestamp: Date;
    },
    speciesParam?: "グリーン族" | "レッド族",
    isDumb?: boolean // おバカモード
  ): Creature {
    // コメントから簡易的にパラメータを抽出（デバッグ用）
    const message = comment.message.toLowerCase();

    // 種族を決定（指定があればそれを使用、なければグリーン族）
    const species = speciesParam || "グリーン族";

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

    // レッド族は大きめ、グリーン族は小さめ
    if (species === "レッド族") {
      attributes.size = Math.min(10, Math.max(5, attributes.size + 2));
      attributes.strength = Math.min(10, Math.max(5, attributes.strength + 2));
    } else {
      // グリーン族は小さめ（サイズ 1-3）
      attributes.size = Math.min(3, Math.max(1, attributes.size - 3));
    }

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
      primaryColor: this.generateColor(message, species),
      secondaryColor: this.generateColor(message + "secondary", species),
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

    // キャラクターを画面外下部から追加（画面に入ってくる演出）
    const position = {
      x: 400 + (Math.random() - 0.5) * 200, // 中央付近（300-500の範囲）
      y: 650, // 画面外下部（ゆっくり画面内に入ってくる）
    };

    const velocity = {
      x: (Math.random() - 0.5) * attributes.speed * 0.5,
      y: -1 - Math.random() * 0.5, // 上向き（画面内に入る方向）
    };

    // 長所・短所を生成
    const traits = this.generateTraits(attributes, appearance, behavior);

    // 動作プログラムを生成（おバカモードの場合はDUMB_BEHAVIOR_PROGRAMを使用）
    const behaviorProgram = isDumb
      ? { ...DUMB_BEHAVIOR_PROGRAM }
      : this.generateBehaviorProgram(comment.message, attributes, behavior);

    // パラメータの合計を調整（バランス調整）
    const balancedAttributes = this.balanceAttributes(attributes);

    // 視野を生成（種族に基づく）
    const vision = this.generateVision(
      species,
      balancedAttributes.intelligence
    );

    // ランダムなtypeIDを生成
    const typeId = `type-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .substring(2, 7)}`;

    // デバッグモード用の簡易SVGコードを生成
    const svgCode = this.generateSimpleSVG(appearance, balancedAttributes);

    return {
      id: `creature-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}-${performance.now()}`,
      name: this.generateName(
        comment.message,
        comment.author,
        balancedAttributes
      ),
      typeId: typeId, // キャラクタータイプID
      attributes: balancedAttributes,
      appearance,
      svgCode, // デバッグモード用の簡易SVGコード
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
      // 戦闘状態の初期値
      isRetreating: false, // 撤退中ではない
      isVulnerable: false, // 無防備ではない
      vulnerableUntil: 0, // 無防備状態の終了フレーム
      lastAttackedBy: null, // 最後に攻撃してきた相手
      lastAttackedAt: 0, // 最後に攻撃された時刻
      isCounterAttacking: false, // 反撃中ではない
      // 生成時刻と無敵期間（30秒間）
      createdAt: Date.now(),
      isInvulnerable: true,
      invulnerableUntil: Date.now() + 30000, // 30秒間無敵
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

  private generateColor(seed: string, species?: string): string {
    // シード文字列からハッシュを生成
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }

    // 種族に応じた色相を設定
    let hue: number;
    if (species === "グリーン族") {
      // グリーン族は緑系（80-160度）
      hue = 80 + (Math.abs(hash) % 80);
    } else if (species === "レッド族") {
      // レッド族は赤系（-30【30度）
      hue = (Math.abs(hash) % 60) - 30;
      if (hue < 0) hue += 360;
    } else {
      // その他はランダム
      hue = Math.abs(hash % 360);
    }
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

  // 種族に応じた視野を生成（知性で最大値が決まる）
  private generateVision(
    species: string,
    intelligence: number = 5
  ): { angle: number; range: number } {
    // 知性による視野の最大値係数（0-10 → 0.3-1.0）
    // 知性10で100%、知性0で30%の最大視野
    const intelligenceFactor = 0.3 + (intelligence / 10) * 0.7;

    // グリーン系：知性が高いほど広い視野と遠い距離
    if (species === "グリーン族") {
      // 最大360°、最大150の視野距離
      const maxAngle = Math.PI * 2;
      const maxRange = 150;
      // 知性による上限 + ランダム変動（±10%）
      const angleLimit = maxAngle * intelligenceFactor;
      const rangeLimit = maxRange * intelligenceFactor;
      return {
        angle: Math.min(maxAngle, angleLimit * (0.9 + Math.random() * 0.2)),
        range: Math.max(30, rangeLimit * (0.9 + Math.random() * 0.2)),
      };
    }

    // レッド系：前方重視、知性が高いほど遠くまで見える
    if (species === "レッド族") {
      // 最大180°（前方半分）、最大300の視野距離
      const maxAngle = Math.PI; // 180°
      const maxRange = 300;
      const angleLimit = (Math.PI * 0.4 + maxAngle * 0.6) * intelligenceFactor;
      const rangeLimit = maxRange * intelligenceFactor;
      return {
        angle: Math.max(
          Math.PI * 0.3,
          angleLimit * (0.9 + Math.random() * 0.2)
        ),
        range: Math.max(100, rangeLimit * (0.9 + Math.random() * 0.2)),
      };
    }

    // デフォルト（グリーン）
    return {
      angle: Math.PI * 2 * intelligenceFactor,
      range: 50 * intelligenceFactor,
    };
  }

  private generateName(
    _message: string,
    author: string,
    _attributes?: Creature["attributes"]
  ): string {
    // ユーザー名をそのままキャラクター名として使用
    return author;
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

    // デフォルト値（明示されない限り「おバカ」= 逃げない、植物を追わない）
    let approachAlly = 0; // 同種族への接近度（デフォルト：なし）
    let approachEnemy = 0; // 異種族への接近度（デフォルト：なし）
    let fleeWhenWeak = 0; // 弱い時の逃走傾向（デフォルト：逃げない）
    let aggressiveness = 0; // 攻撃性（デフォルト：なし）
    let curiosity = 1.0; // 好奇心（デフォルト：ランダム移動）
    let territoriality = 0; // 縄張り意識（デフォルト：なし）

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

    // 速い・俊敏系キーワード（逃走に影響しない）
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
      // 速い場合でも逃げる動作は明示的な指示がない限り行わない
      curiosity = Math.min(1, curiosity + 0.1);
    }

    // 大きい・巨大系キーワード（攻撃性に影響しない）
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
      // 大きい場合でも攻撃性や逃走は明示的な指示がない限り変更しない
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
      // 賢い場合でも逃げる動作は明示的な指示がない限り行わない
      curiosity = Math.min(1, curiosity + 0.2);
    }

    // ===== 食性による調整 =====
    // ※ 食性による自動調整は削除しました
    // 明示的なキーワードがない限り、逃げる動作は行わない

    // ===== 社会性による調整 =====
    // ※ 社会性による自動調整は削除しました

    // ===== 属性値による微調整 =====
    // ※ 属性値によるfleeWhenWeakの自動調整は削除しました
    // 明示的なキーワードがない限り、逃げる動作は行わない

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

    // 新しいパラメータの計算
    // 賢い生物は障害物認識が高い
    const ignoreObstacleBlockedTargets = attributes.intelligence >= 4;
    const avoidObstacleInterior = attributes.intelligence >= 3;

    // ハンター積極攻撃度
    let activeHunterAttack = 0.3; // デフォルト
    if (aggressiveness > 0.6) {
      activeHunterAttack = Math.min(1, activeHunterAttack + 0.4);
    }
    if (attributes.intelligence > 6) {
      activeHunterAttack = Math.min(1, activeHunterAttack + 0.2);
    }

    // 群れ行動の計算
    let flockingBehavior = 0.3; // デフォルト
    if (behavior.social === "pack" || behavior.social === "swarm") {
      flockingBehavior = Math.min(1, flockingBehavior + 0.5);
    }
    if (attributes.social > 6) {
      flockingBehavior = Math.min(1, flockingBehavior + 0.2);
    }

    // 食欲の計算（デフォルト：植物を追わない）
    let foodGreed = 0; // デフォルト：植物を追わない
    // キーワードチェック（明示的に指定された場合のみ植物を追う）
    const foodKeywords = [
      "食べる",
      "腹減",
      "グルメ",
      "飢餓",
      "大食い",
      "eat",
      "hungry",
      "greedy",
      "植物",
      "草",
      "葉",
      "plant",
      "grass",
      "leaf",
    ];
    if (foodKeywords.some((k) => message_lower.includes(k))) {
      foodGreed = Math.min(1, foodGreed + 0.7);
    }

    // パニック閾値の計算（低いほどパニックになりやすい）
    let panicThreshold = 0.5; // デフォルト
    if (fleeWhenWeak > 0.7) {
      panicThreshold = Math.max(0.1, panicThreshold - 0.3);
    }
    if (attributes.intelligence > 6) {
      panicThreshold = Math.min(1, panicThreshold + 0.2); // 賢いと冷静
    }
    const panicKeywords = [
      "臆病",
      "怖がり",
      "ビビり",
      "coward",
      "scared",
      "nervous",
    ];
    if (panicKeywords.some((k) => message_lower.includes(k))) {
      panicThreshold = Math.max(0.1, panicThreshold - 0.3);
    }

    // 勇敢さの計算
    let bravery = 0.3; // デフォルト
    if (aggressiveness > 0.5) {
      bravery = Math.min(1, bravery + 0.3);
    }
    const braveryKeywords = [
      "勇者",
      "ヒーロー",
      "守護",
      "正義",
      "勇敢",
      "brave",
      "hero",
      "protect",
      "justice",
    ];
    if (braveryKeywords.some((k) => message_lower.includes(k))) {
      bravery = Math.min(1, bravery + 0.4);
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
      ignoreObstacleBlockedTargets,
      avoidObstacleInterior,
      activeHunterAttack: Math.max(0, Math.min(1, activeHunterAttack)),
      flockingBehavior: Math.max(0, Math.min(1, flockingBehavior)),
      foodGreed: Math.max(0, Math.min(1, foodGreed)),
      panicThreshold: Math.max(0, Math.min(1, panicThreshold)),
      bravery: Math.max(0, Math.min(1, bravery)),
    };
  }

  // デバッグモード用の簡易SVGコードを生成
  private generateSimpleSVG(
    appearance: Creature["appearance"],
    attributes: Creature["attributes"]
  ): string {
    const primaryColor = appearance.primaryColor;
    const secondaryColor = appearance.secondaryColor;
    let svgElements: string[] = [];

    // 体の形状
    switch (appearance.bodyType) {
      case "circle":
        svgElements.push(
          `<circle cx="50" cy="50" r="25" fill="${primaryColor}"/>`
        );
        break;
      case "triangle":
        svgElements.push(
          `<polygon points="50,25 25,75 75,75" fill="${primaryColor}"/>`
        );
        break;
      case "square":
        svgElements.push(
          `<rect x="25" y="25" width="50" height="50" fill="${primaryColor}"/>`
        );
        break;
      case "star":
        svgElements.push(
          `<polygon points="50,20 55,40 75,40 60,52 65,72 50,60 35,72 40,52 25,40 45,40" fill="${primaryColor}"/>`
        );
        break;
      case "organic":
        svgElements.push(
          `<ellipse cx="50" cy="50" rx="28" ry="22" fill="${primaryColor}"/>`
        );
        break;
    }

    // パターン
    if (appearance.pattern === "stripes") {
      svgElements.push(
        `<rect x="40" y="30" width="5" height="40" fill="${secondaryColor}" opacity="0.7"/>`
      );
      svgElements.push(
        `<rect x="55" y="30" width="5" height="40" fill="${secondaryColor}" opacity="0.7"/>`
      );
    } else if (appearance.pattern === "spots") {
      svgElements.push(
        `<circle cx="40" cy="45" r="4" fill="${secondaryColor}" opacity="0.8"/>`
      );
      svgElements.push(
        `<circle cx="60" cy="45" r="4" fill="${secondaryColor}" opacity="0.8"/>`
      );
      svgElements.push(
        `<circle cx="50" cy="60" r="3" fill="${secondaryColor}" opacity="0.8"/>`
      );
    }

    // 目
    if (appearance.hasEyes) {
      svgElements.push(`<circle cx="42" cy="45" r="4" fill="white"/>`);
      svgElements.push(`<circle cx="42" cy="45" r="2" fill="black"/>`);
      svgElements.push(`<circle cx="58" cy="45" r="4" fill="white"/>`);
      svgElements.push(`<circle cx="58" cy="45" r="2" fill="black"/>`);
    }

    // 触手
    if (appearance.hasTentacles) {
      svgElements.push(
        `<line x1="30" y1="70" x2="20" y2="85" stroke="${secondaryColor}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`
      );
      svgElements.push(
        `<line x1="70" y1="70" x2="80" y2="85" stroke="${secondaryColor}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`
      );
    }

    // 翼
    if (appearance.hasWings) {
      svgElements.push(
        `<ellipse cx="20" cy="50" rx="15" ry="8" fill="${secondaryColor}" opacity="0.6"/>`
      );
      svgElements.push(
        `<ellipse cx="80" cy="50" rx="15" ry="8" fill="${secondaryColor}" opacity="0.6"/>`
      );
    }

    return svgElements.join("");
  }

  // レッド族（鬼）を生成する
  generateRedCreature(index: number): Creature {
    // 名前と性格のペア（コーヒー系列の名前）
    const redProfiles = [
      { name: "エスプレッソ", curiosity: 0.9, aggressiveness: 0.95, speed: 8 },
      { name: "カプチーノ", curiosity: 0.6, aggressiveness: 0.85, speed: 7 },
      { name: "モカ", curiosity: 0.7, aggressiveness: 0.9, speed: 9 },
      { name: "アメリカーノ", curiosity: 0.8, aggressiveness: 1.0, speed: 8 },
      { name: "ラテ", curiosity: 0.75, aggressiveness: 0.88, speed: 7 },
      { name: "マキアート", curiosity: 0.5, aggressiveness: 0.8, speed: 8 },
      { name: "リストレット", curiosity: 0.85, aggressiveness: 0.92, speed: 9 },
      { name: "コルタード", curiosity: 0.95, aggressiveness: 0.87, speed: 8 },
    ];

    const profile = redProfiles[index % redProfiles.length];

    // レッド族は画面上部中央から登場
    const position = {
      x: 400 + (Math.random() - 0.5) * 100, // 中央付近（350-450の範囲）
      y: 50, // 画面上部
    };

    // レッド族の属性（個性に応じて調整）
    const attributes = {
      speed: profile.speed, // 個性に応じた速度
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

    // 鬼らしい行動プログラム（個性に応じて調整）
    const behaviorProgram = {
      approachAlly: -0.3, // 同族をあまり気にしない
      approachEnemy: 0.9, // グリーンに積極的に接近
      fleeWhenWeak: 0.1, // ほとんど逃げない
      aggressiveness: profile.aggressiveness, // 個性に応じた攻撃性
      curiosity: profile.curiosity, // 個性に応じた好奇心
      territoriality: 0.2, // 縄張り意識は低い
      obstacleAwareness: 0.4, // 障害物認識は中程度
      obstacleStrategy: "avoid" as const, // 基本は避ける
      stealthAttack: 0.0, // 背後攻撃しない（鬼側）
      counterAttack: 0.0, // 反撃不要（常に攻撃側）
      ignoreObstacleBlockedTargets: true, // 賢い（障害物越しの目標を無視）
      avoidObstacleInterior: true, // 賢い（障害物内部を目標にしない）
      activeHunterAttack: 0.0, // レッドは他のレッドを攻撃しない
      flockingBehavior: 0.1, // 群れない
      foodGreed: 0.0, // 植物を食べない
      panicThreshold: 1.0, // パニックにならない
      bravery: 0.0, // 勇敢さ不要（鬼側）
    };

    const vision = this.generateVision("レッド族", attributes.intelligence);

    // システム生成のレッドは固定typeID
    const typeId = `red-system-${index}`;

    return {
      id: `red-creature-${Date.now()}-${index}-${performance.now()}`,
      name: profile.name,
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
      // 戦闘状態の初期値
      isRetreating: false, // 撤退中ではない
      isVulnerable: false, // 無防備ではない
      vulnerableUntil: 0, // 無防備状態の終了フレーム
      lastAttackedBy: null, // 最後に攻撃してきた相手
      lastAttackedAt: 0, // 最後に攻撃された時刻
      isCounterAttacking: false, // 反撃中ではない
      // 生成時刻と無敵期間（30秒間）
      createdAt: Date.now(),
      isInvulnerable: true,
      invulnerableUntil: Date.now() + 30000, // 30秒間無敵
    };
  }

  // グリーン族（逃げる側）を生成する（自動補充用）
  // initialSpeciesDataのおバカキャラクターを使用
  generateGreenCreature(index: number): Creature {
    // initialSpeciesDataからランダムに選択
    const speciesData = initialSpeciesData[index % initialSpeciesData.length];
    const comment = speciesData.comments[0];

    // グリーン族は画面外下部中央から登場（画面に入ってくる演出）
    const position = {
      x: 400 + (Math.random() - 0.5) * 100, // 中央付近（350-450の範囲）
      y: 650, // 画面外下部（ゆっくり画面内に入ってくる）
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
      strengths: ["のんびり", "平和的", "マイペース"],
      weaknesses: ["戦闘力が低い", "判断力が低い"],
    };

    // おバカ用の行動プログラム（initialSpeciesDataのisDumbに従う）
    const behaviorProgram = speciesData.isDumb
      ? { ...DUMB_BEHAVIOR_PROGRAM }
      : {
          approachAlly: 0.3,
          approachEnemy: -0.9,
          fleeWhenWeak: 0.9,
          aggressiveness: 0.1,
          curiosity: 0.5,
          territoriality: 0.3,
          obstacleAwareness: 0.7,
          obstacleStrategy: "use-as-cover" as const,
          stealthAttack: 0.4,
          counterAttack: 0.1,
          ignoreObstacleBlockedTargets: true,
          avoidObstacleInterior: true,
          activeHunterAttack: 0.4,
          flockingBehavior: 0.6,
          foodGreed: 0.7,
          panicThreshold: 0.4,
          bravery: 0.2,
        };

    const vision = this.generateVision("グリーン族", attributes.intelligence);

    // システム生成のグリーンは固定typeID
    const typeId = `green-system-${index}`;

    // 名前を生成（authorを使用）
    const name = this.generateName(comment, speciesData.author, attributes);

    return {
      id: `green-creature-${Date.now()}-${index}-${performance.now()}`,
      name: name,
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
      comment: comment,
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
      // 戦闘状態の初期値
      isRetreating: false, // 撤退中ではない
      isVulnerable: false, // 無防備ではない
      vulnerableUntil: 0, // 無防備状態の終了フレーム
      lastAttackedBy: null, // 最後に攻撃してきた相手
      lastAttackedAt: 0, // 最後に攻撃された時刻
      isCounterAttacking: false, // 反撃中ではない
      // 生成時刻と無敵期間（30秒間）
      createdAt: Date.now(),
      isInvulnerable: true,
      invulnerableUntil: Date.now() + 30000, // 30秒間無敵
    };
  }

  // 将来的にLLM APIを使用する場合のプレースホルダー
  private async analyzeWithLLM(message: string): Promise<any> {
    // TODO: OpenAI or Anthropic APIを使用
    // コメントから生物の特徴と動作プログラムを生成
    throw new Error("LLM API not implemented yet");
  }
}

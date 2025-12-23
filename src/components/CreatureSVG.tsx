import { Creature } from "../types/creature";

interface CreatureSVGProps {
  creature: Creature;
  behaviorState?:
    | "chasing"
    | "fleeing"
    | "eating"
    | "counter"
    | "vulnerable"
    | "retreating"
    | "idle";
  isSpawning?: boolean; // 登場アニメーション中
  isDying?: boolean; // 消滅アニメーション中
}

const CreatureSVG = ({
  creature,
  behaviorState = "idle",
  isSpawning = false,
  isDying = false,
}: CreatureSVGProps) => {
  const { position, appearance, attributes } = creature;
  const size = attributes.size * 2.5 + 5; // 5-30px（小さく）

  // パターン定義
  const getPattern = () => {
    const patternId = `pattern-${creature.id}`;

    switch (appearance.pattern) {
      case "stripes":
        return (
          <defs>
            <pattern
              id={patternId}
              patternUnits="userSpaceOnUse"
              width="10"
              height="10"
            >
              <rect width="5" height="10" fill={appearance.primaryColor} />
              <rect
                x="5"
                width="5"
                height="10"
                fill={appearance.secondaryColor}
              />
            </pattern>
          </defs>
        );
      case "spots":
        return (
          <defs>
            <pattern
              id={patternId}
              patternUnits="userSpaceOnUse"
              width="20"
              height="20"
            >
              <rect width="20" height="20" fill={appearance.primaryColor} />
              <circle cx="10" cy="10" r="4" fill={appearance.secondaryColor} />
            </pattern>
          </defs>
        );
      case "gradient":
        return (
          <defs>
            <linearGradient id={patternId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={appearance.primaryColor} />
              <stop offset="100%" stopColor={appearance.secondaryColor} />
            </linearGradient>
          </defs>
        );
      default:
        return null;
    }
  };

  const getFill = () => {
    if (appearance.pattern === "solid") {
      return appearance.primaryColor;
    }
    return `url(#pattern-${creature.id})`;
  };

  // 体の形状を描画
  const renderBody = () => {
    const fill = getFill();

    switch (appearance.bodyType) {
      case "circle":
        return (
          <circle cx={position.x} cy={position.y} r={size / 2} fill={fill} />
        );

      case "triangle":
        const points = [
          `${position.x},${position.y - size / 2}`,
          `${position.x - size / 2},${position.y + size / 2}`,
          `${position.x + size / 2},${position.y + size / 2}`,
        ].join(" ");
        return <polygon points={points} fill={fill} />;

      case "square":
        return (
          <rect
            x={position.x - size / 2}
            y={position.y - size / 2}
            width={size}
            height={size}
            fill={fill}
          />
        );

      case "star":
        const starPoints = [];
        for (let i = 0; i < 10; i++) {
          const radius = i % 2 === 0 ? size / 2 : size / 4;
          const angle = (i * Math.PI) / 5 - Math.PI / 2;
          const x = position.x + radius * Math.cos(angle);
          const y = position.y + radius * Math.sin(angle);
          starPoints.push(`${x},${y}`);
        }
        return <polygon points={starPoints.join(" ")} fill={fill} />;

      case "organic":
        // ベジェ曲線を使った有機的な形状
        const path = `
          M ${position.x - size / 2} ${position.y}
          Q ${position.x - size / 2} ${position.y - size / 2}, ${position.x} ${
          position.y - size / 2
        }
          Q ${position.x + size / 2} ${position.y - size / 2}, ${
          position.x + size / 2
        } ${position.y}
          Q ${position.x + size / 2} ${position.y + size / 2}, ${position.x} ${
          position.y + size / 2
        }
          Q ${position.x - size / 2} ${position.y + size / 2}, ${
          position.x - size / 2
        } ${position.y}
        `;
        return <path d={path} fill={fill} />;
    }
  };

  // 目を描画
  const renderEyes = () => {
    if (!appearance.hasEyes) return null;

    const eyeSize = size / 8;
    const eyeOffset = size / 4;

    return (
      <g>
        <circle
          cx={position.x - eyeOffset}
          cy={position.y - eyeOffset}
          r={eyeSize}
          fill="white"
        />
        <circle
          cx={position.x - eyeOffset}
          cy={position.y - eyeOffset}
          r={eyeSize / 2}
          fill="black"
        />
        <circle
          cx={position.x + eyeOffset}
          cy={position.y - eyeOffset}
          r={eyeSize}
          fill="white"
        />
        <circle
          cx={position.x + eyeOffset}
          cy={position.y - eyeOffset}
          r={eyeSize / 2}
          fill="black"
        />
      </g>
    );
  };

  // 触手を描画
  const renderTentacles = () => {
    if (!appearance.hasTentacles) return null;

    const tentacles = [];
    const numTentacles = 4;

    for (let i = 0; i < numTentacles; i++) {
      const angle = (i * Math.PI * 2) / numTentacles + Math.PI / 2;
      const startX = position.x + (size / 2) * Math.cos(angle);
      const startY = position.y + (size / 2) * Math.sin(angle);
      const endX = startX + size * 0.6 * Math.cos(angle);
      const endY = startY + size * 0.6 * Math.sin(angle);

      tentacles.push(
        <line
          key={i}
          x1={startX}
          y1={startY}
          x2={endX}
          y2={endY}
          stroke={appearance.secondaryColor}
          strokeWidth={size / 10}
          strokeLinecap="round"
          opacity={0.7}
        />
      );
    }

    return <g>{tentacles}</g>;
  };

  // 翼を描画
  const renderWings = () => {
    if (!appearance.hasWings) return null;

    const wingSize = size * 0.8;

    return (
      <g opacity={0.6}>
        <ellipse
          cx={position.x - size / 2}
          cy={position.y}
          rx={wingSize / 2}
          ry={wingSize / 4}
          fill={appearance.secondaryColor}
        />
        <ellipse
          cx={position.x + size / 2}
          cy={position.y}
          rx={wingSize / 2}
          ry={wingSize / 4}
          fill={appearance.secondaryColor}
        />
      </g>
    );
  };

  // 視野を描画
  const renderFieldOfView = () => {
    if (!creature.vision) return null;

    const { angle, range } = creature.vision;
    const facingAngle = creature.wanderAngle || 0;

    // 種族に応じた色を設定
    const speciesType =
      creature.species.includes("レッド") || creature.species.includes("red")
        ? "red"
        : "green";
    const baseColor = speciesType === "red" ? "255, 80, 80" : "80, 200, 80";

    // 360度視野の場合は円を描画
    if (angle >= Math.PI * 2) {
      return (
        <circle
          cx={position.x}
          cy={position.y}
          r={range}
          fill={`rgba(${baseColor}, 0.08)`}
          stroke={`rgba(${baseColor}, 0.2)`}
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      );
    }

    // 扇形の視野を描画
    const startAngle = facingAngle - angle / 2;
    const endAngle = facingAngle + angle / 2;

    // 扇形のパスを計算
    const startX = position.x + range * Math.cos(startAngle);
    const startY = position.y + range * Math.sin(startAngle);
    const endX = position.x + range * Math.cos(endAngle);
    const endY = position.y + range * Math.sin(endAngle);

    // 大きな円弧か小さな円弧かを判定
    const largeArcFlag = angle > Math.PI ? 1 : 0;

    const path = `
      M ${position.x} ${position.y}
      L ${startX} ${startY}
      A ${range} ${range} 0 ${largeArcFlag} 1 ${endX} ${endY}
      Z
    `;

    return (
      <path
        d={path}
        fill={`rgba(${baseColor}, 0.08)`}
        stroke={`rgba(${baseColor}, 0.25)`}
        strokeWidth={1}
        strokeDasharray="4 2"
      />
    );
  };

  // エネルギーバー
  const renderEnergyBar = () => {
    const barWidth = size;
    const barHeight = 3;
    const barY = position.y - size / 2 - 8;

    return (
      <g>
        <rect
          x={position.x - barWidth / 2}
          y={barY}
          width={barWidth}
          height={barHeight}
          fill="rgba(0, 0, 0, 0.3)"
          rx={1}
        />
        <rect
          x={position.x - barWidth / 2}
          y={barY}
          width={(barWidth * creature.energy) / 100}
          height={barHeight}
          fill={
            creature.energy > 50
              ? "#10b981"
              : creature.energy > 25
              ? "#f59e0b"
              : "#ef4444"
          }
          rx={1}
        />
      </g>
    );
  };

  // 名前ラベル
  const renderNameLabel = () => {
    const labelY = position.y + size / 2 + 15;

    return (
      <g>
        {/* 名前の背景 */}
        <rect
          x={position.x - 30}
          y={labelY - 10}
          width={60}
          height={14}
          fill="rgba(0, 0, 0, 0.6)"
          rx={3}
        />
        {/* 生物名 */}
        <text
          x={position.x}
          y={labelY}
          textAnchor="middle"
          fontSize="9"
          fill="#ffffff"
          fontWeight="600"
        >
          {creature.name}
        </text>
        {/* コメント者名 */}
        <text
          x={position.x}
          y={labelY + 10}
          textAnchor="middle"
          fontSize="7"
          fill="#94a3b8"
        >
          by {creature.author}
        </text>
      </g>
    );
  };

  // 状態アイコンを表示
  const renderStatusIcon = () => {
    if (behaviorState === "idle" && !isSpawning) return null;

    const iconY = position.y - size / 2 - 20; // 調整したY位置
    let iconClass = "";

    // スポーン中は特別なアイコンかもしくは表示しない
    if (isSpawning) {
      // iconClass = "state-spawn"; // もしスポーンアイコンがあれば
      return null; // スポーンアニメーション中はアイコンなしにする
    }

    switch (behaviorState) {
      case "chasing":
        iconClass = "state-chase";
        break;
      case "fleeing":
        iconClass = "state-flee";
        break;
      case "eating":
        iconClass = "state-eat";
        break;
      case "counter":
        iconClass = "state-counter";
        break;
      case "vulnerable":
        iconClass = "state-vulnerable";
        break;
      case "retreating":
        iconClass = "state-retreat";
        break;
      default:
        return null;
    }

    // アイコンのサイズ
    const iconSize = 24;

    return (
      <foreignObject
        x={position.x - iconSize / 2}
        y={iconY - iconSize / 2}
        width={iconSize}
        height={iconSize}
        className="status-icon-wrapper"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            height: "100%",
          }}
        >
          <span
            className={`state-icon ${iconClass}`}
            style={{ width: "100%", height: "100%" }}
          ></span>
        </div>
      </foreignObject>
    );
  };

  // アニメーションクラス名を決定
  const getAnimationClass = () => {
    if (isSpawning) return "creature creature-spawn";
    if (isDying) return "creature creature-die";
    return "creature";
  };

  return (
    <g className={getAnimationClass()} opacity={creature.energy > 0 ? 1 : 0.3}>
      {getPattern()}
      {renderFieldOfView()}
      {renderWings()}
      {renderTentacles()}
      {renderBody()}
      {renderEyes()}
      {renderEnergyBar()}
      {renderStatusIcon()}
      {renderNameLabel()}
    </g>
  );
};

export default CreatureSVG;

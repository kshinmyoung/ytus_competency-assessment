/**
 * 역량 나침반 — 이 사이트의 시그니처 그래픽.
 *
 * 나침반 눈금 위에 역량 점수를 얹어, 빛이 어느 방향까지 닿았는지를 면적으로 보여준다.
 * 기준을 넘긴 방위는 금색으로 점등되고, 넘지 못한 방위는 어둡게 남는다.
 * 어두운 점은 '부족한 역량'이 아니라 '아직 빛이 닿지 않은 방향'이다.
 */

/**
 * 삼각함수 결과는 반드시 반올림해서 쓴다.
 * Math.sin/cos 는 정확한 반올림이 보장되지 않아 서버와 브라우저의 마지막 자리가
 * 갈릴 수 있고, 그대로 SVG 속성에 넣으면 하이드레이션 불일치가 난다.
 */
function r(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export type CompetencyAxis = {
  label: string;
  score: number;
};

type Props = {
  axes: CompetencyAxis[];
  /** 축 하나의 만점 */
  max?: number;
  /** 이 점수 이상이면 빛이 닿은 것으로 본다 */
  threshold?: number;
  className?: string;
};

const R_MAX = 116; // 만점일 때의 반지름

export default function CompetencyCompass({
  axes,
  max = 25,
  threshold,
  className,
}: Props) {
  const lit = threshold ?? max * 0.8;
  const n = axes.length;

  const at = (i: number, radius: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2; // 12시부터 시계방향
    return { x: r(Math.cos(a) * radius), y: r(Math.sin(a) * radius) };
  };

  const points = axes.map((axis, i) => {
    const ratio = Math.max(0, Math.min(1, axis.score / max));
    return {
      ...axis,
      ratio,
      isLit: axis.score >= lit,
      outer: at(i, R_MAX),
      value: at(i, Math.max(ratio * R_MAX, 4)),
      labelPos: at(i, R_MAX + 30),
    };
  });

  const polygon = points.map((p) => `${p.value.x},${p.value.y}`).join(" ");

  return (
    <svg viewBox="-168 -158 336 340" className={className} role="img"
         aria-label={`역량 나침반. ${points.map((p) => `${p.label} ${p.score}점`).join(", ")}`}>
      <defs>
        <radialGradient id="ys-cc-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--ys-light)" stopOpacity="0.55" />
          <stop offset="45%" stopColor="var(--ys-gold)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--ys-gold)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 눈금 링 — 25% 간격 */}
      {[0.25, 0.5, 0.75, 1].map((step) => (
        <circle
          key={step}
          r={r(R_MAX * step)}
          fill="none"
          stroke="var(--ys-navy-line)"
          strokeWidth="1"
          opacity={step === 1 ? 0.9 : 0.45}
        />
      ))}

      {/* 방위선 */}
      <g stroke="var(--ys-navy-line)" strokeWidth="1" opacity="0.5">
        {points.map((p) => (
          <line key={`axis-${p.label}`} x1="0" y1="0" x2={p.outer.x} y2={p.outer.y} />
        ))}
      </g>

      {/* 바깥 눈금 */}
      <g stroke="var(--ys-navy-line)" strokeWidth="1" opacity="0.7">
        {Array.from({ length: 24 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 24;
          const major = i % 6 === 0;
          return (
            <line
              key={i}
              x1={r(Math.cos(a) * (R_MAX + 6))}
              y1={r(Math.sin(a) * (R_MAX + 6))}
              x2={r(Math.cos(a) * (R_MAX + (major ? 16 : 11)))}
              y2={r(Math.sin(a) * (R_MAX + (major ? 16 : 11)))}
            />
          );
        })}
      </g>

      {/* 빛이 닿은 영역 */}
      <circle r={R_MAX} fill="url(#ys-cc-glow)" />
      <polygon points={polygon} fill="var(--ys-gold)" fillOpacity="0.2" />
      <polygon
        points={polygon}
        fill="none"
        stroke="var(--ys-gold)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* 중심의 빛 */}
      <path
        d="M 0,-19 Q 2,-2 14,0 Q 2,2 0,19 Q -2,2 -14,0 Q -2,-2 0,-19 Z"
        fill="var(--ys-light)"
      />

      {points.map((p) => (
        <g key={p.label}>
          <circle
            cx={p.value.x}
            cy={p.value.y}
            r={p.isLit ? 5 : 3.5}
            fill={p.isLit ? "var(--ys-gold)" : "var(--ys-mist)"}
          />
          <text
            x={p.labelPos.x}
            y={p.labelPos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11.5"
            fontWeight={p.isLit ? 600 : 400}
            fill={p.isLit ? "var(--ys-gold)" : "var(--ys-mist)"}
          >
            {p.label}
          </text>
          <text
            x={p.labelPos.x}
            y={p.labelPos.y + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-data"
            fontSize="10"
            fill="var(--ys-mist)"
            opacity="0.75"
          >
            {p.score}
          </text>
        </g>
      ))}
    </svg>
  );
}

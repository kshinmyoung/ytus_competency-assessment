/**
 * 나침반 — 사이트의 시그니처 그래픽.
 *
 * 로고(public/logo.png)의 4방위 별을 그대로 확장한 형태다.
 * 오목한 변을 가진 세로로 긴 마름모 + 내부의 작은 빛.
 * 나침반은 빛을 만들지 않고 받는다 — 광원은 별 바깥이 아니라 중심에 있다.
 *
 * points 를 주면 방위별 점등 상태를 표시한다. 값을 주지 않으면 장식용으로만 그린다.
 */

/**
 * 삼각함수 결과를 좌표로 쓸 때는 반드시 반올림한다.
 * Math.sin/cos 는 명세상 정확히 반올림될 의무가 없어 Node 와 브라우저의 마지막 자리가
 * 갈릴 수 있고, 그 값이 SVG 속성 문자열로 나가면 하이드레이션 불일치가 난다.
 */
function r(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 로고 별의 형태. ry = 세로 반지름, rx = 가로 반지름, k = 오목한 정도 */
function starPath(ry: number, rx: number, k = ry * 0.145): string {
  return `M 0,${-ry} Q ${k},${-k} ${rx},0 Q ${k},${k} 0,${ry} Q ${-k},${k} ${-rx},0 Q ${-k},${-k} 0,${-ry} Z`;
}

export type CompassPoint = {
  label: string;
  /** 빛이 닿았는지 — 미달을 '실패'가 아니라 '아직 닿지 않음'으로 읽는다 */
  lit: boolean;
};

type Props = {
  /** 6방위 역량. 주지 않으면 점과 라벨을 그리지 않는다 */
  points?: CompassPoint[];
  className?: string;
  /** 중심에서 번지는 광원 */
  glow?: boolean;
  title?: string;
};

export default function CompassRose({ points, className, glow = true, title }: Props) {
  const gradientId = "ys-compass-glow";

  return (
    <svg
      viewBox="-160 -160 320 320"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {glow && (
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--ys-light)" stopOpacity="0.5" />
            <stop offset="30%" stopColor="var(--ys-gold)" stopOpacity="0.22" />
            <stop offset="68%" stopColor="var(--ys-gold)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--ys-gold)" stopOpacity="0" />
          </radialGradient>
        </defs>
      )}

      {glow && <circle r="158" fill={`url(#${gradientId})`} />}

      {/* 방위 링 */}
      <circle r="132" fill="none" stroke="var(--ys-navy-line)" strokeWidth="1" />
      <circle r="99" fill="none" stroke="var(--ys-navy-line)" strokeWidth="1" />
      <circle r="66" fill="none" stroke="var(--ys-navy-line)" strokeWidth="1" />

      {/* 방위선 — 이게 있어야 반짝이가 아니라 나침반으로 읽힌다 */}
      <g stroke="var(--ys-navy-line)" strokeWidth="1">
        <line x1="0" y1="-132" x2="0" y2="132" />
        <line x1="-132" y1="0" x2="132" y2="0" />
      </g>
      <g stroke="var(--ys-navy-line)" strokeWidth="1" opacity="0.55">
        <line x1="-93" y1="-93" x2="93" y2="93" />
        <line x1="-93" y1="93" x2="93" y2="-93" />
      </g>
      {/* 바깥 눈금 */}
      <g stroke="var(--ys-navy-line)" strokeWidth="1" opacity="0.8">
        {Array.from({ length: 24 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 24;
          return (
            <line
              key={i}
              x1={r(Math.cos(a) * 132)}
              y1={r(Math.sin(a) * 132)}
              x2={r(Math.cos(a) * (i % 6 === 0 ? 142 : 137))}
              y2={r(Math.sin(a) * (i % 6 === 0 ? 142 : 137))}
            />
          );
        })}
      </g>

      {/* 로고에서 가져온 4방위 별 */}
      <path d={starPath(122, 89)} fill="var(--ys-blue)" opacity="0.26" />
      <path
        d={starPath(122, 89)}
        fill="none"
        stroke="var(--ys-gold)"
        strokeWidth="1.3"
        opacity="0.8"
      />

      {/* 내부의 작은 빛 — 로고 안 스파클이 광원의 심이 된다 */}
      <path d={starPath(38, 28)} fill="var(--ys-light)" />

      {points?.map((point, i) => {
        // 12시부터 시계방향으로 균등 배치
        const angle = (Math.PI * 2 * i) / points.length - Math.PI / 2;
        const x = r(Math.cos(angle) * 132);
        const y = r(Math.sin(angle) * 132);
        const lx = r(Math.cos(angle) * 152);
        const ly = r(Math.sin(angle) * 152);
        return (
          <g key={point.label}>
            <circle
              cx={x}
              cy={y}
              r={point.lit ? 5.5 : 4}
              fill={point.lit ? "var(--ys-gold)" : "#31496A"}
            />
            <text
              x={lx}
              y={ly + 3}
              textAnchor="middle"
              fontSize="10.5"
              fill={point.lit ? "var(--ys-gold)" : "#5B6E8A"}
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 워드마크용 Y — 로고 심볼을 글자로 옮긴 것.
 * 위에 4방위 별(로고 안의 작은 빛), 아래에 Y(줄기에서 두 팔이 바깥 위로 뻗고 안쪽이 오목).
 *
 * 뷰박스 아래변이 베이스라인이다. 획 끝이 둥근 선이라 굵기의 절반만큼 경로 바깥으로
 * 잉크가 번지므로, 줄기 끝을 107 에 두고 굵기를 22 로 잡아 잉크 바닥을 118 에 맞췄다.
 * 별은 캡 하이트 위로 올라가 다른 글자보다 높이 뜬다.
 */
export default function YGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 118"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* 로고 안의 작은 빛 — 오목한 변을 가진 4방위 별 */}
      <path
        d="M 50,1 Q 52.9,14.1 61,17 Q 52.9,19.9 50,33 Q 47.1,19.9 39,17 Q 47.1,14.1 50,1 Z"
        fill="currentColor"
      />

      {/* Y — 왼팔 · 오른팔 · 줄기 */}
      <g fill="none" stroke="currentColor" strokeWidth="22" strokeLinecap="round">
        <path d="M 17,48 Q 40,64 50,86" />
        <path d="M 83,48 Q 60,64 50,86" />
        <path d="M 50,80 L 50,107" />
      </g>
    </svg>
  );
}

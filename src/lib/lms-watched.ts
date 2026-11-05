/**
 * 본 구간 다루기.
 *
 * 진도는 "서로 다른 구간의 합" 이라 이미 본 데를 다시 봐도 올라가지 않는다.
 * 그런데 화면에 퍼센트만 보여 주면 학생은 처음부터 다시 보고, 진도가 그대로니
 * "다 봤는데 완료가 안 된다"는 문의로 돌아온다. 그래서 안 본 구간을 그려 준다.
 */

/** video_progress.watched 는 int4multirange 다. PostgREST 는 '{[0,2479),[4772,4912)}' 문자열로 준다. */
export function parseWatchedRanges(raw: string | null | undefined): [number, number][] {
  if (!raw) return [];
  const out: [number, number][] = [];
  for (const m of raw.matchAll(/\[(\d+),(\d+)\)/g)) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) out.push([start, end]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** 영상 길이 대비 안 본 구간 [시작초, 끝초). 5초 미만 틈은 구간 경계 오차라 무시한다 */
export function unwatchedGaps(ranges: [number, number][], durationSec: number): [number, number][] {
  if (!durationSec || durationSec <= 0) return [];
  const MIN_GAP_SEC = 5;
  const sorted = [...(ranges ?? [])].sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start - cursor >= MIN_GAP_SEC) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (durationSec - cursor >= MIN_GAP_SEC) gaps.push([cursor, durationSec]);
  return gaps;
}

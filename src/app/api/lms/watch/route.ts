/**
 * 진도 배치 기록 (서버 전용)
 * POST /api/lms/watch  body: { contentId, segments: [[start,end],...], rate }
 *
 * 진도율은 여기서 계산하지 않는다. lms_record_watch_batch RPC 결과를 그대로 내려보낸다.
 * student_id 는 세션에서만 가져오고 body 값을 신뢰하지 않는다.
 */
import { NextResponse } from "next/server";
import { assertContentAccess, assertStudent, lmsErrorResponse } from "@/lib/auth/lms-api";

/** 학생에게 그대로 보여줄 수 있는 거부 사유 */
const REJECT_MESSAGES: Record<string, string> = {
  RATE_EXCEEDED: "허용된 재생 속도를 넘었습니다. 1.5배 이하로 시청해 주세요.",
  NO_VALID_SEGMENT: "건너뛴 구간은 진도에 포함되지 않습니다.",
  TOO_MANY_SEGMENTS: "한 번에 보낼 수 있는 구간 수를 넘었습니다.",
  CONTENT_NOT_FOUND: "콘텐츠를 찾을 수 없습니다.",
  INVALID_PAYLOAD: "잘못된 요청입니다.",
};

export async function POST(request: Request) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType } = result;

    const body = await request.json();
    const contentId = Number(body.contentId);
    if (!contentId) return NextResponse.json({ error: "contentId가 필요합니다." }, { status: 400 });

    const access = await assertContentAccess(admin, studentId, studentType, contentId);
    if (access instanceof NextResponse) return access;

    const segments = Array.isArray(body.segments) ? body.segments : [];
    if (segments.length === 0) {
      return NextResponse.json({ error: "전송할 구간이 없습니다." }, { status: 400 });
    }

    const rate = Number(body.rate);

    const { data, error } = await admin.rpc("lms_record_watch_batch", {
      p_student_id: studentId,
      p_content_id: contentId,
      p_segments: segments,
      p_rate: Number.isFinite(rate) && rate > 0 ? rate : 1.0,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const payload = data as {
      status: string; reason?: string;
      progress?: number; watched_sec?: number; duration_sec?: number;
      last_position_sec?: number; accepted?: number; rejected?: number;
    };

    if (payload.status === "rejected") {
      const reason = payload.reason ?? "UNKNOWN";
      return NextResponse.json(
        { error: REJECT_MESSAGES[reason] ?? "진도 기록이 거부되었습니다.", reason },
        { status: 400 },
      );
    }

    return NextResponse.json({
      progress: Number(payload.progress ?? 0),
      watchedSec: payload.watched_sec ?? 0,
      durationSec: payload.duration_sec ?? 0,
      lastPositionSec: payload.last_position_sec ?? 0,
      accepted: payload.accepted ?? 0,
      rejected: payload.rejected ?? 0,
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}

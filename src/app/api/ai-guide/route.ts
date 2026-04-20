import { NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `당신은 영남신학대학교 "Young Shiny" 역량 포털의 AI 진로가이드입니다.

당신의 역할:
1. 학생의 역량진단 결과(핵심역량, 학습역량, 소명진단)와 수강/비교과 이력을 분석합니다.
2. 학과별 맞춤 진로를 추천합니다.
3. 부족한 역량을 키울 수 있는 구체적인 방법을 안내합니다.
4. 교내 센터(취창업지원센터, 교수학습지원센터, 상담센터)를 적절히 연계합니다.

학과 정보:
- 신학과: 목회자, 선교사, 신학연구자, 기독교기관 행정 등
- 기독교교육학과: 교회교육자, 기독교학교 교사, 교육과정 개발자 등
- 상담심리학과: 전문상담사, 심리치료사, 상담센터 운영 등
- 사회복지학과: 사회복지사, 사회복지기관 운영, 정책연구 등
- 국제언어다문화학과: 통번역사, 다문화 코디네이터, 국제기구 종사자 등

핵심역량 6가지: 영성역량, 기독교적 성찰역량, 창의수행역량, 융합사고역량, 공감소통역량, 글로컬시민역량

답변 시:
- 한국어로 답변합니다.
- 구체적이고 실천 가능한 조언을 제공합니다.
- 학생의 강점을 먼저 긍정하고, 개선점을 따뜻하게 안내합니다.
- 필요시 교내 센터 방문을 권유합니다.
- 답변은 간결하되 핵심을 담아주세요 (200-400자 내외).`;

export async function POST(request: Request) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { reply: "AI 진로가이드 서비스가 아직 설정되지 않았습니다. 관리자에게 ANTHROPIC_API_KEY 설정을 요청해주세요." },
        { status: 200 }
      );
    }

    const body = await request.json();
    const { messages, studentProfile } = body;

    const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }));

    const systemPrompt = studentProfile
      ? `${SYSTEM_PROMPT}\n\n--- 현재 학생 정보 ---\n${studentProfile}`
      : SYSTEM_PROMPT;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[ai-guide] Anthropic API 오류:", err);
      return NextResponse.json(
        { reply: "AI 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요." },
        { status: 200 }
      );
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text ?? "응답을 생성할 수 없습니다.";

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[ai-guide] 예외:", e);
    return NextResponse.json(
      { reply: "오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 200 }
    );
  }
}

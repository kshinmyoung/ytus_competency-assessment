import { NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `당신은 영남신학대학교 "Young Shiny" 역량 포털의 AI 진로가이드입니다.

[절대 규칙 - 반드시 지켜야 합니다]
1. 아래 제공된 학교 정보 범위 내에서만 답변하세요. 모르는 내용은 "정확한 정보는 해당 센터에 직접 문의해주세요"라고 안내하세요.
2. 존재하지 않는 프로그램, 과목, 자격증, 센터를 절대 만들어내지 마세요.
3. 학생 정보(역량 점수, 수강 이력)가 제공되지 않은 경우, 추측하지 말고 "역량진단을 먼저 완료해주세요"라고 안내하세요.
4. 외부 대학, 외부 기관의 구체적 정보(합격률, 취업률, 연봉 등 수치)를 만들어내지 마세요.
5. 법률, 의료, 심리치료에 대한 전문 조언은 하지 마세요. "전문가 상담을 권합니다"로 안내하세요.
6. 진로 추천 시 반드시 "참고용이며, 구체적인 상담은 취창업지원센터를 방문해주세요"를 포함하세요.

[영남신학대학교 정보]
학과: 신학과, 기독교교육학과, 상담심리학과, 사회복지학과, 국제언어다문화학과
핵심역량: 영성역량, 기독교적 성찰역량, 창의수행역량, 융합사고역량, 공감소통역량, 글로컬시민역량

[학과별 진로 - 이 범위 내에서만 추천]
- 신학과: 교회 목회자(대학원 진학 후 안수), 선교사·선교단체 간사, 신학 연구자(대학원), 기독교 출판·미디어, 군목·교정목·병원목, 기독교 NGO 활동가
- 기독교교육학과: 중등 종교교사(기독교계 사립), 교회 교육담당 교역자, 기독교 대안학교 교사, 청소년상담복지센터 상담사, Wee센터 전문상담사
- 상담심리학과: 상담센터·심리치료기관 상담사(대학원 후), 교회 상담 사역자, EAP 상담원, 학교 전문상담사, 병원 임상심리, 가족·중독·미술치료 전문상담사
- 사회복지학과: 사회복지 공무원, 복지관 사회복지사, 의료사회복지사, 교정사회복지사, NGO 프로그램 매니저
- 국제언어다문화학과: 세종학당 한국어 교사, 다문화가족지원센터 강사, 대학 어학당 강사, 한국어 교육 콘텐츠 기획자

[자격증 - 이 목록만 안내]
- 기독교교육학과: 중등 종교교사(교직), 청소년상담사 3급
- 상담심리학과: 청소년상담사 3급, 직업상담사 2급, 임상심리사 2급
- 사회복지학과: 사회복지사 2급
- 국제언어다문화학과: 한국어 교원 2급
- 신학과: 별도 자격증 없음 (대학원 진학 후 교단 목사고시)

[교내 센터 - 이 3개만 안내]
- 취창업지원센터: 진로상담, 취업역량 강화 프로그램
- 교수학습지원센터: 학습 코칭, 교수법 지원, 튜터링
- 학생생활상담센터: 심리상담, 진로상담, 위기상담

[답변 스타일]
- 한국어로 답변합니다.
- 학생의 강점을 먼저 긍정하고, 개선점을 따뜻하게 안내합니다.
- 200~400자 내외로 간결하게 답변합니다.
- 불확실한 정보는 "~일 수 있습니다" 또는 "센터에 확인해주세요"로 표현합니다.`;

export async function POST(request: Request) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { reply: "AI 진로가이드 서비스가 아직 설정되지 않았습니다. 관리자에게 OPENAI_API_KEY 설정을 요청해주세요." },
        { status: 200 }
      );
    }

    const body = await request.json();
    const { messages, studentProfile } = body;

    const systemPrompt = studentProfile
      ? `${SYSTEM_PROMPT}\n\n--- 현재 학생 정보 ---\n${studentProfile}`
      : SYSTEM_PROMPT;

    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 1024,
        messages: openaiMessages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[ai-guide] OpenAI API 오류:", err);
      return NextResponse.json(
        { reply: "AI 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요." },
        { status: 200 }
      );
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? "응답을 생성할 수 없습니다.";

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[ai-guide] 예외:", e);
    return NextResponse.json(
      { reply: "오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 200 }
    );
  }
}

"use client";

import { ExternalLink, Loader2, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import Navigation from "@/components/Navigation";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const CENTERS = [
  { name: "취창업지원센터", description: "진로상담, 취업역량 강화 프로그램", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { name: "교수학습지원센터", description: "학습 코칭, 교수법 지원, 튜터링", color: "bg-green-50 text-green-700 border-green-200" },
  { name: "상담센터", description: "심리상담, 진로상담, 위기상담", color: "bg-violet-50 text-violet-700 border-violet-200" },
];

export default function AIGuidePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [studentProfile, setStudentProfile] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const studentId = await getCurrentStudentId();
      if (!studentId?.trim()) return;

      // Gather student data for context
      const [studentRes, coreRes, coursesRes, extraRes, deptRes] = await Promise.all([
        supabase.from("students").select("name, department_id").eq("student_id", studentId.trim()).maybeSingle(),
        supabase.from("diagnosis_results").select("diagnosis_type, scores, total_score").eq("student_id", studentId.trim()).order("created_at", { ascending: false }),
        supabase.from("student_courses").select("courses(name, core_competency_tags, major_competency_tags)").eq("student_id", studentId.trim()),
        supabase.from("student_extracurricular").select("status, extracurricular(name, core_competency_tags)").eq("student_id", studentId.trim()),
        supabase.from("departments").select("*"),
      ]);

      const deptName = deptRes.data?.find((d: any) => d.id === studentRes.data?.department_id)?.name ?? "미설정";

      let profile = `학생 프로필:\n- 이름: ${studentRes.data?.name ?? "미입력"}\n- 학과: ${deptName}\n\n`;

      // Diagnosis results
      const diagResults = coreRes.data ?? [];
      if (diagResults.length > 0) {
        profile += "역량진단 결과:\n";
        diagResults.forEach((d: any) => {
          const typeName = d.diagnosis_type === "core" ? "핵심역량" : d.diagnosis_type === "learning" ? "학습역량" : "소명진단";
          profile += `- ${typeName}: 총점 ${d.total_score}점, 세부 ${JSON.stringify(d.scores)}\n`;
        });
        profile += "\n";
      }

      // Courses
      const courses = (coursesRes.data ?? []).map((c: any) => c.courses?.name).filter(Boolean);
      if (courses.length > 0) {
        profile += `수강 과목: ${courses.join(", ")}\n\n`;
      }

      // Extracurricular
      const extras = (extraRes.data ?? []).map((e: any) => `${e.extracurricular?.name ?? ""}(${e.status})`).filter(Boolean);
      if (extras.length > 0) {
        profile += `비교과 활동: ${extras.join(", ")}\n`;
      }

      setStudentProfile(profile);
    })();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: text }],
          studentProfile,
        }),
      });

      if (!res.ok) {
        throw new Error("API 오류");
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navigation />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-6">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
              <Sparkles className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">AI 진로가이드</h1>
              <p className="text-sm text-slate-600">역량진단 결과를 바탕으로 맞춤 진로 조언을 드립니다.</p>
            </div>
          </div>
        </div>

        {/* Centers */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {CENTERS.map((center) => (
            <div key={center.name} className={`rounded-xl border p-4 ${center.color}`}>
              <p className="text-sm font-semibold">{center.name}</p>
              <p className="mt-1 text-xs opacity-80">{center.description}</p>
            </div>
          ))}
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
              <Sparkles className="h-10 w-10 text-indigo-300" />
              <p className="mt-3 text-sm text-slate-500">진로, 역량 개발, 센터 연계 등 궁금한 것을 물어보세요!</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {["내 역량 분석 결과를 알려줘", "부족한 역량을 키우려면?", "우리 학과 진로를 추천해줘"].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setInput(q);
                    }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    답변을 생성하고 있습니다...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="진로, 역량, 추천 프로그램 등을 물어보세요..."
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            disabled={loading}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </main>
    </div>
  );
}

"use client";

import { Calendar, Filter, Send, Tag, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import Navigation from "@/components/Navigation";

type CoreComp = { id: number; name: string; color_code: string };
type MajorComp = { id: number; name: string };
type Extra = {
  id: number;
  name: string;
  category: string | null;
  organizer: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  max_participants: number | null;
  registration_open: boolean;
  core_competency_tags: number[];
  major_competency_tags: number[];
};
type MyExtra = {
  extracurricular_id: number;
  status: string;
  reflection: string | null;
};

export default function ExtracurricularPage() {
  const [items, setItems] = useState<Extra[]>([]);
  const [coreComps, setCoreComps] = useState<CoreComp[]>([]);
  const [majorComps, setMajorComps] = useState<MajorComp[]>([]);
  const [myExtras, setMyExtras] = useState<Map<number, MyExtra>>(new Map());
  const [studentId, setStudentId] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<Extra | null>(null);
  const [reflection, setReflection] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (sid) setStudentId(sid.trim());

      // 설계서 4.2 목록 필터: 학생 유형에 맞는 프로그램만 노출한다
      const { data: me } = sid
        ? await supabase.from("students").select("student_type").eq("student_id", sid.trim()).maybeSingle()
        : { data: null };
      const studentType = (me?.student_type ?? "domestic").trim();

      const [coreRes, majorRes, extraRes] = await Promise.all([
        supabase.from("core_competencies").select("*").order("id"),
        supabase.from("major_competencies").select("*").order("id"),
        supabase
          .from("extracurricular")
          .select("*")
          .eq("is_active", true)
          .in("target_audience", ["all", studentType])
          .order("start_date", { ascending: false }),
      ]);

      setCoreComps(coreRes.data ?? []);
      setMajorComps(majorRes.data ?? []);
      setItems(extraRes.data ?? []);

      if (sid) {
        const { data: myE } = await supabase
          .from("student_extracurricular")
          .select("extracurricular_id, status, reflection")
          .eq("student_id", sid.trim());
        const map = new Map<number, MyExtra>();
        (myE ?? []).forEach((e: any) => map.set(e.extracurricular_id, e));
        setMyExtras(map);
      }
    })();
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(items.map((i) => i.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (filterCategory === "all") return items;
    return items.filter((i) => i.category === filterCategory);
  }, [items, filterCategory]);

  const coreCompMap = useMemo(() => {
    const m: Record<number, CoreComp> = {};
    coreComps.forEach((c) => (m[c.id] = c));
    return m;
  }, [coreComps]);

  const majorCompMap = useMemo(() => {
    const m: Record<number, MajorComp> = {};
    majorComps.forEach((c) => (m[c.id] = c));
    return m;
  }, [majorComps]);

  const handleApply = async (extraId: number) => {
    if (!studentId) return;
    setSubmitting(true);
    const { error } = await supabase.from("student_extracurricular").insert({
      student_id: studentId,
      extracurricular_id: extraId,
      status: "신청",
    });
    if (!error) {
      setMyExtras((prev) => new Map(prev).set(extraId, { extracurricular_id: extraId, status: "신청", reflection: null }));
    } else {
      alert(error.message);
    }
    setSubmitting(false);
  };

  const handleReflection = async (extraId: number) => {
    if (!studentId || !reflection.trim()) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("student_extracurricular")
      .update({ reflection: reflection.trim() })
      .eq("student_id", studentId)
      .eq("extracurricular_id", extraId);
    if (!error) {
      setMyExtras((prev) => {
        const map = new Map(prev);
        const existing = map.get(extraId);
        if (existing) map.set(extraId, { ...existing, reflection: reflection.trim() });
        return map;
      });
      setReflection("");
      setSelectedItem(null);
    } else {
      alert(error.message);
    }
    setSubmitting(false);
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      "신청": "bg-yellow-50 text-yellow-700",
      "참여중": "bg-blue-50 text-blue-700",
      "완료": "bg-green-50 text-green-700",
    };
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? "bg-slate-100 text-slate-600"}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">비교과 프로그램</h1>
          <p className="mt-1 text-sm text-slate-600">다양한 비교과 프로그램에 참여하여 역량을 키워보세요.</p>
        </div>

        {/* Filter */}
        <div className="mb-6 flex items-center gap-3">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 카테고리</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Trophy className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">등록된 비교과 프로그램이 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const myStatus = myExtras.get(item.id);
              return (
                <div
                  key={item.id}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">{item.name}</h3>
                    {item.category && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                        {item.category}
                      </span>
                    )}
                  </div>
                  {item.organizer && (
                    <p className="text-xs text-slate-500">주관: {item.organizer}</p>
                  )}
                  {item.start_date && (
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <Calendar className="h-3 w-3" />
                      {item.start_date}{item.end_date ? ` ~ ${item.end_date}` : ""}
                    </p>
                  )}
                  {item.description && (
                    <p className="mt-2 flex-1 text-xs text-slate-600 line-clamp-2">{item.description}</p>
                  )}

                  {/* Tags */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {item.core_competency_tags.map((tagId) => {
                      const comp = coreCompMap[tagId];
                      if (!comp) return null;
                      return (
                        <span
                          key={`core-${tagId}`}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: comp.color_code + "15", color: comp.color_code }}
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {comp.name}
                        </span>
                      );
                    })}
                    {item.major_competency_tags.map((tagId) => {
                      const comp = majorCompMap[tagId];
                      if (!comp) return null;
                      return (
                        <span
                          key={`major-${tagId}`}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {comp.name}
                        </span>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    {myStatus ? (
                      <>
                        {statusBadge(myStatus.status)}
                        {myStatus.status === "완료" && !myStatus.reflection && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedItem(item);
                              setReflection("");
                            }}
                            className="text-xs font-medium text-blue-600 hover:underline"
                          >
                            소감 입력
                          </button>
                        )}
                        {myStatus.reflection && (
                          <span className="text-xs text-green-600">소감 작성완료</span>
                        )}
                      </>
                    ) : item.registration_open ? (
                      <button
                        type="button"
                        onClick={() => handleApply(item.id)}
                        disabled={submitting || !studentId}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Send className="h-3 w-3" />
                        참여 신청
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">신청 마감</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reflection modal */}
        {selectedItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setSelectedItem(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-900">활동 소감</h3>
              <p className="mt-1 text-sm text-slate-500">{selectedItem.name}</p>
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="활동을 통해 배운 점이나 느낀 점을 자유롭게 작성해주세요."
                rows={5}
                className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => handleReflection(selectedItem.id)}
                  disabled={submitting || !reflection.trim()}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

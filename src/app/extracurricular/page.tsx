"use client";

import { Calendar, PlayCircle, Send, Trophy, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, waitForStudentId } from "@/lib/supabase";
import Navigation from "@/components/Navigation";
import {
  DELIVERY_GROUPS,
  ORGANIZER_GROUPS,
  matchesDelivery,
  resolveOrganizerGroup,
  type DeliveryGroupKey,
  type OrganizerGroupKey,
} from "@/lib/extracurricular";

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
  delivery_type: string;
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
  const [delivery, setDelivery] = useState<DeliveryGroupKey>("online");
  const [organizer, setOrganizer] = useState<OrganizerGroupKey | "all">("all");
  const [selectedItem, setSelectedItem] = useState<Extra | null>(null);
  const [reflection, setReflection] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const sid = await waitForStudentId();
      if (sid) setStudentId(sid);

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

      const extras = extraRes.data ?? [];
      setCoreComps(coreRes.data ?? []);
      setMajorComps(majorRes.data ?? []);
      setItems(extras);

      // 온라인이 비어 있으면 대면부터 보여준다. 빈 탭으로 첫 화면을 맞을 이유가 없다.
      if (!extras.some((e: Extra) => matchesDelivery(e.delivery_type, "online"))) {
        setDelivery("offline");
      }

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

  /** 전달 방식 탭별 개수 */
  const deliveryCounts = useMemo(() => {
    const counts = {} as Record<DeliveryGroupKey, number>;
    DELIVERY_GROUPS.forEach((g) => {
      counts[g.key] = items.filter((i) => matchesDelivery(i.delivery_type, g.key)).length;
    });
    return counts;
  }, [items]);

  /** 선택한 전달 방식 안에서의 주관 기관별 개수 */
  const inDelivery = useMemo(
    () => items.filter((i) => matchesDelivery(i.delivery_type, delivery)),
    [items, delivery],
  );

  const organizerCounts = useMemo(() => {
    const counts = {} as Record<OrganizerGroupKey, number>;
    ORGANIZER_GROUPS.forEach((g) => (counts[g.key] = 0));
    inDelivery.forEach((i) => (counts[resolveOrganizerGroup(i.organizer)] += 1));
    return counts;
  }, [inDelivery]);

  const filtered = useMemo(() => {
    if (organizer === "all") return inDelivery;
    return inDelivery.filter((i) => resolveOrganizerGroup(i.organizer) === organizer);
  }, [inDelivery, organizer]);

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
    // 완료는 사이트 전체에서 '빛이 닿은 것'을 뜻하는 금색으로 통일한다
    const styles: Record<string, string> = {
      "신청": "bg-ys-blue/10 text-ys-blue",
      "참여중": "bg-ys-blue/10 text-ys-blue",
      "완료": "bg-ys-gold/15 text-[#8A6212]",
    };
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? "bg-slate-100 text-ys-ink-soft"}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-ys-paper">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ys-ink">비교과 프로그램</h1>
          <p className="mt-1 text-sm text-ys-ink-soft">다양한 비교과 프로그램에 참여하여 역량을 키워보세요.</p>
        </div>

        {/*
          2단 분류: 위는 전달 방식(온라인/대면), 아래는 주관 기관.
          기관 선택은 전달 방식 안에서만 뜻이 있으므로 탭을 바꾸면 '전체'로 되돌린다.
        */}
        <div className="mb-6">
          <div className="flex gap-2 border-b border-slate-200">
            {DELIVERY_GROUPS.map((g) => {
              const isActive = delivery === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => {
                    setDelivery(g.key);
                    setOrganizer("all");
                  }}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? "border-ys-gold text-ys-ink"
                      : "border-transparent text-ys-ink-soft hover:text-ys-ink"
                  }`}
                >
                  {g.label}
                  <span className={`font-data text-xs ${isActive ? "text-[#8A6212]" : "text-ys-ink-soft/60"}`}>
                    {deliveryCounts[g.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOrganizer("all")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                organizer === "all"
                  ? "border-ys-blue/40 bg-ys-blue/10 text-ys-blue"
                  : "border-slate-200 bg-white text-ys-ink-soft hover:border-slate-300"
              }`}
            >
              전체 {inDelivery.length}
            </button>
            {ORGANIZER_GROUPS.map((g) => {
              const count = organizerCounts[g.key] ?? 0;
              const isActive = organizer === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  disabled={count === 0}
                  onClick={() => setOrganizer(g.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? "border-ys-blue/40 bg-ys-blue/10 text-ys-blue"
                      : count === 0
                        ? "cursor-default border-slate-200 bg-white text-ys-ink-soft/40"
                        : "border-slate-200 bg-white text-ys-ink-soft hover:border-slate-300"
                  }`}
                >
                  {g.label} {count}
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Trophy className="mx-auto h-10 w-10 text-ys-ink-soft/50" />
            <p className="mt-3 text-sm text-ys-ink-soft">
              {DELIVERY_GROUPS.find((g) => g.key === delivery)?.label} 비교과 프로그램이 없습니다.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const myStatus = myExtras.get(item.id);
              return (
                <div
                  key={item.id}
                  className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="text-sm font-semibold text-ys-ink">
                      {/* 영상형 프로그램 표시 (설계서 11.3) */}
                      {item.delivery_type === "video" && (
                        <span className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-ys-blue/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-ys-blue">
                          <Video className="h-2.5 w-2.5" />
                          영상
                        </span>
                      )}
                      {item.name}
                    </h3>
                    {item.category && (
                      <span className="max-w-[38%] shrink-0 truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-ys-ink-soft" title={item.category ?? ""}>
                        {item.category}
                      </span>
                    )}
                  </div>
                  {item.organizer && (
                    <p className="text-xs text-ys-ink-soft">주관: {item.organizer}</p>
                  )}
                  {item.start_date && (
                    <p className="flex items-center gap-1 text-xs text-ys-ink-soft">
                      <Calendar className="h-3 w-3" />
                      {item.start_date}{item.end_date ? ` ~ ${item.end_date}` : ""}
                    </p>
                  )}
                  {item.description && (
                    <p className="mt-2 flex-1 text-xs text-ys-ink-soft line-clamp-2">{item.description}</p>
                  )}

                  {/* Tags */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {item.core_competency_tags.map((tagId) => {
                      const comp = coreCompMap[tagId];
                      if (!comp) return null;
                      return (
                        <span
                          key={`core-${tagId}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] text-ys-ink-soft"
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: comp.color_code }}
                            aria-hidden="true"
                          />
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
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] text-ys-ink-soft"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ys-blue" aria-hidden="true" />
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
                            className="text-xs font-medium text-ys-blue hover:underline"
                          >
                            소감 입력
                          </button>
                        )}
                        {myStatus.reflection && (
                          <span className="text-xs text-ys-gold">소감 작성완료</span>
                        )}
                        {/* 영상형은 신청 후 바로 학습으로 이동 (status 는 '신청' 그대로 둔다) */}
                        {["video", "hybrid"].includes(item.delivery_type) && (
                          <Link
                            href={`/lms/${item.id}`}
                            className="inline-flex items-center gap-1 rounded-full bg-ys-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-ys-blue/90"
                          >
                            <PlayCircle className="h-3 w-3" />
                            학습 시작
                          </Link>
                        )}
                      </>
                    ) : item.registration_open ? (
                      <button
                        type="button"
                        onClick={() => handleApply(item.id)}
                        disabled={submitting || !studentId}
                        className="inline-flex items-center gap-1 rounded-full bg-ys-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-ys-blue/90 disabled:opacity-50"
                      >
                        <Send className="h-3 w-3" />
                        참여 신청
                      </button>
                    ) : (
                      <span className="text-xs text-ys-ink-soft/70">신청 마감</span>
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
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-ys-ink">활동 소감</h3>
              <p className="mt-1 text-sm text-ys-ink-soft">{selectedItem.name}</p>
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
                  className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-ys-ink hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => handleReflection(selectedItem.id)}
                  disabled={submitting || !reflection.trim()}
                  className="flex-1 rounded-lg bg-ys-blue py-2 text-sm font-medium text-white hover:bg-ys-blue/90 disabled:opacity-50"
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

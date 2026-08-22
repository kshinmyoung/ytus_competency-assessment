"use client";

import { Calendar, CheckCircle, Clock, Send, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import Navigation from "@/components/Navigation";
import { formatDateTimeKorea } from "@/lib/date";

type Reservation = {
  id: number;
  center_type: string;
  reservation_date: string;
  time_slot: string;
  purpose: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

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

type MyExtra = { extracurricular_id: number; status: string };

const CENTERS = [
  { key: "ctl", name: "교수학습지원센터", desc: "학습 코칭, 튜터링, 교수법 지원", color: "#10B981", bg: "bg-ys-gold/10", border: "border-ys-gold/30", text: "text-[#8A6212]" },
  { key: "career_center", name: "취창업진로지원센터", desc: "진로상담, 취업역량 강화, 자격증 상담", color: "#3B82F6", bg: "bg-ys-blue/10", border: "border-ys-blue/30", text: "text-ys-blue" },
  { key: "counseling_center", name: "학생생활상담센터", desc: "심리상담, 진로상담, 위기상담", color: "#8B5CF6", bg: "bg-ys-blue/10", border: "border-violet-200", text: "text-ys-blue" },
];

const TIME_SLOTS = [
  "09:00 - 09:30", "09:30 - 10:00", "10:00 - 10:30", "10:30 - 11:00",
  "11:00 - 11:30", "11:30 - 12:00", "13:00 - 13:30", "13:30 - 14:00",
  "14:00 - 14:30", "14:30 - 15:00", "15:00 - 15:30", "15:30 - 16:00",
  "16:00 - 16:30", "16:30 - 17:00",
];

type TabKey = "center" | "extracurricular" | "myreservations";

export default function ReservationPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("center");
  const [studentId, setStudentId] = useState("");
  const [selectedCenter, setSelectedCenter] = useState(CENTERS[0].key);
  const [reservationDate, setReservationDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [myExtras, setMyExtras] = useState<Map<number, MyExtra>>(new Map());
  const [extraSubmitting, setExtraSubmitting] = useState(false);

  const loadData = async (sid: string) => {
    const [resRes, extraRes, myExtraRes] = await Promise.all([
      supabase.from("center_reservations").select("*").eq("student_id", sid).order("reservation_date", { ascending: false }),
      supabase.from("extracurricular").select("*").eq("is_active", true).eq("registration_open", true).order("start_date", { ascending: false }),
      supabase.from("student_extracurricular").select("extracurricular_id, status").eq("student_id", sid),
    ]);
    setMyReservations((resRes.data ?? []) as Reservation[]);
    setExtras((extraRes.data ?? []) as Extra[]);
    const map = new Map<number, MyExtra>();
    (myExtraRes.data ?? []).forEach((e: any) => map.set(e.extracurricular_id, e));
    setMyExtras(map);
  };

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) return;
      setStudentId(sid.trim());
      await loadData(sid.trim());
    })();
  }, []);

  // 오늘 이후 날짜만
  const today = new Date().toISOString().split("T")[0];

  // 선택 날짜+센터에 이미 예약된 시간대 (전체 조회)
  const [allBookedSlots, setAllBookedSlots] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!reservationDate || !selectedCenter) { setAllBookedSlots(new Set()); return; }
    (async () => {
      const { data } = await supabase.from("center_reservations").select("time_slot").eq("center_type", selectedCenter).eq("reservation_date", reservationDate).neq("status", "취소");
      setAllBookedSlots(new Set((data ?? []).map((r: any) => r.time_slot)));
    })();
  }, [reservationDate, selectedCenter]);

  const bookedSlots = useMemo(() => {
    const mySlots = myReservations
      .filter((r) => r.reservation_date === reservationDate && r.center_type === selectedCenter && r.status !== "취소")
      .map((r) => r.time_slot);
    return new Set([...allBookedSlots, ...mySlots]);
  }, [myReservations, reservationDate, selectedCenter, allBookedSlots]);

  const handleReserve = async () => {
    if (!studentId || !reservationDate || !timeSlot) return;
    setSubmitting(true);
    const { error } = await supabase.from("center_reservations").insert({
      student_id: studentId,
      center_type: selectedCenter,
      reservation_date: reservationDate,
      time_slot: timeSlot,
      purpose: purpose.trim() || null,
    });
    if (error) { alert(error.message); setSubmitting(false); return; }
    // 마일리지 5점 부여
    await supabase.from("mileage_records").insert({ student_id: studentId, points: 5, reason: `센터 상담 예약: ${centerInfo.name}`, source_type: "center_reservation" });
    setSubmitting(false);
    setSubmitted(true);
    setTimeSlot("");
    setPurpose("");
    await loadData(studentId);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleCancel = async (id: number) => {
    if (!confirm("예약을 취소하시겠습니까?")) return;
    await supabase.from("center_reservations").update({ status: "취소" }).eq("id", id);
    await loadData(studentId);
  };

  const handleExtraApply = async (extraId: number) => {
    if (!studentId) return;
    setExtraSubmitting(true);
    const { error } = await supabase.from("student_extracurricular").insert({
      student_id: studentId,
      extracurricular_id: extraId,
      status: "신청",
    });
    if (!error) {
      setMyExtras((prev) => new Map(prev).set(extraId, { extracurricular_id: extraId, status: "신청" }));
      // 마일리지는 여기서 주지 않는다. 이수 마일리지는 관리자가 완료 처리할 때만 지급한다
      // (lib/extracurricular.ts 의 awardExtracurricularMileage).
    } else { alert(error.message); }
    setExtraSubmitting(false);
  };

  const centerInfo = CENTERS.find((c) => c.key === selectedCenter)!;

  const statusBadge = (status: string) => {
    const s: Record<string, string> = { "신청": "bg-ys-blue/10 text-ys-blue", "확인": "bg-ys-blue/10 text-ys-blue", "완료": "bg-ys-gold/15 text-[#8A6212]", "취소": "bg-slate-100 text-ys-ink-soft/70" };
    return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s[status] ?? "bg-slate-100 text-ys-ink-soft"}`}>{status}</span>;
  };

  const tabs = [
    { key: "center" as TabKey, label: "센터 상담 예약" },
    { key: "extracurricular" as TabKey, label: "비교과 프로그램 신청" },
    { key: "myreservations" as TabKey, label: `내 예약 현황 (${myReservations.filter((r) => r.status !== "취소").length})` },
  ];

  return (
    <div className="min-h-screen bg-ys-paper">
      <Navigation />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ys-ink">예약 및 신청</h1>
          <p className="mt-1 text-sm text-ys-ink-soft">센터 상담을 예약하거나 비교과 프로그램에 신청할 수 있습니다.</p>
        </div>

        {/* 탭 */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${activeTab === tab.key ? "bg-ys-blue text-white" : "text-ys-ink-soft hover:bg-slate-100"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* === 센터 상담 예약 === */}
        {activeTab === "center" && (
          <div>
            {/* 센터 선택 */}
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              {CENTERS.map((c) => (
                <button key={c.key} type="button" onClick={() => { setSelectedCenter(c.key); setTimeSlot(""); }}
                  className={`rounded-xl border-2 p-4 text-left transition ${selectedCenter === c.key ? `${c.bg} ${c.border}` : "border-transparent bg-white"}`}>
                  <p className={`text-sm font-semibold ${selectedCenter === c.key ? c.text : "text-ys-ink"}`}>{c.name}</p>
                  <p className="mt-1 text-xs text-ys-ink-soft">{c.desc}</p>
                </button>
              ))}
            </div>

            {submitted && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-ys-gold/30 bg-ys-gold/10 p-4">
                <CheckCircle className="h-5 w-5 text-[#8A6212]" />
                <p className="text-sm font-medium text-[#8A6212]">예약이 접수되었습니다!</p>
              </div>
            )}

            {/* 예약 폼 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold" style={{ color: centerInfo.color }}>{centerInfo.name} 상담 예약</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ys-ink">날짜 선택</label>
                  <input type="date" min={today} value={reservationDate} onChange={(e) => { setReservationDate(e.target.value); setTimeSlot(""); }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>

                {reservationDate && (
                  <div>
                    <label className="block text-sm font-medium text-ys-ink">시간대 선택</label>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {TIME_SLOTS.map((slot) => {
                        const booked = bookedSlots.has(slot);
                        const selected = timeSlot === slot;
                        return (
                          <button key={slot} type="button" onClick={() => !booked && setTimeSlot(slot)} disabled={booked}
                            className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                              booked ? "border-slate-100 bg-ys-paper text-ys-ink-soft/50 cursor-not-allowed" :
                              selected ? "border-blue-500 bg-ys-blue/10 text-ys-blue" :
                              "border-slate-200 bg-white text-ys-ink hover:border-ys-blue/40"
                            }`}>
                            <Clock className="mx-auto mb-0.5 h-3 w-3" />
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-ys-ink">상담 목적 (선택)</label>
                  <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} placeholder="어떤 상담을 원하시나요? (선택사항)"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>

                <button type="button" onClick={handleReserve} disabled={submitting || !reservationDate || !timeSlot}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-ys-blue py-3 text-sm font-semibold text-white hover:bg-ys-blue/90 disabled:bg-slate-300 disabled:cursor-not-allowed">
                  <Send className="h-4 w-4" />
                  {submitting ? "예약 중..." : "상담 예약하기"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* === 비교과 프로그램 신청 === */}
        {activeTab === "extracurricular" && (
          <div>
            {extras.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                <Trophy className="mx-auto h-10 w-10 text-ys-ink-soft/50" />
                <p className="mt-3 text-sm text-ys-ink-soft">현재 신청 가능한 비교과 프로그램이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {extras.map((item) => {
                  const myStatus = myExtras.get(item.id);
                  return (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-ys-ink">{item.name}</h3>
                            {item.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-ys-ink-soft">{item.category}</span>}
                          </div>
                          {item.organizer && <p className="mt-0.5 text-xs text-ys-ink-soft">주관: {item.organizer}</p>}
                          {item.start_date && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-ys-ink-soft">
                              <Calendar className="h-3 w-3" />
                              {item.start_date}{item.end_date ? ` ~ ${item.end_date}` : ""}
                            </p>
                          )}
                          {item.description && <p className="mt-2 text-xs text-ys-ink-soft">{item.description}</p>}
                          {item.max_participants && <p className="mt-1 text-[10px] text-ys-ink-soft/70">최대 {item.max_participants}명</p>}
                        </div>
                        <div className="ml-4 flex-shrink-0">
                          {myStatus ? (
                            statusBadge(myStatus.status)
                          ) : (
                            <button type="button" onClick={() => handleExtraApply(item.id)} disabled={extraSubmitting}
                              className="rounded-full bg-ys-blue px-4 py-1.5 text-xs font-medium text-white hover:bg-ys-blue/90 disabled:opacity-50">
                              신청하기
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* === 내 예약 현황 === */}
        {activeTab === "myreservations" && (
          <div>
            {myReservations.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                <Calendar className="mx-auto h-10 w-10 text-ys-ink-soft/50" />
                <p className="mt-3 text-sm text-ys-ink-soft">예약 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myReservations.map((r) => {
                  const center = CENTERS.find((c) => c.key === r.center_type);
                  return (
                    <div key={r.id} className={`rounded-xl border bg-white p-5 shadow-sm ${r.status === "취소" ? "opacity-50" : ""}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${center?.bg} ${center?.text}`}>{center?.name}</span>
                            {statusBadge(r.status)}
                          </div>
                          <div className="mt-2 flex items-center gap-3 text-sm text-ys-ink">
                            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-ys-ink-soft/70" />{r.reservation_date}</span>
                            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-ys-ink-soft/70" />{r.time_slot}</span>
                          </div>
                          {r.purpose && <p className="mt-2 text-xs text-ys-ink-soft">목적: {r.purpose}</p>}
                          {r.admin_note && <p className="mt-1 rounded bg-ys-blue/10 px-2 py-1 text-xs text-ys-blue">센터 메모: {r.admin_note}</p>}
                          <p className="mt-1 text-[10px] text-ys-ink-soft/70">신청: {formatDateTimeKorea(r.created_at)}</p>
                        </div>
                        {r.status === "신청" && (
                          <button type="button" onClick={() => handleCancel(r.id)} className="rounded p-1 text-ys-ink-soft/70 hover:text-red-500">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

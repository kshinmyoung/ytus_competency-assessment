"use client";

import { Edit3, Eye, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseCsv } from "@/lib/csv";
import AdminLayout from "@/components/AdminLayout";

type CoreComp = { id: number; name: string; color_code: string };
type MajorComp = { id: number; name: string; department_id: number };
type Extra = {
  id: number;
  name: string;
  category: string | null;
  organizer: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  max_participants: number | null;
  is_active: boolean;
  registration_open: boolean;
  core_competency_tags: number[];
  major_competency_tags: number[];
};
type Participant = {
  student_id: string;
  status: string;
  reflection: string | null;
  students: { name: string | null } | null;
};

const emptyForm = {
  name: "",
  category: "",
  organizer: "",
  description: "",
  start_date: "",
  end_date: "",
  max_participants: null as number | null,
  is_active: true,
  registration_open: false,
  core_competency_tags: [] as number[],
  major_competency_tags: [] as number[],
};

export default function AdminExtracurricularPage() {
  const [items, setItems] = useState<Extra[]>([]);
  const [coreComps, setCoreComps] = useState<CoreComp[]>([]);
  const [majorComps, setMajorComps] = useState<MajorComp[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showParticipants, setShowParticipants] = useState<Extra | null>(null);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [showStudentCsv, setShowStudentCsv] = useState(false);
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [csvProcessing, setCsvProcessing] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const studentCsvRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.from("extracurricular").select("*").order("id", { ascending: false });
    setItems(data ?? []);
  };

  useEffect(() => {
    (async () => {
      const [coreRes, majorRes] = await Promise.all([
        supabase.from("core_competencies").select("*").order("id"),
        supabase.from("major_competencies").select("*").order("id"),
      ]);
      setCoreComps(coreRes.data ?? []);
      setMajorComps(majorRes.data ?? []);
      await load();
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q));
  }, [items, search]);

  // CSV 일괄 비교과 등록
  // 헤더: name,category,organizer,description,start_date,end_date,max_participants
  const handleExtraCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { alert("유효한 데이터가 없습니다."); e.target.value = ""; return; }

    setCsvProcessing(true);
    setCsvResult(null);
    let success = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.name) { errors.push("프로그램명 없음"); continue; }
      const { error } = await supabase.from("extracurricular").insert({
        name: row.name,
        category: row.category || null,
        organizer: row.organizer || null,
        description: row.description || null,
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        max_participants: Number(row.max_participants) || null,
        is_active: true,
        registration_open: (row.registration_open ?? "").toLowerCase() === "true",
      });
      if (error) { errors.push(`${row.name}: ${error.message}`); } else { success++; }
    }

    setCsvResult({ success, failed: errors.length, errors });
    setCsvProcessing(false);
    await load();
    e.target.value = "";
  };

  // CSV 학생-비교과 일괄 연결
  // 헤더: student_id,extracurricular_id,status
  // extracurricular_id 대신 extracurricular_name도 지원
  const handleStudentExtraCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { alert("유효한 데이터가 없습니다."); e.target.value = ""; return; }

    setCsvProcessing(true);
    setCsvResult(null);
    let success = 0;
    const errors: string[] = [];

    const nameMap: Record<string, number> = {};
    items.forEach((i) => { nameMap[i.name.toLowerCase()] = i.id; });

    for (const row of rows) {
      if (!row.student_id) { errors.push("학번 없음"); continue; }
      let extraId = Number(row.extracurricular_id) || 0;
      if (!extraId && row.extracurricular_name) {
        extraId = nameMap[row.extracurricular_name.toLowerCase()] ?? 0;
      }
      if (!extraId) { errors.push(`${row.student_id}: 프로그램을 찾을 수 없음`); continue; }

      const status = row.status || "신청";
      const { error } = await supabase.from("student_extracurricular").upsert({
        student_id: row.student_id,
        extracurricular_id: extraId,
        status,
        completed_at: status === "완료" ? new Date().toISOString() : null,
      }, { onConflict: "student_id,extracurricular_id" });

      if (error) { errors.push(`${row.student_id}: ${error.message}`); } else { success++; }
    }

    setCsvResult({ success, failed: errors.length, errors });
    setCsvProcessing(false);
    e.target.value = "";
  };

  const handleEdit = (item: Extra) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category ?? "",
      organizer: item.organizer ?? "",
      description: item.description ?? "",
      start_date: item.start_date ?? "",
      end_date: item.end_date ?? "",
      max_participants: item.max_participants,
      is_active: item.is_active,
      registration_open: item.registration_open,
      core_competency_tags: item.core_competency_tags ?? [],
      major_competency_tags: item.major_competency_tags ?? [],
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      organizer: form.organizer.trim() || null,
      description: form.description.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      max_participants: form.max_participants,
      is_active: form.is_active,
      registration_open: form.registration_open,
      core_competency_tags: form.core_competency_tags,
      major_competency_tags: form.major_competency_tags,
    };

    if (editingId) {
      await supabase.from("extracurricular").update(payload).eq("id", editingId);
    } else {
      await supabase.from("extracurricular").insert(payload);
    }

    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    await load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 비교과 프로그램을 삭제하시겠습니까?")) return;
    await supabase.from("extracurricular").delete().eq("id", id);
    await load();
  };

  // 참여자 CSV 일괄 등록
  const participantCsvRef = useRef<HTMLInputElement>(null);
  const [participantCsvResult, setParticipantCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [participantCsvProcessing, setParticipantCsvProcessing] = useState(false);

  const handleParticipantCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !showParticipants) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { alert("유효한 데이터가 없습니다. 헤더: student_id, status"); e.target.value = ""; return; }

    setParticipantCsvProcessing(true);
    setParticipantCsvResult(null);
    let success = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const sid = (row.student_id ?? "").trim();
      if (!sid) { errors.push("학번 없음"); continue; }
      const status = (row.status ?? "신청").trim() || "신청";
      const { error } = await supabase.from("student_extracurricular").upsert({
        student_id: sid,
        extracurricular_id: showParticipants.id,
        status,
        completed_at: status === "완료" ? new Date().toISOString() : null,
      }, { onConflict: "student_id,extracurricular_id" });
      if (error) { errors.push(`${sid}: ${error.message}`); }
      else {
        // 마일리지 10점 (중복 방지)
        const { data: existMile } = await supabase.from("mileage_records").select("id").eq("student_id", sid).eq("source_type", "extracurricular").eq("source_id", showParticipants.id).maybeSingle();
        if (!existMile) {
          await supabase.from("mileage_records").insert({ student_id: sid, points: 10, reason: `비교과 신청: ${showParticipants.name}`, source_type: "extracurricular", source_id: showParticipants.id });
        }
        success++;
      }
    }

    setParticipantCsvResult({ success, failed: errors.length, errors });
    setParticipantCsvProcessing(false);
    // 목록 새로고침
    const { data } = await supabase.from("student_extracurricular").select("student_id, status, reflection, students(name)").eq("extracurricular_id", showParticipants.id).order("created_at", { ascending: false });
    setParticipants((data ?? []) as unknown as Participant[]);
    e.target.value = "";
  };

  const viewParticipants = async (item: Extra) => {
    const { data } = await supabase
      .from("student_extracurricular")
      .select("student_id, status, reflection, students(name)")
      .eq("extracurricular_id", item.id)
      .order("created_at", { ascending: false });
    setParticipants((data ?? []) as unknown as Participant[]);
    setShowParticipants(item);
  };

  const toggleTag = (field: "core_competency_tags" | "major_competency_tags", id: number) => {
    setForm((prev) => {
      const current = prev[field];
      return { ...prev, [field]: current.includes(id) ? current.filter((t) => t !== id) : [...current, id] };
    });
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-900">비교과 관리</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="프로그램명 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
          </div>
          <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            프로그램 추가
          </button>
          <button type="button" onClick={() => { setCsvResult(null); setShowCsvUpload(true); }} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-4 w-4" /> 비교과 CSV
          </button>
          <button type="button" onClick={() => { setCsvResult(null); setShowStudentCsv(true); }} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Users className="h-4 w-4" /> 참여 일괄등록
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">프로그램명</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">카테고리</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">기간</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">역량 태그</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">상태</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">프로그램이 없습니다.</td></tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.category ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.start_date ?? "-"}{item.end_date ? ` ~ ${item.end_date}` : ""}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(item.core_competency_tags ?? []).map((id) => {
                        const comp = coreComps.find((c) => c.id === id);
                        return comp ? <span key={`c-${id}`} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: comp.color_code + "15", color: comp.color_code }}>{comp.name}</span> : null;
                      })}
                      {(item.major_competency_tags ?? []).map((id) => {
                        const comp = majorComps.find((mc) => mc.id === id);
                        return comp ? <span key={`m-${id}`} className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{comp.name}</span> : null;
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.is_active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                        {item.is_active ? "활성" : "비활성"}
                      </span>
                      {item.registration_open && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">모집중</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button type="button" onClick={() => viewParticipants(item)} className="mr-2 text-sm text-slate-600 hover:text-slate-800"><Eye className="inline h-4 w-4" /></button>
                    <button type="button" onClick={() => handleEdit(item)} className="mr-2 text-sm text-blue-600 hover:text-blue-800"><Edit3 className="inline h-4 w-4" /></button>
                    <button type="button" onClick={() => handleDelete(item.id)} className="text-sm text-red-600 hover:text-red-800"><Trash2 className="inline h-4 w-4" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Participants modal */}
      {showParticipants && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowParticipants(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input ref={participantCsvRef} type="file" accept=".csv" className="hidden" onChange={handleParticipantCsv} />
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">참여 학생 현황</h3>
                <p className="mt-1 text-sm text-slate-500">{showParticipants.name} · {participants.length}명</p>
              </div>
              <button type="button" onClick={() => { setParticipantCsvResult(null); participantCsvRef.current?.click(); }}
                disabled={participantCsvProcessing}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                <Upload className="h-3 w-3" /> {participantCsvProcessing ? "처리 중..." : "인원 CSV 등록"}
              </button>
            </div>
            {participantCsvResult && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm">성공: <strong className="text-green-600">{participantCsvResult.success}명</strong>, 실패: <strong className="text-red-600">{participantCsvResult.failed}명</strong></p>
                {participantCsvResult.errors.length > 0 && (
                  <div className="mt-1 max-h-20 overflow-auto text-xs text-red-600">{participantCsvResult.errors.map((err, i) => <p key={i}>{err}</p>)}</div>
                )}
              </div>
            )}
            <p className="mt-2 text-[10px] text-slate-400">CSV 헤더: student_id, status (신청/참여중/완료)</p>
            {participants.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">참여 학생이 없습니다.</p>
            ) : (
              <table className="mt-4 min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">학번</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">이름</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">상태</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">소감</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {participants.map((p) => (
                    <tr key={p.student_id}>
                      <td className="px-4 py-2 text-sm text-slate-900">{p.student_id}</td>
                      <td className="px-4 py-2 text-sm text-slate-600">{p.students?.name ?? "-"}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.status === "완료" ? "bg-green-50 text-green-700" : p.status === "참여중" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"
                        }`}>{p.status}</span>
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-600">{p.reflection ? p.reflection.substring(0, 50) + (p.reflection.length > 50 ? "..." : "") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button type="button" onClick={() => setShowParticipants(null)} className="mt-4 w-full rounded-lg bg-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300">닫기</button>
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{editingId ? "프로그램 수정" : "프로그램 추가"}</h3>
            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="block text-sm font-medium text-slate-700">프로그램명 *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-slate-700">카테고리</label><input type="text" placeholder="예: 특강, 캠프, 봉사" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-slate-700">주관</label><input type="text" value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-slate-700">최대 인원</label><input type="number" value={form.max_participants ?? ""} onChange={(e) => setForm({ ...form, max_participants: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-slate-700">시작일</label><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-slate-700">종료일</label><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700">설명</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" /> 활성</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.registration_open} onChange={(e) => setForm({ ...form, registration_open: e.target.checked })} className="rounded" /> 모집 중</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">핵심역량 태그</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {coreComps.map((comp) => (
                    <button key={comp.id} type="button" onClick={() => toggleTag("core_competency_tags", comp.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${form.core_competency_tags.includes(comp.id) ? "ring-2 ring-offset-1" : "opacity-50"}`} style={{ backgroundColor: comp.color_code + "20", color: comp.color_code, outlineColor: comp.color_code }}>
                      {comp.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">전공역량 태그</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {majorComps.map((comp) => (
                    <button key={comp.id} type="button" onClick={() => toggleTag("major_competency_tags", comp.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${form.major_competency_tags.includes(comp.id) ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400 ring-offset-1" : "bg-indigo-50 text-indigo-400 opacity-50"}`}>
                      {comp.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">취소</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "저장 중..." : "저장"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 비교과 CSV 업로드 모달 */}
      {showCsvUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCsvUpload(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleExtraCsv} />
            <h3 className="text-lg font-semibold text-slate-900">비교과 CSV 일괄 등록</h3>
            <p className="mt-1 text-sm text-slate-500">헤더: name, category, organizer, description, start_date, end_date, max_participants, registration_open</p>
            {csvProcessing && <p className="mt-3 text-sm text-blue-600">처리 중...</p>}
            {csvResult && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm">성공: <strong className="text-green-600">{csvResult.success}건</strong>, 실패: <strong className="text-red-600">{csvResult.failed}건</strong></p>
                {csvResult.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-auto text-xs text-red-600">
                    {csvResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {!csvProcessing && (
                <button type="button" onClick={() => csvRef.current?.click()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  <Upload className="h-4 w-4" /> 파일 선택
                </button>
              )}
              <button type="button" onClick={() => setShowCsvUpload(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 학생-비교과 CSV 일괄 연결 모달 */}
      {showStudentCsv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowStudentCsv(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input ref={studentCsvRef} type="file" accept=".csv" className="hidden" onChange={handleStudentExtraCsv} />
            <h3 className="text-lg font-semibold text-slate-900">학생-비교과 일괄 연결</h3>
            <p className="mt-1 text-sm text-slate-500">헤더: student_id, extracurricular_id, status</p>
            <p className="mt-1 text-xs text-slate-400">extracurricular_id 대신 extracurricular_name(프로그램명)도 사용 가능. status: 신청/참여중/완료</p>
            {csvProcessing && <p className="mt-3 text-sm text-blue-600">처리 중...</p>}
            {csvResult && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm">성공: <strong className="text-green-600">{csvResult.success}건</strong>, 실패: <strong className="text-red-600">{csvResult.failed}건</strong></p>
                {csvResult.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-auto text-xs text-red-600">
                    {csvResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {!csvProcessing && (
                <button type="button" onClick={() => studentCsvRef.current?.click()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  <Upload className="h-4 w-4" /> 파일 선택
                </button>
              )}
              <button type="button" onClick={() => setShowStudentCsv(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">닫기</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

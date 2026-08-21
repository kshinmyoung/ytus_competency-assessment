"use client";

import { BarChart3, Edit3, Film, ListVideo, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { canManageLms } from "@/lib/auth/lms-permissions";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

type CompletionRule = {
  min_progress: number;
  require_all_required_contents: boolean;
  require_survey: boolean;
  survey_id: number | null;
};

type CoreComp = { id: number; name: string; color_code: string };

type VideoProgram = {
  id: number;
  name: string;
  category: string | null;
  organizer: string | null;
  description: string | null;
  delivery_type: string;
  target_audience: string;
  completion_mileage: number;
  max_participants: number | null;
  is_active: boolean;
  registration_open: boolean;
  core_competency_tags: number[];
  completion_rule: CompletionRule;
};

const DEFAULT_RULE: CompletionRule = {
  min_progress: 90,
  require_all_required_contents: true,
  require_survey: false,
  survey_id: null,
};

const emptyForm = {
  name: "",
  category: "",
  organizer: "",
  description: "",
  delivery_type: "video",
  target_audience: "all",
  completion_mileage: 0,
  max_participants: null as number | null,
  is_active: true,
  registration_open: false,
  min_progress: 90,
  core_competency_tags: [] as number[],
};

const AUDIENCE_LABELS: Record<string, string> = {
  all: "전체",
  domestic: "내국인",
  international: "유학생",
};

const DELIVERY_LABELS: Record<string, string> = {
  video: "영상",
  hybrid: "혼합",
  offline: "오프라인",
};

export default function AdminLmsPage() {
  const [items, setItems] = useState<VideoProgram[]>([]);
  const [coreComps, setCoreComps] = useState<CoreComp[]>([]);
  const [contentCounts, setContentCounts] = useState<Record<number, number>>({});
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 영상형은 정원 무제한이므로 입력란을 비활성화한다
  const capacityDisabled = form.delivery_type === "video";

  const load = async () => {
    const { data } = await supabase
      .from("extracurricular")
      .select("*")
      .in("delivery_type", ["video", "hybrid"])
      .order("id", { ascending: false });
    const list = (data ?? []) as VideoProgram[];
    setItems(list);

    if (list.length > 0) {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const counts: Record<number, number> = {};
      await Promise.all(
        list.map(async (p) => {
          const res = await fetch(`/api/admin/lms/contents?programId=${p.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          counts[p.id] = res.ok ? ((await res.json()) as unknown[]).length : 0;
        }),
      );
      setContentCounts(counts);
    } else {
      setContentCounts({});
    }
  };

  useEffect(() => {
    (async () => {
      const studentId = await getCurrentStudentId();
      if (!studentId) {
        setAllowed(false);
        return;
      }
      const { data } = await supabase
        .from("students")
        .select("role")
        .eq("student_id", studentId)
        .maybeSingle();
      if (!canManageLms(data?.role)) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      // 비교과 관리 화면과 동일하게 핵심역량 목록을 불러온다
      const { data: comps } = await supabase.from("core_competencies").select("id, name, color_code").order("id");
      setCoreComps(comps ?? []);
      await load();
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const handleEdit = (item: VideoProgram) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category ?? "",
      organizer: item.organizer ?? "",
      description: item.description ?? "",
      delivery_type: item.delivery_type,
      target_audience: item.target_audience,
      completion_mileage: item.completion_mileage ?? 0,
      max_participants: item.max_participants,
      is_active: item.is_active,
      registration_open: item.registration_open,
      min_progress: item.completion_rule?.min_progress ?? 90,
      core_competency_tags: item.core_competency_tags ?? [],
    });
    setError("");
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");

    const isVideo = form.delivery_type === "video";
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      organizer: form.organizer.trim() || null,
      description: form.description.trim() || null,
      delivery_type: form.delivery_type,
      target_audience: form.target_audience,
      completion_mileage: Number(form.completion_mileage) || 0,
      // 영상형은 정원 무제한
      max_participants: isVideo ? null : form.max_participants,
      is_active: form.is_active,
      registration_open: form.registration_open,
      core_competency_tags: form.core_competency_tags,
      completion_rule: {
        ...DEFAULT_RULE,
        min_progress: Number(form.min_progress) || 90,
      },
    };

    const { error: saveError } = editingId
      ? await supabase.from("extracurricular").update(payload).eq("id", editingId)
      : await supabase.from("extracurricular").insert(payload);

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    await load();
  };

  const toggleCoreTag = (id: number) => {
    setForm((prev) => ({
      ...prev,
      core_competency_tags: prev.core_competency_tags.includes(id)
        ? prev.core_competency_tags.filter((t) => t !== id)
        : [...prev.core_competency_tags, id],
    }));
  };

  const handleDelete = async (item: VideoProgram) => {
    if ((contentCounts[item.id] ?? 0) > 0) {
      alert("콘텐츠가 등록된 프로그램은 삭제할 수 없습니다. 콘텐츠를 먼저 정리해 주세요.");
      return;
    }
    if (!confirm(`'${item.name}' 프로그램을 삭제하시겠습니까?`)) return;
    const { error: delError } = await supabase.from("extracurricular").delete().eq("id", item.id);
    if (delError) {
      alert(delError.message);
      return;
    }
    await load();
  };

  if (allowed === null) {
    return (
      <AdminLayout>
        <p className="text-sm text-slate-500">확인 중...</p>
      </AdminLayout>
    );
  }

  if (!allowed) {
    return (
      <AdminLayout>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow">
          <p className="text-sm text-slate-600">영상 LMS 관리 권한이 없습니다.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">영상 LMS 관리</h2>
          <p className="mt-1 text-xs text-slate-500">영상형·혼합형 비교과 프로그램만 표시됩니다.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="프로그램명 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => { setEditingId(null); setForm(emptyForm); setError(""); setShowForm(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            영상 프로그램 추가
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">프로그램명</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">유형</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">대상</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">콘텐츠</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">이수 기준</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">마일리지</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">상태</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  영상형 프로그램이 없습니다. &lsquo;영상 프로그램 추가&rsquo;로 만들어 주세요.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                      <Film className="h-3 w-3" />
                      {DELIVERY_LABELS[item.delivery_type] ?? item.delivery_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{AUDIENCE_LABELS[item.target_audience] ?? item.target_audience}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{contentCounts[item.id] ?? 0}개</td>
                  <td className="px-4 py-3 text-sm text-slate-600">진도 {item.completion_rule?.min_progress ?? 90}%</td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {item.completion_mileage > 0 ? `${item.completion_mileage}점` : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.is_active ? "운영중" : "비활성"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/lms/${item.id}/contents`}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ListVideo className="h-3.5 w-3.5" />
                        콘텐츠
                      </Link>
                      <Link
                        href={`/admin/lms/${item.id}/progress`}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                        진도 현황
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        title="수정"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-bold text-slate-900">
              {editingId ? "영상 프로그램 수정" : "영상 프로그램 추가"}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">프로그램명 *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">카테고리</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">주관 부서</label>
                  <input
                    type="text"
                    value={form.organizer}
                    onChange={(e) => setForm({ ...form, organizer: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">설명</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">전달 방식</label>
                  <select
                    value={form.delivery_type}
                    onChange={(e) => setForm({ ...form, delivery_type: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="video">영상</option>
                    <option value="hybrid">혼합 (영상 + 오프라인)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">수강 대상</label>
                  <select
                    value={form.target_audience}
                    onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="all">전체</option>
                    <option value="domestic">내국인</option>
                    <option value="international">유학생</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">이수 기준 진도율 (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={form.min_progress}
                    onChange={(e) => setForm({ ...form, min_progress: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">이수 마일리지</label>
                  <input
                    type="number"
                    min={0}
                    value={form.completion_mileage}
                    onChange={(e) => setForm({ ...form, completion_mileage: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">유학생은 지급되지 않습니다.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">정원</label>
                  <input
                    type="number"
                    min={0}
                    disabled={capacityDisabled}
                    value={capacityDisabled ? "" : (form.max_participants ?? "")}
                    onChange={(e) =>
                      setForm({ ...form, max_participants: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    placeholder={capacityDisabled ? "무제한" : ""}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    {capacityDisabled ? "영상형은 정원 무제한" : "비워두면 무제한"}
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">핵심역량 태그</label>
                <div className="flex flex-wrap gap-2">
                  {coreComps.map((comp) => (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => toggleCoreTag(comp.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        form.core_competency_tags.includes(comp.id) ? "ring-2 ring-offset-1" : "opacity-50"
                      }`}
                      style={{ backgroundColor: comp.color_code + "20", color: comp.color_code, outlineColor: comp.color_code }}
                    >
                      {comp.name}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  대시보드에서 학생의 취약 역량과 매칭해 추천할 때 사용합니다.
                </p>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  운영중
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.registration_open}
                    onChange={(e) => setForm({ ...form, registration_open: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  신청 받기
                </label>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

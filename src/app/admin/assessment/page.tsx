"use client";

import { ChevronDown, ChevronRight, Edit3, Filter, Palette, Plus, Settings, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLayout from "@/components/AdminLayout";

type DiagnosisType = {
  id: number;
  key: string;
  label: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
};
type Subcategory = {
  id: number;
  diagnosis_type_key: string;
  name: string;
  sort_order: number;
  department_id: number | null;
};
type Department = { id: number; name: string };
type Question = {
  id: number;
  competency_type: string;
  competency_id: number;
  question_text: string;
  question_order: number;
  is_active: boolean;
  department_id: number | null;
};
type Option = {
  id: number;
  question_id: number;
  option_text: string;
  option_value: number;
  option_order: number;
};

const defaultOptions = [
  { option_text: "전혀 그렇지 않다", option_value: 1, option_order: 1 },
  { option_text: "그렇지 않다", option_value: 2, option_order: 2 },
  { option_text: "보통이다", option_value: 3, option_order: 3 },
  { option_text: "그렇다", option_value: 4, option_order: 4 },
  { option_text: "매우 그렇다", option_value: 5, option_order: 5 },
];

export default function AdminAssessmentPage() {
  const [diagTypes, setDiagTypes] = useState<DiagnosisType[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Map<number, Option[]>>(new Map());

  const [filterType, setFilterType] = useState<string>("all");
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  // 진단 유형 관리
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState<DiagnosisType | null>(null);
  const [typeForm, setTypeForm] = useState({ key: "", label: "", description: "", color: "#6366F1", sort_order: 0 });

  // 하위 카테고리 관리
  const [showSubForm, setShowSubForm] = useState(false);
  const [editingSub, setEditingSub] = useState<Subcategory | null>(null);
  const [subForm, setSubForm] = useState({ diagnosis_type_key: "", name: "", sort_order: 0, department_id: null as number | null });
  const [deptList, setDeptList] = useState<Department[]>([]);

  // 문항 관리
  const [showQForm, setShowQForm] = useState(false);
  const [editingQ, setEditingQ] = useState<Question | null>(null);
  const [qForm, setQForm] = useState({
    competency_type: "",
    competency_id: 1,
    question_text: "",
    question_order: 0,
    is_active: true,
    department_id: null as number | null,
    options: [...defaultOptions],
  });

  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [typesRes, subRes, qRes, optRes, deptRes] = await Promise.all([
      supabase.from("diagnosis_types").select("*").order("sort_order"),
      supabase.from("diagnosis_subcategories").select("*").order("department_id").order("sort_order"),
      supabase.from("assessment_questions").select("*").order("competency_type").order("department_id").order("competency_id").order("question_order"),
      supabase.from("assessment_options").select("*").order("option_order"),
      supabase.from("departments").select("id, name").order("id"),
    ]);
    setDiagTypes(typesRes.data ?? []);
    setSubcategories(subRes.data ?? []);
    setDeptList(deptRes.data ?? []);
    setQuestions(qRes.data ?? []);

    const map = new Map<number, Option[]>();
    (optRes.data ?? []).forEach((o: Option) => {
      const arr = map.get(o.question_id) ?? [];
      arr.push(o);
      map.set(o.question_id, arr);
    });
    setOptions(map);
  };

  useEffect(() => {
    load();
  }, []);

  // 초기 확장
  useEffect(() => {
    if (diagTypes.length > 0 && expandedTypes.size === 0) {
      setExpandedTypes(new Set(diagTypes.map((t) => t.key)));
    }
  }, [diagTypes]);

  const typeMap = useMemo(() => {
    const m: Record<string, DiagnosisType> = {};
    diagTypes.forEach((t) => (m[t.key] = t));
    return m;
  }, [diagTypes]);

  const subsByType = useMemo(() => {
    const m: Record<string, Subcategory[]> = {};
    subcategories.forEach((s) => {
      if (!m[s.diagnosis_type_key]) m[s.diagnosis_type_key] = [];
      m[s.diagnosis_type_key].push(s);
    });
    return m;
  }, [subcategories]);

  const questionsByTypeAndCat = useMemo(() => {
    const m: Record<string, Record<number, Question[]>> = {};
    questions.forEach((q) => {
      if (!m[q.competency_type]) m[q.competency_type] = {};
      if (!m[q.competency_type][q.competency_id]) m[q.competency_type][q.competency_id] = [];
      m[q.competency_type][q.competency_id].push(q);
    });
    return m;
  }, [questions]);

  const deptNameMap = useMemo(() => {
    const m: Record<number, string> = {};
    deptList.forEach((d) => (m[d.id] = d.name));
    return m;
  }, [deptList]);

  // 전공역량진단 같은 학과별 유형인지 판단
  const hasDeptSubs = (typeKey: string) => {
    const subs = subsByType[typeKey] ?? [];
    return subs.some((s) => s.department_id !== null);
  };

  const filteredTypes = useMemo(() => {
    if (filterType === "all") return diagTypes;
    return diagTypes.filter((t) => t.key === filterType);
  }, [diagTypes, filterType]);

  const toggleExpand = (key: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const subName = (typeKey: string, catId: number) => {
    const subs = subsByType[typeKey] ?? [];
    const sub = subs.find((s) => s.sort_order === catId);
    return sub?.name ?? `카테고리 ${catId}`;
  };

  // === 진단 유형 CRUD ===
  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeForm.key.trim() || !typeForm.label.trim()) return;
    setSaving(true);
    const payload = {
      key: typeForm.key.trim(),
      label: typeForm.label.trim(),
      description: typeForm.description.trim() || null,
      color: typeForm.color,
      sort_order: typeForm.sort_order,
      is_active: true,
    };
    if (editingType) {
      await supabase.from("diagnosis_types").update({ label: payload.label, description: payload.description, color: payload.color, sort_order: payload.sort_order }).eq("id", editingType.id);
    } else {
      await supabase.from("diagnosis_types").insert(payload);
    }
    setSaving(false);
    setShowTypeForm(false);
    setEditingType(null);
    await load();
  };

  const handleDeleteType = async (t: DiagnosisType) => {
    if (!confirm(`"${t.label}" 진단 유형과 하위 카테고리, 문항을 모두 삭제하시겠습니까?`)) return;
    await supabase.from("assessment_questions").delete().eq("competency_type", t.key);
    await supabase.from("diagnosis_subcategories").delete().eq("diagnosis_type_key", t.key);
    await supabase.from("diagnosis_types").delete().eq("id", t.id);
    await load();
  };

  // === 하위 카테고리 CRUD ===
  const handleSaveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subForm.name.trim() || !subForm.diagnosis_type_key) return;
    setSaving(true);
    if (editingSub) {
      await supabase.from("diagnosis_subcategories").update({ name: subForm.name.trim(), sort_order: subForm.sort_order, department_id: subForm.department_id }).eq("id", editingSub.id);
    } else {
      await supabase.from("diagnosis_subcategories").insert({
        diagnosis_type_key: subForm.diagnosis_type_key,
        name: subForm.name.trim(),
        sort_order: subForm.sort_order,
        department_id: subForm.department_id,
      });
    }
    setSaving(false);
    setShowSubForm(false);
    setEditingSub(null);
    await load();
  };

  const handleDeleteSub = async (sub: Subcategory) => {
    if (!confirm(`"${sub.name}" 카테고리를 삭제하시겠습니까?`)) return;
    await supabase.from("diagnosis_subcategories").delete().eq("id", sub.id);
    await load();
  };

  // === 문항 CRUD ===
  const handleSaveQ = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qForm.question_text.trim() || !qForm.competency_type) return;
    setSaving(true);

    const payload = {
      competency_type: qForm.competency_type,
      competency_id: qForm.competency_id,
      question_text: qForm.question_text.trim(),
      question_order: qForm.question_order,
      is_active: qForm.is_active,
      department_id: qForm.department_id,
    };

    let questionId: number;
    if (editingQ) {
      await supabase.from("assessment_questions").update(payload).eq("id", editingQ.id);
      questionId = editingQ.id;
      await supabase.from("assessment_options").delete().eq("question_id", questionId);
    } else {
      const { data } = await supabase.from("assessment_questions").insert(payload).select("id").single();
      questionId = data!.id;
    }

    if (qForm.options.length > 0) {
      await supabase.from("assessment_options").insert(
        qForm.options.map((o) => ({ question_id: questionId, option_text: o.option_text, option_value: o.option_value, option_order: o.option_order }))
      );
    }

    setSaving(false);
    setShowQForm(false);
    setEditingQ(null);
    await load();
  };

  const handleDeleteQ = async (q: Question) => {
    if (!confirm("이 문항을 삭제하시겠습니까?")) return;
    await supabase.from("assessment_options").delete().eq("question_id", q.id);
    await supabase.from("assessment_questions").delete().eq("id", q.id);
    await load();
  };

  const handleToggleQ = async (q: Question) => {
    await supabase.from("assessment_questions").update({ is_active: !q.is_active }).eq("id", q.id);
    await load();
  };

  const openAddQuestion = (typeKey: string, catSortOrder: number, deptId?: number | null) => {
    const typeQuestions = questionsByTypeAndCat[typeKey]?.[catSortOrder] ?? [];
    setEditingQ(null);
    setQForm({
      competency_type: typeKey,
      competency_id: catSortOrder,
      question_text: "",
      question_order: typeQuestions.length + 1,
      is_active: true,
      department_id: deptId ?? null,
      options: [...defaultOptions],
    });
    setShowQForm(true);
  };

  const openEditQuestion = (q: Question) => {
    const qOpts = options.get(q.id) ?? [];
    setEditingQ(q);
    setQForm({
      competency_type: q.competency_type,
      competency_id: q.competency_id,
      question_text: q.question_text,
      question_order: q.question_order,
      is_active: q.is_active,
      department_id: q.department_id,
      options: qOpts.length > 0
        ? qOpts.map((o) => ({ option_text: o.option_text, option_value: o.option_value, option_order: o.option_order }))
        : [...defaultOptions],
    });
    setShowQForm(true);
  };

  const updateOption = (index: number, field: string, value: string | number) => {
    setQForm((prev) => {
      const opts = [...prev.options];
      opts[index] = { ...opts[index], [field]: value };
      return { ...prev, options: opts };
    });
  };

  const renderSubcategory = (dt: DiagnosisType, sub: Subcategory) => {
    const catQuestions = (questionsByTypeAndCat[dt.key]?.[sub.sort_order] ?? []).filter(
      (q) => !sub.department_id || q.department_id === sub.department_id || q.department_id === null
    );
    return (
      <div key={sub.id} className="rounded-xl border border-slate-200 bg-slate-50/50">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">{sub.name}</span>
            {sub.department_id && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-600">{deptNameMap[sub.department_id]}</span>}
            <span className="text-xs text-slate-400">{catQuestions.length}문항</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => openAddQuestion(dt.key, sub.sort_order, sub.department_id)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">
              <Plus className="h-3 w-3" /> 문항
            </button>
            <button type="button" onClick={() => {
              setEditingSub(sub);
              setSubForm({ diagnosis_type_key: dt.key, name: sub.name, sort_order: sub.sort_order, department_id: sub.department_id });
              setShowSubForm(true);
            }} className="rounded p-1 text-slate-400 hover:text-slate-600">
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => handleDeleteSub(sub)} className="rounded p-1 text-slate-400 hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {catQuestions.length > 0 && (
          <div className="border-t border-slate-200">
            <table className="min-w-full">
              <tbody className="divide-y divide-slate-100">
                {catQuestions.map((q) => (
                  <tr key={q.id} className="hover:bg-white">
                    <td className="w-8 px-3 py-2 text-center text-xs text-slate-400">{q.question_order}</td>
                    <td className="px-3 py-2">
                      <p className="text-sm text-slate-800">{q.question_text}</p>
                      <div className="mt-0.5 flex gap-1">
                        {(options.get(q.id) ?? []).map((opt) => (
                          <span key={opt.id} className="rounded bg-white px-1 py-0.5 text-[9px] text-slate-400 ring-1 ring-slate-200">{opt.option_value}점</span>
                        ))}
                      </div>
                    </td>
                    <td className="w-12 px-2 py-2 text-center">
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${q.is_active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"}`}>{q.is_active ? "ON" : "OFF"}</span>
                    </td>
                    <td className="w-20 whitespace-nowrap px-2 py-2 text-right">
                      <button type="button" onClick={() => openEditQuestion(q)} className="mr-1 text-blue-500 hover:text-blue-700"><Edit3 className="inline h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => handleToggleQ(q)} className="mr-1 text-xs text-slate-400 hover:text-slate-600">{q.is_active ? "끄기" : "켜기"}</button>
                      <button type="button" onClick={() => handleDeleteQ(q)} className="text-red-400 hover:text-red-600"><Trash2 className="inline h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-900">역량진단 관리</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingType(null);
              setTypeForm({ key: "", label: "", description: "", color: "#6366F1", sort_order: diagTypes.length + 1 });
              setShowTypeForm(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> 진단 유형 추가
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="mb-6 flex items-center gap-3">
        <Filter className="h-4 w-4 text-slate-400" />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">전체 유형</option>
          {diagTypes.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <span className="text-sm text-slate-500">총 {questions.length}개 문항</span>
      </div>

      {/* 진단 유형별 아코디언 */}
      {filteredTypes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-sm text-slate-500">등록된 진단 유형이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTypes.map((dt) => {
            const expanded = expandedTypes.has(dt.key);
            const subs = subsByType[dt.key] ?? [];
            const totalQ = Object.values(questionsByTypeAndCat[dt.key] ?? {}).reduce((sum, arr) => sum + arr.length, 0);

            return (
              <div key={dt.key} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {/* 유형 헤더 */}
                <div
                  className="flex cursor-pointer items-center justify-between px-5 py-4 hover:bg-slate-50"
                  onClick={() => toggleExpand(dt.key)}
                >
                  <div className="flex items-center gap-3">
                    {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: dt.color }} />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{dt.label}</h3>
                      {dt.description && <p className="text-xs text-slate-500">{dt.description}</p>}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{subs.length}개 카테고리 · {totalQ}문항</span>
                    {["core_diagnosis", "learning_diagnosis", "calling_diagnosis"].includes(dt.key) && (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">기존 결과 보존</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => {
                      setEditingType(dt);
                      setTypeForm({ key: dt.key, label: dt.label, description: dt.description ?? "", color: dt.color, sort_order: dt.sort_order });
                      setShowTypeForm(true);
                    }} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                      <Settings className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => handleDeleteType(dt)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* 확장 내용 */}
                {expanded && (
                  <div className="border-t border-slate-100 px-5 pb-5 pt-3">
                    {/* 카테고리 추가 버튼 */}
                    <div className="mb-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSub(null);
                          setSubForm({ diagnosis_type_key: dt.key, name: "", sort_order: subs.length + 1, department_id: null });
                          setShowSubForm(true);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600"
                      >
                        <Plus className="h-3 w-3" /> 카테고리 추가
                      </button>
                    </div>

                    {subs.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-400">하위 카테고리가 없습니다.</p>
                    ) : (
                      <div className="space-y-4">
                        {/* 학과별 그룹핑이 필요한 유형 */}
                        {hasDeptSubs(dt.key) && (() => {
                          const deptIds = Array.from(new Set(subs.filter((s) => s.department_id).map((s) => s.department_id!)));
                          return deptIds.map((dId) => (
                            <div key={`dept-${dId}`} className="mb-2">
                              <p className="mb-2 rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">{deptNameMap[dId] ?? `학과 ${dId}`}</p>
                              <div className="space-y-2 pl-2">
                                {subs.filter((s) => s.department_id === dId).map((sub) => renderSubcategory(dt, sub))}
                              </div>
                            </div>
                          ));
                        })()}
                        {/* 학과 구분 없는 카테고리 */}
                        {subs.filter((s) => !s.department_id || !hasDeptSubs(dt.key)).map((sub) => {
                          if (hasDeptSubs(dt.key) && sub.department_id) return null;
                          return renderSubcategory(dt, sub);
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 진단 유형 추가/수정 모달 */}
      {showTypeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowTypeForm(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{editingType ? "진단 유형 수정" : "진단 유형 추가"}</h3>
            <form onSubmit={handleSaveType} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">유형 키 (영문) {editingType && <span className="text-xs text-slate-400">- 수정 불가</span>}</label>
                <input type="text" value={typeForm.key} onChange={(e) => setTypeForm({ ...typeForm, key: e.target.value.replace(/\s/g, "_") })} disabled={!!editingType} required placeholder="예: personality_diagnosis" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">표시 이름</label>
                <input type="text" value={typeForm.label} onChange={(e) => setTypeForm({ ...typeForm, label: e.target.value })} required placeholder="예: 인성역량진단" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">설명</label>
                <input type="text" value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} placeholder="간단한 설명" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">색상</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="color" value={typeForm.color} onChange={(e) => setTypeForm({ ...typeForm, color: e.target.value })} className="h-8 w-8 cursor-pointer rounded border-0" />
                    <span className="text-xs text-slate-500">{typeForm.color}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">정렬 순서</label>
                  <input type="number" value={typeForm.sort_order} onChange={(e) => setTypeForm({ ...typeForm, sort_order: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowTypeForm(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">취소</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "저장 중..." : "저장"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 하위 카테고리 추가/수정 모달 */}
      {showSubForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSubForm(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{editingSub ? "카테고리 수정" : "카테고리 추가"}</h3>
            <p className="mt-1 text-xs text-slate-500">{typeMap[subForm.diagnosis_type_key]?.label}</p>
            <form onSubmit={handleSaveSub} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">카테고리명</label>
                <input type="text" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} required placeholder="예: 리더십역량" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">소속 학과 (선택)</label>
                <select value={subForm.department_id ?? ""} onChange={(e) => setSubForm({ ...subForm, department_id: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">전체 (학과 구분 없음)</option>
                  {deptList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">순서</label>
                <input type="number" value={subForm.sort_order} onChange={(e) => setSubForm({ ...subForm, sort_order: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowSubForm(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">취소</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "저장 중..." : "저장"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 문항 추가/수정 모달 */}
      {showQForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowQForm(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{editingQ ? "문항 수정" : "문항 추가"}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {typeMap[qForm.competency_type]?.label} &gt; {subName(qForm.competency_type, qForm.competency_id)}
            </p>
            <form onSubmit={handleSaveQ} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">문항</label>
                <textarea value={qForm.question_text} onChange={(e) => setQForm({ ...qForm, question_text: e.target.value })} rows={3} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">순서</label>
                  <input type="number" value={qForm.question_order} onChange={(e) => setQForm({ ...qForm, question_order: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={qForm.is_active} onChange={(e) => setQForm({ ...qForm, is_active: e.target.checked })} className="rounded" /> 활성
                  </label>
                </div>
              </div>

              {/* 보기(점수) 설정 */}
              <div>
                <label className="block text-sm font-medium text-slate-700">보기 및 점수 설정</label>
                <div className="mt-2 space-y-2">
                  {qForm.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-12 text-right text-xs text-slate-500">{opt.option_value}점</span>
                      <input type="number" value={opt.option_value} onChange={(e) => updateOption(i, "option_value", Number(e.target.value))} className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                      <input type="text" value={opt.option_text} onChange={(e) => updateOption(i, "option_text", e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" placeholder="보기 텍스트" />
                      <button type="button" onClick={() => setQForm((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setQForm((p) => ({ ...p, options: [...p.options, { option_text: "", option_value: p.options.length + 1, option_order: p.options.length + 1 }] }))} className="text-sm text-blue-600 hover:underline">+ 보기 추가</button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowQForm(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">취소</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "저장 중..." : "저장"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

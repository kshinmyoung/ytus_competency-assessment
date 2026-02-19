"use client";

import { FileDown, LogOut, Search, Upload, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateTimeKorea } from "@/lib/date";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

type Student = {
  student_id: string;
  name: string | null;
  password: string | null;
  role: string | null;
};

type DiagnosisResult = {
  id?: string;
  student_id: string;
  diagnosis_type: string;
  total_score: number;
  scores: Record<string, number> | null;
  created_at?: string;
};

const DIAGNOSIS_LABELS: Record<string, string> = {
  core: "핵심역량",
  learning: "학습역량",
  calling: "소명진단",
};

const SCORE_LABELS: Record<string, Record<string, string>> = {
  core: {
    spiritual: "영성",
    reflection: "기독교적성찰",
    empathy: "공감소통",
    glocal: "글로컬",
    creative: "창의융합",
  },
  learning: {
    launch: "Launch",
    explore: "Explore",
    act: "Act",
    refine: "Refine",
    network: "Network",
  },
  calling: {
    calling: "Calling",
    awakening: "Awakening",
    leading: "Leading",
    launching: "Launching",
    plus: "Plus",
  },
};

function getScoreRows(diagnosisType: string, scores: Record<string, number> | null): { label: string; score: number }[] {
  const map = SCORE_LABELS[diagnosisType];
  if (!scores || !map) return [];
  return Object.entries(scores)
    .map(([key, value]) => ({ label: map[key] ?? key, score: value }))
    .filter((r) => r.label);
}

/** CSV 한 줄 파싱 (쉼표 구분, 따옴표 안의 쉼표 허용) */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

/** CSV 텍스트에서 student_id, password, name, role 행 배열 추출 (첫 줄 헤더 가정) */
function parseCsvToStudents(csvText: string): { student_id: string; password: string; name: string; role: string }[] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s/g, "_"));
  const idx = (key: string) => {
    const i = header.indexOf(key);
    if (i >= 0) return i;
    const alt = header.find((h) => h.includes(key));
    return alt ? header.indexOf(alt) : -1;
  };
  const sidx = idx("student_id") >= 0 ? idx("student_id") : 0;
  const pidx = idx("password") >= 0 ? idx("password") : 1;
  const nidx = idx("name") >= 0 ? idx("name") : 2;
  const ridx = idx("role") >= 0 ? idx("role") : 3;
  const rows: { student_id: string; password: string; name: string; role: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const student_id = (cells[sidx] ?? "").trim();
    const password = (cells[pidx] ?? "").trim();
    if (!student_id || !password) continue;
    rows.push({
      student_id,
      password,
      name: (cells[nidx] ?? "").trim(),
      role: (cells[ridx] ?? "student").trim() || "student",
    });
  }
  return rows;
}

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [resultsCore, setResultsCore] = useState<DiagnosisResult[]>([]);
  const [resultsLearning, setResultsLearning] = useState<DiagnosisResult[]>([]);
  const [resultsCalling, setResultsCalling] = useState<DiagnosisResult[]>([]);
  const [activeTab, setActiveTab] = useState<"core" | "learning" | "calling">("core");
  const [detailRow, setDetailRow] = useState<DiagnosisResult | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ name: "", password: "", role: "student" });
  const [newStudent, setNewStudent] = useState({
    student_id: "",
    name: "",
    password: "",
    role: "student",
  });
  const [saving, setSaving] = useState(false);
  const [printData, setPrintData] = useState<{
    title: string;
    rows: { student_id: string; name: string; total_score: number; created_at: string }[];
  } | null>(null);
  const [printIndividual, setPrintIndividual] = useState<{
    name: string;
    student_id: string;
    diagnosisName: string;
    total_score: number;
    scoreRows: { label: string; score: number }[];
  } | null>(null);
  const [searchStudent, setSearchStudent] = useState("");
  const [searchResult, setSearchResult] = useState("");
  const [showLowScore, setShowLowScore] = useState(false);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    total: number;
    current: number;
    success: number;
    failed: number;
    failedIds: string[];
    done: boolean;
  } | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const printDoneRef = useRef(false);

  const loadStudents = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    const res = await fetch("/api/admin/students", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as Student[];
    setStudents(data);
    const map: Record<string, string> = {};
    data.forEach((r) => {
      map[r.student_id] = r.name ?? "";
    });
    setNameMap(map);
  }, []);

  const loadDiagnosis = useCallback(async () => {
    const [core, learning, calling] = await Promise.all([
      supabase.from("diagnosis_results").select("*").eq("diagnosis_type", "core").order("created_at", { ascending: false }),
      supabase.from("diagnosis_results").select("*").eq("diagnosis_type", "learning").order("created_at", { ascending: false }),
      supabase.from("diagnosis_results").select("*").eq("diagnosis_type", "calling").order("created_at", { ascending: false }),
    ]);
    if (core.data) setResultsCore((core.data as DiagnosisResult[]));
    if (learning.data) setResultsLearning((learning.data as DiagnosisResult[]));
    if (calling.data) setResultsCalling((calling.data as DiagnosisResult[]));
  }, []);

  useEffect(() => {
    (async () => {
      const studentId = await getCurrentStudentId();
      if (!studentId?.trim()) {
        router.replace("/");
        return;
      }
      const { data } = await supabase
        .from("students")
        .select("role")
        .eq("student_id", studentId.trim())
        .maybeSingle();
      const userRole = (data?.role ?? "").trim().toLowerCase();
      console.log("현재 유저의 역할:", data?.role ?? "(없음)", "→ 판단:", userRole || "(student)");
      if (userRole !== "admin") {
        router.replace("/");
        return;
      }
      setAuthorized(true);
      await loadStudents();
      await loadDiagnosis();
    })();
  }, [router, loadStudents, loadDiagnosis]);

  // 학생 추가: supabase.from('students').insert 직접 호출 금지. 반드시 서버 API만 사용 (Auth + students 동시 생성)
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.student_id.trim() || !newStudent.password.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: newStudent.student_id.trim(),
          name: newStudent.name.trim(),
          password: newStudent.password.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const step = data.step ?? "unknown";
        const msg = data.error ?? "등록 실패";
        if (step === "auth") {
          console.error("[학생 등록] Auth 생성 실패:", msg);
        } else if (step === "db") {
          console.error("[학생 등록] DB 저장 실패 (Auth는 생성됨, students 테이블 insert 실패):", msg);
        } else {
          console.error("[학생 등록] 실패 (단계:", step + "):", msg);
        }
        alert(msg);
        return;
      }
      setShowAddStudent(false);
      setNewStudent({ student_id: "", name: "", password: "", role: "student" });
      loadStudents();
    } finally {
      setSaving(false);
    }
  };

  const handleEditStudent = (s: Student) => {
    setEditingStudent(s);
    setEditForm({ name: s.name ?? "", password: "", role: s.role ?? "student" });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setSaving(true);
    const payload: Partial<Pick<Student, "name" | "password" | "role">> = {
      role: editForm.role,
    };
    const trimmedName = editForm.name.trim();
    if (trimmedName) payload.name = trimmedName;
    if (editForm.password.trim()) payload.password = editForm.password.trim();
    const { error } = await supabase
      .from("students")
      .update(payload)
      .eq("student_id", editingStudent.student_id);
    setSaving(false);
    if (error) {
      alert("수정 실패: " + error.message);
      return;
    }
    setEditingStudent(null);
    loadStudents();
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm("해당 학생을 삭제할까요?")) return;
    const { error } = await supabase.from("students").delete().eq("student_id", studentId);
    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }
    loadStudents();
  };

  const BULK_DELAY_MS = 150;

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("CSV 파일(.csv)만 업로드할 수 있습니다.");
      e.target.value = "";
      return;
    }
    const text = await file.text();
    const rows = parseCsvToStudents(text);
    if (rows.length === 0) {
      alert("유효한 학생 데이터가 없습니다. 헤더: student_id, password, name, role");
      e.target.value = "";
      return;
    }
    setIsBulkProcessing(true);
    setBulkProgress({ total: rows.length, current: 0, success: 0, failed: 0, failedIds: [], done: false });
    let success = 0;
    const failedIds: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      setBulkProgress((p) => p && { ...p, current: i + 1 });
      const row = rows[i];
      try {
        const res = await fetch("/api/admin/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: row.student_id,
            name: row.name,
            password: row.password,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          success += 1;
          setBulkProgress((p) => p ? { ...p, success } : p);
        } else {
          failedIds.push(row.student_id);
          setBulkProgress((p) => p ? { ...p, failed: failedIds.length, failedIds: [...failedIds] } : p);
        }
      } catch {
        failedIds.push(row.student_id);
        setBulkProgress((p) => p ? { ...p, failed: failedIds.length, failedIds: [...failedIds] } : p);
      }
      if (i < rows.length - 1) {
        await new Promise((r) => setTimeout(r, BULK_DELAY_MS));
      }
    }
    setBulkProgress((p) => p ? { ...p, done: true, success, failed: failedIds.length, failedIds } : null);
    setIsBulkProcessing(false);
    loadStudents();
    e.target.value = "";
  };

  const getResultsByTab = () => {
    if (activeTab === "core") return resultsCore;
    if (activeTab === "learning") return resultsLearning;
    return resultsCalling;
  };

  const filteredStudents = useMemo(() => {
    const q = searchStudent.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.student_id.toLowerCase().includes(q) ||
        (s.name ?? "").toLowerCase().includes(q)
    );
  }, [students, searchStudent]);

  const filteredResults = useMemo(() => {
    const list = getResultsByTab();
    const q = searchResult.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.student_id.toLowerCase().includes(q) ||
        (nameMap[r.student_id] ?? "").toLowerCase().includes(q)
    );
  }, [activeTab, resultsCore, resultsLearning, resultsCalling, searchResult, nameMap]);

  const lowScoreResults = useMemo(() => {
    const list = getResultsByTab();
    if (list.length === 0) return [];
    const sorted = [...list].sort((a, b) => a.total_score - b.total_score);
    const count = Math.max(1, Math.ceil(sorted.length * 0.2));
    return sorted.slice(0, count);
  }, [activeTab, resultsCore, resultsLearning, resultsCalling]);

  const printIndividualReport = () => {
    if (!detailRow) return;
    const name = nameMap[detailRow.student_id] ?? "-";
    const diagnosisName = DIAGNOSIS_LABELS[detailRow.diagnosis_type] ?? detailRow.diagnosis_type;
    const scoreRows = getScoreRows(detailRow.diagnosis_type, detailRow.scores);
    setPrintIndividual({
      name,
      student_id: detailRow.student_id,
      diagnosisName,
      total_score: detailRow.total_score,
      scoreRows,
    });
    setTimeout(() => window.print(), 150);
  };

  const downloadPDF = () => {
    const rows = getResultsByTab();
    const title = `우리 대학 진단 결과 보고서 - ${DIAGNOSIS_LABELS[activeTab] ?? activeTab}`;
    setPrintData({
      title,
      rows: rows.map((r) => ({
        student_id: r.student_id,
        name: nameMap[r.student_id] ?? "-",
        total_score: r.total_score,
        created_at: formatDateTimeKorea(r.created_at),
      })),
    });
    printDoneRef.current = false;
    setTimeout(() => {
      window.print();
    }, 150);
  };

  useEffect(() => {
    if (!printDoneRef.current && (printData || printIndividual) && typeof window !== "undefined") {
      const onAfterPrint = () => {
        printDoneRef.current = true;
        setPrintData(null);
        setPrintIndividual(null);
        window.removeEventListener("afterprint", onAfterPrint);
      };
      window.addEventListener("afterprint", onAfterPrint);
      return () => window.removeEventListener("afterprint", onAfterPrint);
    }
  }, [printData, printIndividual]);

  if (authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">확인 중...</p>
      </div>
    );
  }

  if (!authorized) return null;

  const currentResults = getResultsByTab();

  return (
    <div className="min-h-screen bg-slate-50">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * { visibility: hidden; }
              .print-area, .print-area * { visibility: visible; }
              .print-individual, .print-individual * { visibility: visible; }
              .print-area, .print-individual {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                display: block !important;
                padding: 1rem;
                font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
              }
              .print-individual.hidden { display: block !important; visibility: visible !important; }
              .print-area table, .print-individual table { width: 100%; border-collapse: collapse; }
              .print-individual table th, .print-individual table td { padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; }
              .print-individual table th { background: #f9fafb; font-weight: 600; }
              header, nav, button, .no-print { display: none !important; visibility: hidden !important; }
            }
          `,
        }}
      />
      {printData && (
        <div className="print-area hidden">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">진단 결과 보고서</h1>
          <p className="mb-4 text-lg text-gray-700">{printData.title}</p>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="divide-x divide-gray-200 bg-gray-50">
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">학번</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">이름</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">총점</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">진단시간</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {printData.rows.map((r, i) => (
                <tr key={i} className="divide-x divide-gray-200">
                  <td className="px-4 py-2 text-sm text-gray-900">{r.student_id}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{r.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{r.total_score}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{r.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {printIndividual && (
        <div className="print-individual hidden font-sans">
          <h1 className="mb-2 text-xl font-bold text-gray-900">개인 진단 결과 보고서</h1>
          <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700">
            <p><strong>학생 성명:</strong> {printIndividual.name}</p>
            <p><strong>학번:</strong> {printIndividual.student_id}</p>
            <p><strong>진단명:</strong> {printIndividual.diagnosisName}</p>
            <p><strong>총점:</strong> {printIndividual.total_score}점</p>
          </div>
          <table className="min-w-full border-collapse border border-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left text-sm font-semibold text-gray-700">역량명</th>
                <th className="border border-gray-200 px-4 py-2 text-right text-sm font-semibold text-gray-700">점수</th>
              </tr>
            </thead>
            <tbody>
              {printIndividual.scoreRows.map((row, i) => (
                <tr key={i}>
                  <td className="border border-gray-200 px-4 py-2 text-sm text-gray-900">{row.label}</td>
                  <td className="border border-gray-200 px-4 py-2 text-right text-sm text-gray-900">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <header className="no-print border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <h1 className="text-lg font-bold text-slate-900">관리자 대시보드</h1>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("student_id");
                sessionStorage.removeItem("student_name");
              }
              router.push("/");
            }}
            className="no-print flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* 학생 관리 */}
        <section className="mb-10 no-print">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-slate-800">학생 관리</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="학번 또는 이름 검색..."
                  value={searchStudent}
                  onChange={(e) => setSearchStudent(e.target.value)}
                  className="w-56 rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAddStudent(true)}
                className="no-print flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <UserPlus className="h-4 w-4" />
                학생 추가
              </button>
              <button
                type="button"
                onClick={() => setShowCsvUpload(true)}
                disabled={isBulkProcessing}
                className="no-print flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                CSV 업로드
              </button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">학번</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">역할</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredStudents.map((s) => (
                  <tr key={s.student_id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-900">{s.student_id}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{s.name ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{s.role ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleEditStudent(s)}
                        className="no-print mr-3 text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStudent(s.student_id)}
                        className="no-print text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 진단 결과 탭 */}
        <section>
          <h2 className="no-print mb-4 text-base font-semibold text-slate-800">진단 결과 조회</h2>
          <div className="no-print mb-4 flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-1">
              {(["core", "learning", "calling"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${
                    activeTab === tab ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {DIAGNOSIS_LABELS[tab]}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="학번 또는 이름 검색..."
                value={searchResult}
                onChange={(e) => setSearchResult(e.target.value)}
                className="w-56 rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={downloadPDF}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <FileDown className="h-4 w-4" />
              PDF로 내보내기
            </button>
            <button
              type="button"
              onClick={() => setShowLowScore(true)}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              <Users className="h-4 w-4" />
              최저점 학생 조회
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">학번</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">총점</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">진단시간</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                      {searchResult.trim() ? "검색 결과가 없습니다." : "진단 결과가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((r) => (
                    <tr key={r.id ?? r.student_id + (r.created_at ?? "")} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-900">{r.student_id}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{nameMap[r.student_id] ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-900">{r.total_score}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {formatDateTimeKorea(r.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailRow(r)}
                          className="no-print text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                          상세보기
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* 학생 수정 모달 */}
      {editingStudent && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">학생 수정</h3>
            <p className="mt-1 text-sm text-slate-500">학번: {editingStudent.student_id}</p>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">이름</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">비밀번호 (변경 시에만 입력)</label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="비워두면 기존 유지"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">역할</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="student">student</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 학생 추가 모달 */}
      {showAddStudent && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">학생 추가</h3>
            <form onSubmit={handleAddStudent} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">학번</label>
                <input
                  type="text"
                  value={newStudent.student_id}
                  onChange={(e) => setNewStudent((s) => ({ ...s, student_id: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">이름</label>
                <input
                  type="text"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent((s) => ({ ...s, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">비밀번호</label>
                <input
                  type="password"
                  value={newStudent.password}
                  onChange={(e) => setNewStudent((s) => ({ ...s, password: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStudent(false)}
                  className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "등록 중..." : "등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV 일괄 등록 모달 */}
      {showCsvUpload && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCsvFileChange}
            />
            {!bulkProgress ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900">CSV 일괄 등록</h3>
                <p className="mt-1 text-sm text-slate-500">
                  첫 줄은 헤더(student_id, password, name, role)로 두고, .csv 파일만 업로드할 수 있습니다.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => csvInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <Upload className="h-4 w-4" />
                    파일 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCsvUpload(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    취소
                  </button>
                </div>
              </>
            ) : bulkProgress.done ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900">일괄 등록 결과</h3>
                <p className="mt-3 text-sm text-slate-700">
                  성공: <strong className="text-green-600">{bulkProgress.success}명</strong>, 실패:{" "}
                  <strong className="text-red-600">{bulkProgress.failed}명</strong>
                </p>
                {bulkProgress.failedIds.length > 0 && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-xs font-medium text-red-800">실패한 학번:</p>
                    <p className="mt-1 break-all text-sm text-red-700">
                      {bulkProgress.failedIds.join(", ")}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setBulkProgress(null);
                    setShowCsvUpload(false);
                  }}
                  className="mt-4 w-full rounded-lg bg-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
                >
                  닫기
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-900">일괄 등록 중</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {bulkProgress.total}명 중 {bulkProgress.current}명 등록 중...
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  성공 {bulkProgress.success}명, 실패 {bulkProgress.failed}명
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* 상세보기 팝업 - 역량별 점수 표 (깔끔한 표 형태, 인쇄 시 해당 표만 PDF 저장) */}
      {detailRow && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailRow(null)}
        >
          <div
            className="detail-modal-content max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">세부 역량 점수</h3>
            <p className="mt-1 text-sm text-slate-500">
              학번: {detailRow.student_id} · 총점: {detailRow.total_score}
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="detail-score-table min-w-full border-collapse font-sans text-slate-900">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">역량명</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">점수</th>
                  </tr>
                </thead>
                <tbody>
                  {getScoreRows(detailRow.diagnosis_type, detailRow.scores).length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-4 text-center text-sm text-slate-500">
                        저장된 세부 점수 없음
                      </td>
                    </tr>
                  ) : (
                    getScoreRows(detailRow.diagnosis_type, detailRow.scores).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-sm text-slate-900">{row.label}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">{row.score}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={printIndividualReport}
                className="no-print flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                이 결과만 프린트
              </button>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="no-print flex-1 rounded-lg bg-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-300"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {showLowScore && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowLowScore(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">최저점 학생 조회</h3>
            <p className="mt-1 text-sm text-slate-500">
              {DIAGNOSIS_LABELS[activeTab]} · 하위 20% ({lowScoreResults.length}명)
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">학번</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">이름</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">총점</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">진단시간</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {lowScoreResults.map((r) => (
                    <tr key={`${r.student_id}-${r.created_at}`}>
                      <td className="px-4 py-3 text-sm text-slate-900">{r.student_id}</td>
                      <td className="px-4 py-3 text-sm text-slate-900">{nameMap[r.student_id] ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-900">{r.total_score}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDateTimeKorea(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              위 학생들은 집중 상담 및 <strong>[Boost]</strong> 프로그램 참여 권고 대상입니다.
            </p>
            <button
              type="button"
              onClick={() => setShowLowScore(false)}
              className="mt-4 w-full rounded-lg bg-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { FileDown, LogOut, Search, Upload, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateTimeKorea } from "@/lib/date";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import { normalizeHeader, parseCsvRows } from "@/lib/csv";
import AdminLayout from "@/components/AdminLayout";

type Student = {
  student_id: string;
  name: string | null;
  password: string | null;
  role: string | null;
  student_type: string | null;
  department_id: number | null;
  grade_year: number | null;
  admission_year: number | null;
  phone: string | null;
  email: string | null;
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

type CsvStudentRow = {
  student_id: string; password: string; name: string; role: string;
  department_id: string; grade_year: string; admission_year: string; phone: string; email: string;
};

type CsvParseResult = {
  rows: CsvStudentRow[];
  /** 열을 알아보지 못했을 때의 안내. 있으면 업로드를 중단한다. */
  error?: string;
  /** 건너뛴 행 (행번호와 이유) */
  skipped: string[];
};

/**
 * CSV 텍스트에서 학생 정보 추출.
 * 헤더: student_id, password, name, role, department_id, grade_year, admission_year, phone, email
 * (학번/비밀번호/이름 … 같은 한글 헤더도 lib/csv 의 별칭표가 받아준다)
 *
 * 예전에는 헤더를 못 알아보면 "0번째가 학번, 1번째가 비밀번호, 2번째가 이름"으로
 * 자리만 보고 넘어갔다. 그래서 헤더가 `학번,이름,비밀번호` 순이면 이름 칸에
 * 비밀번호가, 비밀번호 칸에 이름이 조용히 들어갔다. 자리 추측을 없애고,
 * 못 알아보면 무엇이 없는지 알려주고 멈춘다.
 */
function parseCsvToStudents(csvText: string): CsvParseResult {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return { rows: [], skipped: [], error: "헤더 줄과 데이터가 모두 필요합니다." };

  const header = rows[0].map(normalizeHeader);
  const col = (key: string) => header.indexOf(key);

  const sidx = col("student_id");
  const pidx = col("password");
  const missing: string[] = [];
  if (sidx < 0) missing.push("student_id(학번)");
  if (pidx < 0) missing.push("password(비밀번호)");
  if (missing.length > 0) {
    return {
      rows: [], skipped: [],
      error: `필수 열을 찾지 못했습니다: ${missing.join(", ")}\n\n`
        + `읽어들인 헤더: ${header.join(", ")}\n\n`
        + `첫 줄에 헤더가 있어야 합니다. 예) student_id,password,name,role`,
    };
  }

  const nidx = col("name");
  const ridx = col("role");
  const didx = col("department_id");
  const gidx = col("grade_year");
  const aidx = col("admission_year");
  const phidx = col("phone");
  const eidx = col("email");

  const out: CsvStudentRow[] = [];
  const skipped: string[] = [];
  const at = (c: string[], i: number) => (i >= 0 ? (c[i] ?? "").trim() : "");

  rows.slice(1).forEach((c, i) => {
    const lineNo = i + 2; // 헤더가 1행
    const student_id = at(c, sidx);
    const password = at(c, pidx);
    // 조용히 버리지 않고 무엇을 건너뛰었는지 남긴다
    if (!student_id) { skipped.push(`${lineNo}행: 학번 없음`); return; }
    if (!password) { skipped.push(`${lineNo}행: ${student_id} — 비밀번호 없음`); return; }
    out.push({
      student_id,
      password,
      name: at(c, nidx),
      role: at(c, ridx) || "student",
      department_id: at(c, didx),
      grade_year: at(c, gidx),
      admission_year: at(c, aidx),
      phone: at(c, phidx),
      email: at(c, eidx),
    });
  });

  return { rows: out, skipped };
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
  const [editForm, setEditForm] = useState({ name: "", password: "", role: "student", student_type: "domestic", department_id: "", grade_year: "", admission_year: "", phone: "", email: "" });
  const [newStudent, setNewStudent] = useState({
    student_id: "",
    name: "",
    password: "",
    role: "student",
    department_id: "" as string,
    grade_year: "" as string,
    admission_year: "" as string,
    phone: "",
    email: "",
  });
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
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
  const [filterDiagnosis, setFilterDiagnosis] = useState<"all" | "core" | "learning" | "calling" | "none">("all");
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
      if (!["admin", "ctl", "career_center", "counseling_center", "department_head", "professor"].includes(userRole)) {
        router.replace("/");
        return;
      }
      setAuthorized(true);
      await loadStudents();
      await loadDiagnosis();
      const { data: depts } = await supabase.from("departments").select("id, name").order("id");
      setDepartments(depts ?? []);
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
          role: newStudent.role,
          department_id: newStudent.department_id ? Number(newStudent.department_id) : null,
          grade_year: newStudent.grade_year ? Number(newStudent.grade_year) : null,
          admission_year: newStudent.admission_year ? Number(newStudent.admission_year) : null,
          phone: newStudent.phone.trim() || null,
          email: newStudent.email.trim() || null,
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
      setNewStudent({ student_id: "", name: "", password: "", role: "student", department_id: "", grade_year: "", admission_year: "", phone: "", email: "" });
      loadStudents();
    } finally {
      setSaving(false);
    }
  };

  const handleEditStudent = (s: Student) => {
    setEditingStudent(s);
    setEditForm({
      name: s.name ?? "",
      password: "",
      role: s.role ?? "student",
      student_type: s.student_type ?? "domestic",
      department_id: s.department_id ? String(s.department_id) : "",
      grade_year: s.grade_year ? String(s.grade_year) : "",
      admission_year: s.admission_year ? String(s.admission_year) : "",
      phone: s.phone ?? "",
      email: s.email ?? "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      role: editForm.role,
      student_type: editForm.student_type,
      department_id: editForm.department_id ? Number(editForm.department_id) : null,
      grade_year: editForm.grade_year ? Number(editForm.grade_year) : null,
      admission_year: editForm.admission_year ? Number(editForm.admission_year) : null,
      phone: editForm.phone.trim() || null,
      email: editForm.email.trim() || null,
    };
    const trimmedName = editForm.name.trim();
    if (trimmedName) payload.name = trimmedName;
    if (editForm.password.trim()) payload.password = editForm.password.trim();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      alert("세션이 만료되었습니다. 다시 로그인해 주세요.");
      setSaving(false);
      return;
    }
    const res = await fetch("/api/admin/students", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        student_id: editingStudent.student_id,
        ...payload,
      }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "수정 실패");
      return;
    }
    setEditingStudent(null);
    loadStudents();
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm("해당 학생을 삭제할까요?")) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      alert("세션이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }
    const res = await fetch(`/api/admin/students?student_id=${encodeURIComponent(studentId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "삭제 실패");
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
    const parsed = parseCsvToStudents(text);
    if (parsed.error) {
      alert(parsed.error);
      e.target.value = "";
      return;
    }
    const rows = parsed.rows;
    if (rows.length === 0) {
      alert(
        "등록할 학생이 없습니다.\n\n"
        + (parsed.skipped.length > 0 ? `건너뛴 행:\n${parsed.skipped.join("\n")}` : "데이터 줄이 없습니다."),
      );
      e.target.value = "";
      return;
    }
    // 건너뛴 행이 있으면 진행 전에 알린다. 예전에는 말없이 사라졌다.
    if (parsed.skipped.length > 0) {
      const ok = confirm(
        `${parsed.skipped.length}개 행을 건너뜁니다:\n${parsed.skipped.slice(0, 10).join("\n")}`
        + (parsed.skipped.length > 10 ? `\n… 외 ${parsed.skipped.length - 10}건` : "")
        + `\n\n나머지 ${rows.length}명을 등록할까요?`,
      );
      if (!ok) { e.target.value = ""; return; }
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
            role: row.role || "student",
            department_id: row.department_id ? Number(row.department_id) || null : null,
            grade_year: row.grade_year ? Number(row.grade_year) || null : null,
            admission_year: row.admission_year ? Number(row.admission_year) || null : null,
            phone: row.phone || null,
            email: row.email || null,
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

  // 학생별 진단 완료 유형 맵
  const studentDiagnosisMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    [...resultsCore, ...resultsLearning, ...resultsCalling].forEach((r) => {
      if (!map[r.student_id]) map[r.student_id] = new Set();
      map[r.student_id].add(r.diagnosis_type);
    });
    return map;
  }, [resultsCore, resultsLearning, resultsCalling]);

  const filteredStudents = useMemo(() => {
    let list = students;
    const q = searchStudent.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.student_id.toLowerCase().includes(q) ||
          (s.name ?? "").toLowerCase().includes(q)
      );
    }
    if (filterDiagnosis === "none") {
      list = list.filter((s) => !studentDiagnosisMap[s.student_id] || studentDiagnosisMap[s.student_id].size === 0);
    } else if (filterDiagnosis !== "all") {
      list = list.filter((s) => studentDiagnosisMap[s.student_id]?.has(filterDiagnosis));
    }
    return list;
  }, [students, searchStudent, filterDiagnosis, studentDiagnosisMap]);

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
      <div className="flex min-h-screen items-center justify-center bg-ys-paper">
        <p className="text-ys-ink-soft">확인 중...</p>
      </div>
    );
  }

  if (!authorized) return null;

  const currentResults = getResultsByTab();

  return (
    <AdminLayout>
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
          <h1 className="mb-4 text-2xl font-bold text-ys-ink">진단 결과 보고서</h1>
          <p className="mb-4 text-lg text-ys-ink">{printData.title}</p>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="divide-x divide-gray-200 bg-ys-paper">
                <th className="px-4 py-2 text-left text-sm font-semibold text-ys-ink">학번</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-ys-ink">이름</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-ys-ink">총점</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-ys-ink">진단시간</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {printData.rows.map((r, i) => (
                <tr key={i} className="divide-x divide-gray-200">
                  <td className="px-4 py-2 text-sm text-ys-ink">{r.student_id}</td>
                  <td className="px-4 py-2 text-sm text-ys-ink">{r.name}</td>
                  <td className="px-4 py-2 text-sm text-ys-ink">{r.total_score}</td>
                  <td className="px-4 py-2 text-sm text-ys-ink">{r.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {printIndividual && (
        <div className="print-individual hidden font-sans">
          <h1 className="mb-2 text-xl font-bold text-ys-ink">개인 진단 결과 보고서</h1>
          <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-ys-ink">
            <p><strong>학생 성명:</strong> {printIndividual.name}</p>
            <p><strong>학번:</strong> {printIndividual.student_id}</p>
            <p><strong>진단명:</strong> {printIndividual.diagnosisName}</p>
            <p><strong>총점:</strong> {printIndividual.total_score}점</p>
          </div>
          <table className="min-w-full border-collapse border border-slate-200">
            <thead>
              <tr className="bg-ys-paper">
                <th className="border border-slate-200 px-4 py-2 text-left text-sm font-semibold text-ys-ink">역량명</th>
                <th className="border border-slate-200 px-4 py-2 text-right text-sm font-semibold text-ys-ink">점수</th>
              </tr>
            </thead>
            <tbody>
              {printIndividual.scoreRows.map((row, i) => (
                <tr key={i}>
                  <td className="border border-slate-200 px-4 py-2 text-sm text-ys-ink">{row.label}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right text-sm text-ys-ink">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* 학생 관리 */}
        <section className="mb-10 no-print">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-ys-ink">학생 관리</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ys-ink-soft/60" />
                <input
                  type="text"
                  placeholder="학번 또는 이름 검색..."
                  value={searchStudent}
                  onChange={(e) => setSearchStudent(e.target.value)}
                  className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <select
                value={filterDiagnosis}
                onChange={(e) => setFilterDiagnosis(e.target.value as typeof filterDiagnosis)}
                className="rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm"
              >
                <option value="all">전체 학생</option>
                <option value="core">핵심역량 완료</option>
                <option value="learning">학습역량 완료</option>
                <option value="calling">소명진단 완료</option>
                <option value="none">미진단 학생</option>
              </select>
              <button
                type="button"
                onClick={() => setShowAddStudent(true)}
                className="no-print flex items-center gap-2 rounded-lg bg-ys-blue px-3 py-2 text-sm font-medium text-white hover:bg-ys-blue/90"
              >
                <UserPlus className="h-4 w-4" />
                학생 추가
              </button>
              <button
                type="button"
                onClick={() => setShowCsvUpload(true)}
                disabled={isBulkProcessing}
                className="no-print flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                CSV 업로드
              </button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-ys-paper">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">학번</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">역할</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">연락처</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">이메일</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">진단현황</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredStudents.map((s) => (
                  <tr key={s.student_id} className="hover:bg-ys-paper">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ys-ink">{s.student_id}</td>
                    <td className="px-4 py-3 text-sm text-ys-ink-soft">{s.name ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-ys-ink-soft">{s.role ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-ys-ink-soft">{s.phone ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-ys-ink-soft">{s.email ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {studentDiagnosisMap[s.student_id]?.has("core") && <span className="rounded-full bg-ys-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-ys-blue">핵심</span>}
                        {studentDiagnosisMap[s.student_id]?.has("learning") && <span className="rounded-full bg-ys-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-ys-blue">학습</span>}
                        {studentDiagnosisMap[s.student_id]?.has("calling") && <span className="rounded-full bg-ys-gold/10 px-1.5 py-0.5 text-[10px] font-medium text-[#8A6212]">소명</span>}
                        {!studentDiagnosisMap[s.student_id] && <span className="text-[10px] text-ys-ink-soft/70">미진단</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleEditStudent(s)}
                        className="no-print mr-3 text-sm font-medium text-ys-blue hover:text-ys-blue"
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
          <h2 className="no-print mb-4 text-base font-semibold text-ys-ink">진단 결과 조회</h2>
          <div className="no-print mb-4 flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-1">
              {(["core", "learning", "calling"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${
                    activeTab === tab ? "bg-ys-blue text-white" : "text-ys-ink-soft hover:bg-slate-100"
                  }`}
                >
                  {DIAGNOSIS_LABELS[tab]}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ys-ink-soft/60" />
              <input
                type="text"
                placeholder="학번 또는 이름 검색..."
                value={searchResult}
                onChange={(e) => setSearchResult(e.target.value)}
                className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={downloadPDF}
              className="flex items-center gap-2 rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-ys-blue/90"
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
              <thead className="bg-ys-paper">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">학번</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">총점</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">진단시간</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-ys-ink-soft">
                      {searchResult.trim() ? "검색 결과가 없습니다." : "진단 결과가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((r) => (
                    <tr key={r.id ?? r.student_id + (r.created_at ?? "")} className="hover:bg-ys-paper">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-ys-ink">{r.student_id}</td>
                      <td className="px-4 py-3 text-sm text-ys-ink-soft">{nameMap[r.student_id] ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-ys-ink">{r.total_score}</td>
                      <td className="px-4 py-3 text-sm text-ys-ink-soft">
                        {formatDateTimeKorea(r.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailRow(r)}
                          className="no-print text-sm font-medium text-ys-blue hover:text-ys-blue"
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

      {/* 학생 수정 모달 */}
      {editingStudent && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-ys-ink">학생/사용자 수정</h3>
            <p className="mt-1 text-sm text-ys-ink-soft">학번: {editingStudent.student_id}</p>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-ys-ink">이름</label>
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">비밀번호 (변경 시에만)</label>
                  <input type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="비워두면 기존 유지" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">역할</label>
                  <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="student">학생</option>
                    <option value="admin">관리자</option>
                    <option value="professor">교수</option>
                    <option value="ctl">교수학습지원센터</option>
                    <option value="career_center">취창업진로지원센터</option>
                    <option value="counseling_center">학생생활상담센터</option>
                    <option value="staff">직원</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">학생 유형</label>
                  <select value={editForm.student_type} onChange={(e) => setEditForm((f) => ({ ...f, student_type: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="domestic">내국인</option>
                    <option value="international">유학생</option>
                  </select>
                  <p className="mt-1 text-xs text-ys-ink-soft/70">유학생은 마일리지가 지급되지 않고 대시보드에 이수 실적이 표시됩니다.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">학과</label>
                  <select value={editForm.department_id} onChange={(e) => setEditForm((f) => ({ ...f, department_id: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">선택 안함</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">학년</label>
                  <select value={editForm.grade_year} onChange={(e) => setEditForm((f) => ({ ...f, grade_year: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">선택 안함</option>
                    <option value="1">1학년</option>
                    <option value="2">2학년</option>
                    <option value="3">3학년</option>
                    <option value="4">4학년</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">입학년도</label>
                  <input type="number" value={editForm.admission_year} onChange={(e) => setEditForm((f) => ({ ...f, admission_year: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">연락처</label>
                  <input type="text" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">이메일</label>
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-ys-blue py-2 text-sm font-medium text-white hover:bg-ys-blue/90 disabled:opacity-50"
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
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-ys-ink">학생/사용자 추가</h3>
            <form onSubmit={handleAddStudent} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-ys-ink">학번 (ID) *</label>
                  <input type="text" value={newStudent.student_id} onChange={(e) => setNewStudent((s) => ({ ...s, student_id: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">이름</label>
                  <input type="text" value={newStudent.name} onChange={(e) => setNewStudent((s) => ({ ...s, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">비밀번호 *</label>
                  <input type="password" value={newStudent.password} onChange={(e) => setNewStudent((s) => ({ ...s, password: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">역할</label>
                  <select value={newStudent.role} onChange={(e) => setNewStudent((s) => ({ ...s, role: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="student">학생</option>
                    <option value="admin">관리자</option>
                    <option value="professor">교수</option>
                    <option value="ctl">교수학습지원센터</option>
                    <option value="career_center">취창업진로지원센터</option>
                    <option value="counseling_center">학생생활상담센터</option>
                    <option value="staff">직원</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">학과</label>
                  <select value={newStudent.department_id} onChange={(e) => setNewStudent((s) => ({ ...s, department_id: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">선택 안함</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">학년</label>
                  <select value={newStudent.grade_year} onChange={(e) => setNewStudent((s) => ({ ...s, grade_year: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">선택 안함</option>
                    <option value="1">1학년</option>
                    <option value="2">2학년</option>
                    <option value="3">3학년</option>
                    <option value="4">4학년</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">입학년도</label>
                  <input type="number" placeholder="예: 2026" value={newStudent.admission_year} onChange={(e) => setNewStudent((s) => ({ ...s, admission_year: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">연락처</label>
                  <input type="text" placeholder="010-0000-0000" value={newStudent.phone} onChange={(e) => setNewStudent((s) => ({ ...s, phone: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-ys-ink">이메일</label>
                  <input type="email" placeholder="example@email.com" value={newStudent.email} onChange={(e) => setNewStudent((s) => ({ ...s, email: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAddStudent(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">취소</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-ys-blue py-2 text-sm font-medium text-white hover:bg-ys-blue/90 disabled:opacity-50">{saving ? "등록 중..." : "등록"}</button>
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
                <h3 className="text-lg font-semibold text-ys-ink">CSV 일괄 등록</h3>
                <p className="mt-1 text-sm text-ys-ink-soft">
                  CSV 헤더: student_id, password, name, role, department_id, grade_year, admission_year, phone, email (필수: student_id, password)
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => csvInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-ys-blue/90"
                  >
                    <Upload className="h-4 w-4" />
                    파일 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCsvUpload(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper"
                  >
                    취소
                  </button>
                </div>
              </>
            ) : bulkProgress.done ? (
              <>
                <h3 className="text-lg font-semibold text-ys-ink">일괄 등록 결과</h3>
                <p className="mt-3 text-sm text-ys-ink">
                  성공: <strong className="text-[#8A6212]">{bulkProgress.success}명</strong>, 실패:{" "}
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
                  className="mt-4 w-full rounded-lg bg-slate-200 py-2 text-sm font-medium text-ys-ink hover:bg-slate-300"
                >
                  닫기
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-ys-ink">일괄 등록 중</h3>
                <p className="mt-2 text-sm text-ys-ink-soft">
                  {bulkProgress.total}명 중 {bulkProgress.current}명 등록 중...
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-ys-blue transition-all duration-300"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-ys-ink-soft">
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
            <h3 className="text-lg font-semibold text-ys-ink">세부 역량 점수</h3>
            <p className="mt-1 text-sm text-ys-ink-soft">
              학번: {detailRow.student_id} · 총점: {detailRow.total_score}
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="detail-score-table min-w-full border-collapse font-sans text-ys-ink">
                <thead>
                  <tr className="border-b border-slate-200 bg-ys-paper">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-ys-ink">역량명</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-ys-ink">점수</th>
                  </tr>
                </thead>
                <tbody>
                  {getScoreRows(detailRow.diagnosis_type, detailRow.scores).length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-4 text-center text-sm text-ys-ink-soft">
                        저장된 세부 점수 없음
                      </td>
                    </tr>
                  ) : (
                    getScoreRows(detailRow.diagnosis_type, detailRow.scores).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-ys-paper/50">
                        <td className="px-4 py-3 text-sm text-ys-ink">{row.label}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-ys-ink">{row.score}</td>
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
                className="no-print flex-1 rounded-lg bg-ys-blue py-2.5 text-sm font-medium text-white hover:bg-ys-blue/90"
              >
                이 결과만 프린트
              </button>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="no-print flex-1 rounded-lg bg-slate-200 py-2.5 text-sm font-medium text-ys-ink hover:bg-slate-300"
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
            <h3 className="text-lg font-semibold text-ys-ink">최저점 학생 조회</h3>
            <p className="mt-1 text-sm text-ys-ink-soft">
              {DIAGNOSIS_LABELS[activeTab]} · 하위 20% ({lowScoreResults.length}명)
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-ys-paper">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">학번</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">이름</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">총점</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">진단시간</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {lowScoreResults.map((r, i) => (
                    <tr key={`${r.student_id}-${r.created_at}-${i}`}>
                      <td className="px-4 py-3 text-sm text-ys-ink">{r.student_id}</td>
                      <td className="px-4 py-3 text-sm text-ys-ink">{nameMap[r.student_id] ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-ys-ink">{r.total_score}</td>
                      <td className="px-4 py-3 text-sm text-ys-ink-soft">{formatDateTimeKorea(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 rounded-lg bg-ys-gold/10 p-3 text-sm text-[#8A6212]">
              위 학생들은 집중 상담 및 <strong>[Boost]</strong> 프로그램 참여 권고 대상입니다.
            </p>
            <button
              type="button"
              onClick={() => setShowLowScore(false)}
              className="mt-4 w-full rounded-lg bg-slate-200 py-2 text-sm font-medium text-ys-ink hover:bg-slate-300"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

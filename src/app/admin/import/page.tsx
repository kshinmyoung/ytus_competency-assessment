"use client";

import { CheckCircle, Download, Upload, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { awardExtracurricularMileage } from "@/lib/extracurricular";
import { parseCsv } from "@/lib/csv";
import AdminLayout from "@/components/AdminLayout";

type TabKey = "students" | "courses" | "extracurricular" | "enrollment" | "extra_assign" | "mentoring" | "graduate";

const TABS: { key: TabKey; label: string; description: string; headers: string; example: string }[] = [
  {
    key: "students",
    label: "학생/사용자",
    description: "학생, 교수, 센터 계정을 일괄 등록합니다.",
    headers: "student_id, password, name, role, department_id, grade_year, admission_year, phone, email",
    example: `student_id,password,name,role,department_id,grade_year,admission_year,phone,email
22501001,pass123,홍길동,student,1,2,2025,010-1234-5678,hong@email.com
22501002,pass123,김철수,student,3,1,2026,010-5678-1234,
PROF001,prof123,이교수,professor,1,,,,lee@ytus.ac.kr
CTL001,ctl123,박센터,ctl,,,,,`,
  },
  {
    key: "courses",
    label: "교과목",
    description: "교과목을 일괄 등록합니다.",
    headers: "name, professor, department_id, credit, semester, year, description",
    example: `name,professor,department_id,credit,semester,year,description
기독교윤리학,김교수,1,3,1학기,2026,기독교 윤리의 기초
상담심리학개론,박교수,3,3,1학기,2026,상담심리학 입문`,
  },
  {
    key: "extracurricular",
    label: "비교과",
    description: "비교과 프로그램을 일괄 등록합니다.",
    headers: "name, category, organizer, description, start_date, end_date, max_participants, registration_open",
    example: `name,category,organizer,description,start_date,end_date,max_participants,registration_open
영성캠프,캠프,학생처,1박2일 영성캠프,2026-05-01,2026-05-02,50,true
리더십특강,특강,교수학습지원센터,리더십 역량 강화,2026-05-10,2026-05-10,100,true`,
  },
  {
    key: "enrollment",
    label: "수강 배정",
    description: "학생을 교과목에 일괄 배정합니다. course_name으로도 매칭 가능.",
    headers: "student_id, course_id 또는 course_name, semester, year, status",
    example: `student_id,course_name,semester,year,status
22501001,기독교윤리학,1학기,2026,수강중
22501002,상담심리학개론,1학기,2026,수강중`,
  },
  {
    key: "extra_assign",
    label: "비교과 배정",
    description: "학생을 비교과에 일괄 배정합니다. extracurricular_name으로도 매칭 가능.",
    headers: "student_id, extracurricular_id 또는 extracurricular_name, status",
    example: `student_id,extracurricular_name,status
22501001,영성캠프,신청
22501002,리더십특강,완료`,
  },
  {
    key: "mentoring",
    label: "멘토링 배정",
    description: "교수에게 학생을 일괄 배정합니다. 멘토가 미등록이면 자동 생성됩니다.",
    headers: "mentor_id, student_id, mentor_name (선택)",
    example: `mentor_id,student_id,mentor_name
2021664,22501007,김교수
2021664,22401010,
305,22501031,박교수`,
  },
  {
    key: "graduate",
    label: "졸업생 삭제",
    description: "졸업생 학번 목록을 업로드하면 해당 학생의 계정과 관련 데이터를 일괄 삭제합니다.",
    headers: "student_id",
    example: `student_id
22201001
22201002
22201003`,
  },
];

type Result = { success: number; failed: number; errors: string[] };

export default function AdminImportPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("students");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 매칭용 데이터
  const [courses, setCourses] = useState<{ id: number; name: string }[]>([]);
  const [extras, setExtras] = useState<{ id: number; name: string }[]>([]);
  const [depts, setDepts] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [cRes, eRes, dRes] = await Promise.all([
        supabase.from("courses").select("id, name"),
        supabase.from("extracurricular").select("id, name"),
        supabase.from("departments").select("id, name"),
      ]);
      setCourses(cRes.data ?? []);
      setExtras(eRes.data ?? []);
      setDepts(dRes.data ?? []);
    })();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      alert("유효한 데이터가 없습니다. CSV 헤더와 데이터를 확인해주세요.");
      e.target.value = "";
      return;
    }

    setProcessing(true);
    setResult(null);

    // 졸업생 삭제는 별도 처리
    if (activeTab === "graduate") {
      const studentIds = rows.map((r) => (r.student_id ?? "").trim()).filter(Boolean);
      if (studentIds.length === 0) { alert("삭제할 학번이 없습니다."); setProcessing(false); e.target.value = ""; return; }
      if (!confirm(`${studentIds.length}명의 졸업생 계정과 모든 관련 데이터를 삭제합니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`)) {
        setProcessing(false); e.target.value = ""; return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { alert("세션 만료"); setProcessing(false); e.target.value = ""; return; }
      const res = await fetch("/api/admin/delete-users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ student_ids: studentIds }),
      });
      const data = await res.json();
      setResult({
        success: data.success ?? 0,
        failed: data.failed ?? 0,
        errors: (data.errors ?? []).map((e: any) => `${e.student_id}: ${e.error ?? "실패"}`),
      });
      setProcessing(false);
      e.target.value = "";
      return;
    }

    let success = 0;
    const errors: string[] = [];

    const deptNameMap: Record<string, number> = {};
    depts.forEach((d) => { deptNameMap[d.name] = d.id; });
    const courseNameMap: Record<string, number> = {};
    courses.forEach((c) => { courseNameMap[c.name.toLowerCase()] = c.id; });
    const extraNameMap: Record<string, number> = {};
    extras.forEach((ex) => { extraNameMap[ex.name.toLowerCase()] = ex.id; });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let ok = false;

        if (activeTab === "students") {
          if (!row.student_id || !row.password) { errors.push(`행${i + 2}: student_id/password 필수`); continue; }
          const deptId = row.department_id ? (Number(row.department_id) || deptNameMap[row.department_id] || null) : null;
          const res = await fetch("/api/admin/create-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              student_id: row.student_id,
              password: row.password,
              name: row.name || null,
              role: row.role || "student",
              department_id: deptId,
              grade_year: row.grade_year ? Number(row.grade_year) : null,
              admission_year: row.admission_year ? Number(row.admission_year) : null,
              phone: row.phone || null,
              email: row.email || null,
            }),
          });
          ok = res.ok;
          if (!ok) { const d = await res.json().catch(() => ({})); errors.push(`${row.student_id}: ${d.error ?? "실패"}`); }
        }

        else if (activeTab === "courses") {
          if (!row.name) { errors.push(`행${i + 2}: name 필수`); continue; }
          const deptId = row.department_id ? (Number(row.department_id) || deptNameMap[row.department_id] || null) : null;
          const payload = {
            name: row.name,
            professor: row.professor || null,
            department_id: deptId,
            credit: row.credit ? Number(row.credit) : 3,
            semester: row.semester || null,
            year: Number(row.year) || null,
            description: row.description || null,
            is_active: true,
          };
          // 같은 과목+년도+학기+교수 존재하면 덮어쓰기
          let query = supabase.from("courses").select("id").eq("name", row.name);
          if (row.year) query = query.eq("year", Number(row.year));
          if (row.semester) query = query.eq("semester", row.semester);
          if (row.professor) query = query.eq("professor", row.professor);
          const { data: existing } = await query.maybeSingle();
          let error;
          if (existing) {
            ({ error } = await supabase.from("courses").update(payload).eq("id", existing.id));
          } else {
            ({ error } = await supabase.from("courses").insert(payload));
          }
          ok = !error;
          if (error) errors.push(`${row.name}: ${error.message}`);
        }

        else if (activeTab === "extracurricular") {
          if (!row.name) { errors.push(`행${i + 2}: name 필수`); continue; }
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
          ok = !error;
          if (error) errors.push(`${row.name}: ${error.message}`);
        }

        else if (activeTab === "enrollment") {
          if (!row.student_id) { errors.push(`행${i + 2}: student_id 필수`); continue; }
          let courseId = Number(row.course_id) || 0;
          if (!courseId && row.course_name) courseId = courseNameMap[row.course_name.toLowerCase()] ?? 0;
          if (!courseId) { errors.push(`${row.student_id}: 과목 못 찾음`); continue; }
          const payload = {
            student_id: row.student_id,
            course_id: courseId,
            semester: row.semester || null,
            year: Number(row.year) || new Date().getFullYear(),
            status: row.status || "수강중",
          };
          // 같은 학생+과목 존재하면 덮어쓰기
          const { data: existingEnroll } = await supabase.from("student_courses").select("id").eq("student_id", row.student_id).eq("course_id", courseId).maybeSingle();
          let error;
          if (existingEnroll) {
            ({ error } = await supabase.from("student_courses").update(payload).eq("id", existingEnroll.id));
          } else {
            ({ error } = await supabase.from("student_courses").insert(payload));
          }
          ok = !error;
          if (error) errors.push(`${row.student_id}: ${error.message}`);
        }

        else if (activeTab === "extra_assign") {
          if (!row.student_id) { errors.push(`행${i + 2}: student_id 필수`); continue; }
          let extraId = Number(row.extracurricular_id) || 0;
          if (!extraId && row.extracurricular_name) extraId = extraNameMap[row.extracurricular_name.toLowerCase()] ?? 0;
          if (!extraId) { errors.push(`${row.student_id}: 프로그램 못 찾음`); continue; }
          const status = row.status || "신청";
          const { error } = await supabase.from("student_extracurricular").upsert({
            student_id: row.student_id,
            extracurricular_id: extraId,
            status,
            completed_at: status === "완료" ? new Date().toISOString() : null,
          }, { onConflict: "student_id,extracurricular_id" });
          ok = !error;
          if (error) errors.push(`${row.student_id}: ${error.message}`);
          // 비교과 관리 화면의 CSV 와 같은 규칙으로 지급한다
          else await awardExtracurricularMileage(row.student_id, extraId, status);
        }

        else if (activeTab === "mentoring") {
          if (!row.mentor_id || !row.student_id) { errors.push(`행${i + 2}: mentor_id/student_id 필수`); continue; }
          // 멘토가 students 테이블에 없으면 자동 생성
          const { data: mentorExists } = await supabase.from("students").select("student_id").eq("student_id", row.mentor_id).maybeSingle();
          if (!mentorExists) {
            const mentorRes = await fetch("/api/admin/create-user", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                student_id: row.mentor_id,
                password: row.mentor_id,
                name: row.mentor_name || null,
                role: "professor",
              }),
            });
            if (!mentorRes.ok) {
              const d = await mentorRes.json().catch(() => ({}));
              errors.push(`멘토 ${row.mentor_id} 자동생성 실패: ${d.error ?? "실패"}`);
              continue;
            }
          }
          // 학생이 students 테이블에 없으면 스킵
          const { data: studentExists } = await supabase.from("students").select("student_id").eq("student_id", row.student_id).maybeSingle();
          if (!studentExists) {
            errors.push(`${row.mentor_id}→${row.student_id}: 학생 ${row.student_id}가 등록되어 있지 않음`);
            continue;
          }
          const { error } = await supabase.from("mentoring_groups").upsert(
            { mentor_id: row.mentor_id, student_id: row.student_id },
            { onConflict: "mentor_id,student_id" }
          );
          ok = !error;
          if (error) errors.push(`${row.mentor_id}→${row.student_id}: ${error.message}`);
        }

        else if (activeTab === "graduate") {
          // 졸업생은 별도 처리 (아래 handleGraduateUpload에서 일괄 처리)
        }

        if (ok) success++;
      } catch (err: any) {
        errors.push(`행${i + 2}: ${err.message ?? "예외"}`);
      }
    }

    setResult({ success, failed: errors.length, errors });
    setProcessing(false);
    e.target.value = "";
  };

  const downloadTemplate = () => {
    const tab = TABS.find((t) => t.key === activeTab)!;
    const blob = new Blob(["\uFEFF" + tab.example], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template_${activeTab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentTab = TABS.find((t) => t.key === activeTab)!;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ys-ink">통합 일괄 등록</h2>
        <p className="mt-1 text-sm text-ys-ink-soft">학생, 교과목, 비교과, 수강배정, 멘토링을 CSV로 한곳에서 등록합니다.</p>
      </div>

      {/* 탭 */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setActiveTab(tab.key); setResult(null); }}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? (tab.key === "graduate" ? "bg-red-600 text-white" : "bg-ys-blue text-white")
                : (tab.key === "graduate" ? "text-red-600 hover:bg-red-50" : "text-ys-ink-soft hover:bg-slate-100")
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 현재 탭 내용 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-ys-ink">{currentTab.label} 일괄 등록</h3>
        <p className="mt-1 text-sm text-ys-ink-soft">{currentTab.description}</p>

        {/* 헤더 정보 */}
        <div className="mt-4 rounded-lg bg-ys-paper p-4">
          <p className="text-xs font-medium text-ys-ink-soft">CSV 헤더 (필드)</p>
          <p className="mt-1 font-mono text-sm text-ys-ink">{currentTab.headers}</p>
        </div>

        {/* 예시 */}
        <div className="mt-3 rounded-lg bg-slate-900 p-4">
          <p className="mb-2 text-xs font-medium text-ys-ink-soft/70">예시</p>
          <pre className="overflow-x-auto text-xs text-green-400 whitespace-pre">{currentTab.example}</pre>
        </div>

        {/* 버튼 */}
        <div className="mt-5 flex flex-wrap gap-3">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={processing}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 ${
              activeTab === "graduate" ? "bg-red-600 hover:bg-red-700" : "bg-ys-blue hover:bg-ys-blue/90"
            }`}
          >
            <Upload className="h-4 w-4" />
            {processing ? "처리 중..." : activeTab === "graduate" ? "삭제할 CSV 업로드" : "CSV 파일 업로드"}
          </button>
          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-ys-ink hover:bg-ys-paper"
          >
            <Download className="h-4 w-4" /> 템플릿 다운로드
          </button>
        </div>

        {/* 결과 */}
        {result && (
          <div className="mt-5 rounded-lg border border-slate-200 bg-ys-paper p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-ys-gold" />
                <span className="text-sm font-medium text-[#8A6212]">성공: {result.success}건</span>
              </div>
              {result.failed > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <span className="text-sm font-medium text-red-700">실패: {result.failed}건</span>
                </div>
              )}
            </div>
            {result.errors.length > 0 && (
              <div className="mt-3 max-h-40 overflow-auto rounded border border-red-200 bg-red-50 p-3">
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600">{err}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="mt-6 rounded-xl border border-ys-blue/20 bg-ys-blue/10 p-5">
        <h4 className="text-sm font-semibold text-ys-blue">등록 순서 가이드</h4>
        <ol className="mt-2 space-y-1 text-sm text-ys-blue">
          <li>1. <strong>학생/사용자</strong> 등록 (학생, 교수, 센터 계정)</li>
          <li>2. <strong>교과목</strong> 등록</li>
          <li>3. <strong>비교과</strong> 프로그램 등록</li>
          <li>4. <strong>수강 배정</strong> (학생 ↔ 교과목 연결)</li>
          <li>5. <strong>비교과 배정</strong> (학생 ↔ 비교과 연결)</li>
          <li>6. <strong>멘토링 배정</strong> (교수 ↔ 학생 연결)</li>
        </ol>
        <p className="mt-2 text-xs text-ys-blue">department_id: 1=신학과, 2=기독교교육학과, 3=상담심리학과, 4=사회복지학과, 5=국제언어다문화학과</p>
      </div>
    </AdminLayout>
  );
}

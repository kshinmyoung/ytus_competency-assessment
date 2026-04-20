"use client";

import { BookOpen, Filter, Plus, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import Navigation from "@/components/Navigation";

type CoreComp = { id: number; name: string; color_code: string };
type MajorComp = { id: number; name: string; department_id: number };
type Department = { id: number; name: string };
type Course = {
  id: number;
  name: string;
  professor: string | null;
  department_id: number | null;
  credit: number;
  semester: string | null;
  year: number | null;
  description: string | null;
  core_competency_tags: number[];
  major_competency_tags: number[];
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [coreComps, setCoreComps] = useState<CoreComp[]>([]);
  const [majorComps, setMajorComps] = useState<MajorComp[]>([]);
  const [myCourseIds, setMyCourseIds] = useState<Set<number>>(new Set());
  const [studentId, setStudentId] = useState("");
  const [filterDept, setFilterDept] = useState<number | "all">("all");
  const [filterCore, setFilterCore] = useState<number | "all">("all");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (sid) setStudentId(sid.trim());

      const [deptRes, coreRes, majorRes, courseRes] = await Promise.all([
        supabase.from("departments").select("*").order("id"),
        supabase.from("core_competencies").select("*").order("id"),
        supabase.from("major_competencies").select("*").order("id"),
        supabase.from("courses").select("*").eq("is_active", true).order("name"),
      ]);

      setDepartments(deptRes.data ?? []);
      setCoreComps(coreRes.data ?? []);
      setMajorComps(majorRes.data ?? []);
      setCourses(courseRes.data ?? []);

      if (sid) {
        const { data: myC } = await supabase
          .from("student_courses")
          .select("course_id")
          .eq("student_id", sid.trim());
        setMyCourseIds(new Set((myC ?? []).map((c: any) => c.course_id)));
      }
    })();
  }, []);

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (filterDept !== "all" && c.department_id !== filterDept) return false;
      if (filterCore !== "all" && !c.core_competency_tags.includes(filterCore)) return false;
      return true;
    });
  }, [courses, filterDept, filterCore]);

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

  const deptMap = useMemo(() => {
    const m: Record<number, string> = {};
    departments.forEach((d) => (m[d.id] = d.name));
    return m;
  }, [departments]);

  const handleEnroll = async (courseId: number) => {
    if (!studentId) return;
    setEnrolling(true);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const semester = currentMonth <= 6 ? "1학기" : "2학기";

    const { error } = await supabase.from("student_courses").insert({
      student_id: studentId,
      course_id: courseId,
      year: currentYear,
      semester,
      status: "수강중",
    });

    if (!error) {
      setMyCourseIds((prev) => new Set([...prev, courseId]));
    } else {
      alert(error.message);
    }
    setEnrolling(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">교과목</h1>
            <p className="mt-1 text-sm text-slate-600">
              교과목을 탐색하고 수강 등록할 수 있습니다.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={filterDept === "all" ? "all" : filterDept}
              onChange={(e) =>
                setFilterDept(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">전체 학과</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <select
            value={filterCore === "all" ? "all" : filterCore}
            onChange={(e) =>
              setFilterCore(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 역량</option>
            {coreComps.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Course grid */}
        {filteredCourses.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">등록된 교과목이 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCourses.map((course) => (
              <div
                key={course.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">{course.name}</h3>
                  {course.credit && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {course.credit}학점
                    </span>
                  )}
                </div>
                {course.professor && (
                  <p className="text-xs text-slate-500">담당: {course.professor}</p>
                )}
                {course.department_id && (
                  <p className="text-xs text-slate-500">{deptMap[course.department_id]}</p>
                )}
                {course.description && (
                  <p className="mt-2 flex-1 text-xs text-slate-600 line-clamp-2">
                    {course.description}
                  </p>
                )}

                {/* Tags */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {course.core_competency_tags.map((tagId) => {
                    const comp = coreCompMap[tagId];
                    if (!comp) return null;
                    return (
                      <span
                        key={`core-${tagId}`}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: comp.color_code + "15",
                          color: comp.color_code,
                        }}
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {comp.name}
                      </span>
                    );
                  })}
                  {course.major_competency_tags.map((tagId) => {
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

                <div className="mt-4">
                  {myCourseIds.has(course.id) ? (
                    <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
                      수강 등록됨
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleEnroll(course.id)}
                      disabled={enrolling || !studentId}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      수강 등록
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedCourse(course)}
                    className="ml-2 text-xs font-medium text-blue-600 hover:underline"
                  >
                    상세보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail modal */}
        {selectedCourse && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setSelectedCourse(null)}
          >
            <div
              className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-900">{selectedCourse.name}</h3>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                {selectedCourse.professor && <p>담당교수: {selectedCourse.professor}</p>}
                {selectedCourse.department_id && (
                  <p>학과: {deptMap[selectedCourse.department_id]}</p>
                )}
                <p>학점: {selectedCourse.credit}</p>
                {selectedCourse.semester && selectedCourse.year && (
                  <p>개설: {selectedCourse.year}년 {selectedCourse.semester}</p>
                )}
                {selectedCourse.description && (
                  <p className="mt-3 whitespace-pre-wrap">{selectedCourse.description}</p>
                )}
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-slate-500">역량 태그</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCourse.core_competency_tags.map((tagId) => {
                    const comp = coreCompMap[tagId];
                    if (!comp) return null;
                    return (
                      <span
                        key={`core-${tagId}`}
                        className="rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: comp.color_code + "15",
                          color: comp.color_code,
                        }}
                      >
                        {comp.name}
                      </span>
                    );
                  })}
                  {selectedCourse.major_competency_tags.map((tagId) => {
                    const comp = majorCompMap[tagId];
                    if (!comp) return null;
                    return (
                      <span
                        key={`major-${tagId}`}
                        className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600"
                      >
                        {comp.name}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                {!myCourseIds.has(selectedCourse.id) && (
                  <button
                    type="button"
                    onClick={() => {
                      handleEnroll(selectedCourse.id);
                      setSelectedCourse(null);
                    }}
                    disabled={enrolling || !studentId}
                    className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    수강 등록
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCourse(null)}
                  className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

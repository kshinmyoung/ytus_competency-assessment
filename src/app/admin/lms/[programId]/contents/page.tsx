"use client";

import { ArrowLeft, Download, Edit3, Eye, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { canManageLms } from "@/lib/auth/lms-permissions";
import {
  ALLOWED_ATTACHMENT_EXTS, ATTACHMENT_BUCKET, attachmentRejectReason, formatFileSize,
} from "@/lib/lms-attachments";
import { supabase, waitForAccessToken, waitForStudentId } from "@/lib/supabase";

type Content = {
  id: number;
  extracurricular_id: number;
  title: string;
  description: string | null;
  provider: string;
  source_ref: string;
  duration_sec: number;
  language: string;
  content_group: string | null;
  content_order: number;
  is_required: boolean;
};

type Attachment = {
  id: number;
  content_id: number;
  file_name: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
};

/** 파일 선택 창에 뜨는 확장자 목록 */
const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_EXTS.map((e) => `.${e}`).join(",");

const emptyForm = {
  title: "",
  description: "",
  sourceRef: "",
  language: "ko",
  contentGroup: "",
  contentOrder: 0,
  isRequired: true,
};

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export default function AdminLmsContentsPage() {
  const params = useParams();
  const programId = Number(params.programId);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [programName, setProgramName] = useState("");
  const [minProgress, setMinProgress] = useState(90);
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [preview, setPreview] = useState<{ content: Content; iframeUrl: string; allowedOrigins: string[] } | null>(null);
  const [previewError, setPreviewError] = useState("");

  // 첨부 자료 — 콘텐츠 id 로 묶어둔다
  const [attachments, setAttachments] = useState<Record<number, Attachment[]>>({});
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [attachError, setAttachError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<number | null>(null);

  const authHeaders = useCallback(async () => {
    const token = await waitForAccessToken();
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }, []);

  const loadAttachments = useCallback(async () => {
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/lms/attachments?programId=${programId}`, { headers });
    if (!res.ok) return;
    const rows: Attachment[] = await res.json();
    const grouped: Record<number, Attachment[]> = {};
    for (const row of rows) (grouped[row.content_id] ??= []).push(row);
    setAttachments(grouped);
  }, [authHeaders, programId]);

  const loadContents = useCallback(async () => {
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/lms/contents?programId=${programId}`, { headers });
    if (res.ok) setContents(await res.json());
    await loadAttachments();
    setLoading(false);
  }, [authHeaders, loadAttachments, programId]);

  useEffect(() => {
    (async () => {
      const studentId = await waitForStudentId();
      if (!studentId) { setAllowed(false); return; }
      const { data: me } = await supabase
        .from("students").select("role").eq("student_id", studentId).maybeSingle();
      if (!canManageLms(me?.role)) { setAllowed(false); return; }
      setAllowed(true);

      const { data: program } = await supabase
        .from("extracurricular")
        .select("name, completion_rule")
        .eq("id", programId)
        .maybeSingle();
      setProgramName(program?.name ?? "");
      setMinProgress(program?.completion_rule?.min_progress ?? 90);

      await loadContents();
    })();
  }, [programId, loadContents]);

  const handleEdit = (item: Content) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description ?? "",
      sourceRef: item.source_ref,
      language: item.language,
      contentGroup: item.content_group ?? "",
      contentOrder: item.content_order,
      isRequired: item.is_required,
    });
    setError("");
    setNotice("");
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const headers = await authHeaders();
    const res = editingId
      ? await fetch(`/api/admin/lms/contents/${editingId}`, {
          method: "PATCH", headers, body: JSON.stringify(form),
        })
      : await fetch("/api/admin/lms/contents", {
          method: "POST", headers, body: JSON.stringify({ ...form, programId }),
        });

    const body = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "저장에 실패했습니다.");
      return;
    }

    // Cloudflare 엣지 캐시 전파로 보안 설정 반영에 최대 1분이 걸린다.
    // 여기서 "적용 완료"로 단정하지 않는다.
    if (body.securityError) {
      setNotice(`저장됐지만 보안 설정 적용에 실패했습니다: ${body.securityError}`);
    } else if (body.securityApplied !== null && body.securityApplied !== undefined) {
      setNotice("저장됐습니다. 영상 보안 설정 적용 중 (최대 1분 소요)");
    } else {
      setNotice("저장됐습니다.");
    }

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    await loadContents();
  };

  const handleDelete = async (item: Content) => {
    if (!confirm(`'${item.title}' 콘텐츠를 삭제하시겠습니까?`)) return;
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/lms/contents/${item.id}`, { method: "DELETE", headers });
    const body = await res.json();
    if (!res.ok) { alert(body.error ?? "삭제에 실패했습니다."); return; }
    await loadContents();
  };

  const pickFiles = (contentId: number) => {
    setAttachError("");
    uploadTargetRef.current = contentId;
    fileInputRef.current?.click();
  };

  /**
   * 파일은 Route Handler 를 거치지 않는다. Vercel 요청 본문 한도(4.5MB)에 걸리기 때문에
   * 서버에서 받은 서명 URL 로 Storage 에 직접 올리고, 끝난 뒤 등록만 서버에 맡긴다.
   * 여러 개를 골랐을 때 하나가 실패해도 나머지는 계속 올린다.
   */
  const handleFilesChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const contentId = uploadTargetRef.current;
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";   // 같은 파일을 다시 골라도 change 가 뜨도록 비운다
    if (!contentId || files.length === 0) return;

    setUploadingFor(contentId);
    setAttachError("");
    const failed: string[] = [];

    for (const file of files) {
      // 올리기 전에 거르면 20MB 를 헛되이 전송하지 않는다. 서버도 같은 기준으로 다시 본다.
      const reject = attachmentRejectReason(file.name, file.size);
      if (reject) { failed.push(`${file.name} — ${reject}`); continue; }

      try {
        const headers = await authHeaders();
        const urlRes = await fetch("/api/admin/lms/attachments/upload-url", {
          method: "POST", headers,
          body: JSON.stringify({ contentId, fileName: file.name, sizeBytes: file.size }),
        });
        const urlBody = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlBody.error ?? "업로드 준비에 실패했습니다.");

        const { error: uploadError } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .uploadToSignedUrl(urlBody.path, urlBody.token, file, { contentType: file.type || undefined });
        if (uploadError) throw new Error(uploadError.message);

        const saveRes = await fetch("/api/admin/lms/attachments", {
          method: "POST", headers,
          body: JSON.stringify({ contentId, path: urlBody.path, fileName: file.name }),
        });
        const saveBody = await saveRes.json();
        if (!saveRes.ok) throw new Error(saveBody.error ?? "등록에 실패했습니다.");
      } catch (err) {
        failed.push(`${file.name} — ${err instanceof Error ? err.message : "업로드 실패"}`);
      }
    }

    setUploadingFor(null);
    if (failed.length) setAttachError(failed.join(" / "));
    await loadAttachments();
  };

  const handleAttachmentDelete = async (file: Attachment) => {
    if (!confirm(`'${file.file_name}' 을(를) 삭제하시겠습니까?`)) return;
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/lms/attachments/${file.id}`, { method: "DELETE", headers });
    const body = await res.json();
    if (!res.ok) { alert(body.error ?? "삭제에 실패했습니다."); return; }
    await loadAttachments();
  };

  /** 비공개 버킷이라 링크로 바로 열 수 없다. 짧은 서명 URL 을 받아서 연다. */
  const handleAttachmentDownload = async (file: Attachment) => {
    setAttachError("");
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/lms/attachments/${file.id}`, { headers });
    const body = await res.json();
    if (!res.ok) { setAttachError(body.error ?? "파일을 불러오지 못했습니다."); return; }
    const link = document.createElement("a");
    link.href = body.url;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const openPreview = async (item: Content) => {
    setPreviewError("");
    const headers = await authHeaders();
    const res = await fetch("/api/admin/lms/preview-token", {
      method: "POST", headers, body: JSON.stringify({ uid: item.source_ref }),
    });
    const body = await res.json();
    if (!res.ok) { setPreviewError(body.error ?? "미리보기 토큰 발급 실패"); return; }
    if (!body.iframeUrl) { setPreviewError("재생 주소를 확인할 수 없습니다. 영상 상태를 확인해 주세요."); return; }
    setPreview({ content: item, iframeUrl: body.iframeUrl, allowedOrigins: body.allowedOrigins ?? [] });
  };

  if (allowed === null) {
    return <AdminLayout><p className="text-sm text-ys-ink-soft">확인 중...</p></AdminLayout>;
  }
  if (!allowed) {
    return (
      <AdminLayout>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow">
          <p className="text-sm text-ys-ink-soft">영상 LMS 관리 권한이 없습니다.</p>
        </div>
      </AdminLayout>
    );
  }

  const requiredCount = contents.filter((c) => c.is_required).length;
  const totalSec = contents.reduce((sum, c) => sum + c.duration_sec, 0);
  const hostname = typeof window === "undefined" ? "" : window.location.hostname;

  return (
    <AdminLayout>
      <Script src="https://embed.cloudflarestream.com/embed/sdk.latest.js" strategy="lazyOnload" />

      <div className="mb-6">
        <Link href="/admin/lms" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ys-ink-soft hover:text-ys-ink">
          <ArrowLeft className="h-4 w-4" />
          영상 LMS 관리
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ys-ink">{programName || "프로그램"} — 콘텐츠</h2>
            <p className="mt-1 text-xs text-ys-ink-soft">
              필수 {requiredCount}개 · 전체 {contents.length}개 · 총 {formatDuration(totalSec)} · 이수 기준 진도 {minProgress}%
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setEditingId(null); setForm({ ...emptyForm, contentOrder: contents.length + 1 }); setError(""); setNotice(""); setShowForm(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-ys-blue/90"
          >
            <Plus className="h-4 w-4" />
            콘텐츠 추가
          </button>
        </div>
      </div>

      {notice && <p className="mb-4 rounded-lg bg-ys-blue/10 px-3 py-2 text-xs text-ys-blue">{notice}</p>}
      {previewError && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{previewError}</p>}
      {attachError && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{attachError}</p>}

      {/* 업로드 창은 하나만 두고 어느 콘텐츠에 붙일지는 uploadTargetRef 로 기억한다 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        onChange={handleFilesChosen}
        className="hidden"
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-ys-paper">
            <tr>
              <th className="w-20 px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">순서</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">제목</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">영상 UID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">길이</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">언어</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">필수</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-ys-ink-soft">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-ys-ink-soft">불러오는 중...</td></tr>
            ) : contents.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-ys-ink-soft">등록된 콘텐츠가 없습니다.</td></tr>
            ) : (
              contents.map((item) => (
                <tr key={item.id} className="hover:bg-ys-paper">
                  <td className="px-4 py-3 text-sm text-ys-ink-soft">{item.content_order}</td>
                  <td className="px-4 py-3 text-sm font-medium text-ys-ink">
                    {item.title}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Paperclip className="h-3 w-3 shrink-0 text-ys-ink-soft/50" />
                      {(attachments[item.id] ?? []).map((file) => (
                        <span
                          key={file.id}
                          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-normal"
                        >
                          <button
                            type="button"
                            onClick={() => handleAttachmentDownload(file)}
                            className="flex items-center gap-1 text-ys-ink hover:text-ys-blue"
                            title="받아보기"
                          >
                            <Download className="h-3 w-3 shrink-0" />
                            <span className="max-w-[16rem] truncate">{file.file_name}</span>
                          </button>
                          <span className="text-ys-ink-soft/60">{formatFileSize(file.size_bytes)}</span>
                          <button
                            type="button"
                            onClick={() => handleAttachmentDelete(file)}
                            className="text-ys-ink-soft/50 hover:text-red-600"
                            title="첨부 삭제"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => pickFiles(item.id)}
                        disabled={uploadingFor !== null}
                        className="flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] font-normal text-ys-ink-soft hover:border-ys-blue hover:text-ys-blue disabled:opacity-50"
                      >
                        <Upload className="h-3 w-3" />
                        {uploadingFor === item.id ? "올리는 중..." : "자료 추가"}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ys-ink-soft">{item.source_ref}</td>
                  <td className="px-4 py-3 text-sm text-ys-ink-soft">{formatDuration(item.duration_sec)}</td>
                  <td className="px-4 py-3 text-sm text-ys-ink-soft">{item.language}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      item.is_required ? "bg-ys-blue/10 text-ys-blue" : "bg-slate-100 text-ys-ink-soft"
                    }`}>
                      {item.is_required ? "필수" : "선택"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openPreview(item)}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-ys-ink hover:bg-ys-paper"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        미리보기
                      </button>
                      <button type="button" onClick={() => handleEdit(item)} className="rounded-lg p-1.5 text-ys-ink-soft hover:bg-slate-100 hover:text-ys-ink" title="수정">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(item)} className="rounded-lg p-1.5 text-ys-ink-soft hover:bg-red-50 hover:text-red-600" title="삭제">
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
            <h3 className="mb-4 text-base font-bold text-ys-ink">{editingId ? "콘텐츠 수정" : "콘텐츠 추가"}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ys-ink-soft">제목 *</label>
                <input
                  type="text" required value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ys-ink-soft">Cloudflare Stream 영상 UID *</label>
                <input
                  type="text" required value={form.sourceRef}
                  onChange={(e) => setForm({ ...form, sourceRef: e.target.value })}
                  placeholder="예: 26c2f463075e106aceea61e8c16859c3"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
                <p className="mt-1 text-[11px] text-ys-ink-soft/70">
                  저장 시 영상 길이를 Cloudflare 에서 자동으로 조회합니다. 수기 입력란은 제공하지 않습니다.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ys-ink-soft">설명</label>
                <textarea
                  rows={2} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ys-ink-soft">순서</label>
                  <input
                    type="number" min={0} value={form.contentOrder}
                    onChange={(e) => setForm({ ...form, contentOrder: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ys-ink-soft">언어</label>
                  <select
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="ko">한국어 (ko)</option>
                    <option value="en">English (en)</option>
                    <option value="zh">中文 (zh)</option>
                    <option value="vi">Tiếng Việt (vi)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ys-ink-soft">언어 묶음 키</label>
                  <input
                    type="text" value={form.contentGroup}
                    onChange={(e) => setForm({ ...form, contentGroup: e.target.value })}
                    placeholder="예: orientation-1"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {editingId && (
                <p className="rounded-lg bg-ys-paper px-3 py-2 text-[11px] text-ys-ink-soft">
                  첨부 자료는 목록에서 영상 아래 &lsquo;자료 추가&rsquo; 로 올립니다.
                </p>
              )}

              <label className="flex items-center gap-2 text-sm text-ys-ink">
                <input
                  type="checkbox" checked={form.isRequired}
                  onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                이수 필수 콘텐츠
              </label>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper"
                >
                  취소
                </button>
                <button
                  type="submit" disabled={saving}
                  className="rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-ys-blue/90 disabled:opacity-50"
                >
                  {saving ? "영상 정보 조회 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ys-ink">{preview.content.title}</h3>
                <p className="mt-0.5 text-xs text-ys-ink-soft">
                  {formatDuration(preview.content.duration_sec)} · {preview.content.source_ref}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-ys-ink hover:bg-ys-paper"
              >
                닫기
              </button>
            </div>
            <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
              <iframe
                src={preview.iframeUrl}
                title={preview.content.title}
                allow="accelerometer; gyroscope; encrypted-media; picture-in-picture;"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
            {!preview.allowedOrigins.some((o) => hostname.startsWith(o.split(":")[0])) && (
              <p className="mt-3 rounded-lg bg-ys-gold/10 px-3 py-2 text-[11px] text-[#8A6212]">
                이 도메인({hostname})은 영상 허용 도메인이 아니라 재생이 차단됩니다.
                미리보기는 배포된 주소({preview.allowedOrigins.join(", ") || "미설정"})에서 확인해 주세요.
              </p>
            )}
            <p className="mt-3 text-[11px] text-ys-ink-soft/70">
              등록 직후에는 보안 설정 전파(최대 1분)로 재생이 일시적으로 실패할 수 있습니다. 잠시 후 다시 시도해 주세요.
            </p>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

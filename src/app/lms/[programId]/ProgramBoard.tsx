"use client";

/**
 * 프로그램 의견 게시판
 *
 * 게시판은 프로그램에 딸려 있으므로 개설 절차가 없다. 프로그램 화면이 열리면 게시판도 있다.
 * 열람 권한 판정과 비밀글 마스킹은 전부 서버가 한다. 여기서는 서버가 준 값을 그대로 그린다.
 */
import { ChevronDown, ChevronUp, Lock, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatDateTimeKorea } from "@/lib/date";
import {
  lmsDelete,
  lmsGet,
  lmsPatch,
  lmsPost,
  type LmsPost,
  type LmsPostList,
  type LmsReplyList,
} from "@/lib/lms-client";

const TITLE_MAX = 100;
const BODY_MAX = 2000;

export default function ProgramBoard({ programId }: { programId: number }) {
  const [list, setList] = useState<LmsPostList | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  // 목록 자체를 못 부르는 경우(미신청 등)는 서버 메시지를 그대로 보여준다
  const [blocked, setBlocked] = useState("");

  const [openId, setOpenId] = useState<number | null>(null);
  const [replies, setReplies] = useState<LmsReplyList | null>(null);
  const [replyError, setReplyError] = useState("");

  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const load = useCallback(async (target: number) => {
    setLoading(true);
    try {
      const data = await lmsGet<LmsPostList>(`/api/lms/posts?programId=${programId}&page=${target}`);
      setList(data);
      setPage(target);
      setBlocked("");
    } catch (e) {
      setBlocked(e instanceof Error ? e.message : "게시판을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => { load(1); }, [load]);

  const loadReplies = useCallback(async (postId: number) => {
    setReplyError("");
    try {
      setReplies(await lmsGet<LmsReplyList>(`/api/lms/posts/${postId}/replies`));
    } catch (e) {
      setReplies(null);
      setReplyError(e instanceof Error ? e.message : "답글을 불러오지 못했습니다.");
    }
  }, []);

  const toggleOpen = (post: LmsPost) => {
    if (openId === post.id) { setOpenId(null); setReplies(null); return; }
    setOpenId(post.id);
    setEditingId(null);
    setReplyBody("");
    setReplies(null);
    // 가려진 비밀글은 답글도 볼 수 없다. 굳이 403 을 부르지 않는다.
    if (post.masked) { setReplyError(""); return; }
    loadReplies(post.id);
  };

  const resetForm = () => { setTitle(""); setBody(""); setIsSecret(false); setFormError(""); };

  const submitPost = async () => {
    setSubmitting(true);
    setFormError("");
    try {
      if (editingId) {
        await lmsPatch(`/api/lms/posts/${editingId}`, { title, body, isSecret });
      } else {
        await lmsPost("/api/lms/posts", { programId, title, body, isSecret });
      }
      const editedId = editingId;
      setWriting(false);
      setEditingId(null);
      resetForm();
      await load(editedId ? page : 1);
      if (editedId && openId === editedId) await loadReplies(editedId);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (post: LmsPost) => {
    setEditingId(post.id);
    setWriting(true);
    setTitle(post.title ?? "");
    setBody(post.body);
    setIsSecret(post.isSecret);
    setFormError("");
  };

  const removePost = async (post: LmsPost) => {
    if (!confirm(post.parentId === null ? "글을 삭제할까요? 답글은 남습니다." : "답글을 삭제할까요?")) return;
    try {
      await lmsDelete(`/api/lms/posts/${post.id}`);
      if (post.parentId === null) {
        await load(page);
        if (openId === post.id) await loadReplies(post.id);
      } else {
        await load(page);
        if (openId) await loadReplies(openId);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    }
  };

  const submitReply = async (postId: number) => {
    if (!replyBody.trim()) return;
    setSubmitting(true);
    try {
      await lmsPost(`/api/lms/posts/${postId}/reply`, { body: replyBody });
      setReplyBody("");
      await loadReplies(postId);
      await load(page);
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "답글을 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.size)) : 1;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ys-ink">
          <MessageSquare className="h-4 w-4 text-ys-ink-soft" />
          의견 나누기
          {list && list.total > 0 && <span className="text-xs font-normal text-ys-ink-soft">{list.total}</span>}
        </h2>
        {list && !writing && (
          <button
            type="button"
            onClick={() => { setWriting(true); setEditingId(null); resetForm(); }}
            className="rounded-lg bg-ys-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-ys-blue/90"
          >
            글쓰기
          </button>
        )}
      </div>

      {/* 신청하지 않았거나 대상이 아니면 서버가 막는다. 글쓰기 폼도 그리지 않는다. */}
      {blocked && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-ys-ink-soft">{blocked}</p>
        </div>
      )}

      {writing && (
        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <input
            type="text"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-ys-blue"
          />
          <textarea
            value={body}
            maxLength={BODY_MAX}
            rows={5}
            onChange={(e) => setBody(e.target.value)}
            placeholder="영상을 보며 든 생각이나 궁금한 점을 남겨 주세요."
            className="mt-2 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-ys-blue"
          />
          <div className="mt-1 text-right text-[11px] text-ys-ink-soft/70">{body.length} / {BODY_MAX}</div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-ys-ink">
              <input type="checkbox" checked={isSecret} onChange={(e) => setIsSecret(e.target.checked)} className="h-3.5 w-3.5" />
              비밀글
              <span className="text-[11px] text-ys-ink-soft/70">비밀글도 프로그램 관리자에게는 공개됩니다</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setWriting(false); setEditingId(null); resetForm(); }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-ys-ink-soft hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitPost}
                disabled={submitting || !title.trim() || !body.trim()}
                className="rounded-lg bg-ys-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-ys-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "저장 중..." : editingId ? "수정" : "등록"}
              </button>
            </div>
          </div>
          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
        </div>
      )}

      {loading && !list ? (
        <p className="py-8 text-center text-sm text-ys-ink-soft">불러오는 중...</p>
      ) : list && list.posts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-ys-ink-soft">아직 올라온 의견이 없습니다. 첫 글을 남겨 보세요.</p>
        </div>
      ) : list ? (
        <ul className="space-y-2">
          {list.posts.map((post) => (
            <li key={post.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => toggleOpen(post)}
                className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {post.isSecret && <Lock className="h-3.5 w-3.5 shrink-0 text-ys-ink-soft/70" />}
                    <p className={`truncate text-sm font-medium ${post.deleted ? "text-ys-ink-soft/70" : "text-ys-ink"}`}>
                      {post.title}
                    </p>
                    {post.replyCount > 0 && (
                      <span className="shrink-0 rounded-full bg-ys-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-ys-blue">
                        답글 {post.replyCount}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-[11px] text-ys-ink-soft">
                    <span>{post.authorName || "-"}</span>
                    {post.isManagerPost && <span className="text-ys-blue">운영자</span>}
                    <span className="text-ys-ink-soft/70">{formatDateTimeKorea(post.createdAt)}</span>
                  </p>
                </div>
                {openId === post.id
                  ? <ChevronUp className="h-4 w-4 shrink-0 text-ys-ink-soft/70" />
                  : <ChevronDown className="h-4 w-4 shrink-0 text-ys-ink-soft/70" />}
              </button>

              {openId === post.id && (
                <div className="border-t border-slate-100 px-4 py-4">
                  <p className={`whitespace-pre-wrap text-sm ${post.masked || post.deleted ? "text-ys-ink-soft/70" : "text-ys-ink"}`}>
                    {post.body}
                  </p>

                  {(post.canEdit || post.canDelete) && (
                    <div className="mt-3 flex items-center gap-2">
                      {post.canEdit && (
                        <button
                          type="button"
                          onClick={() => startEdit(post)}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-ys-ink-soft hover:bg-slate-50"
                        >
                          <Pencil className="h-3 w-3" />
                          수정
                        </button>
                      )}
                      {post.canDelete && (
                        <button
                          type="button"
                          onClick={() => removePost(post)}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          삭제
                        </button>
                      )}
                    </div>
                  )}

                  {/* 답글 */}
                  {!post.masked && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      {replies && replies.replies.length > 0 && (
                        <ul className="mb-3 space-y-2">
                          {replies.replies.map((reply) => (
                            <li key={reply.id} className="rounded-lg bg-slate-50 px-3 py-2.5">
                              <p className="flex items-center gap-2 text-[11px] text-ys-ink-soft">
                                <span className="font-medium text-ys-ink">{reply.authorName || "-"}</span>
                                {reply.isManagerPost && <span className="text-ys-blue">운영자</span>}
                                <span className="text-ys-ink-soft/70">{formatDateTimeKorea(reply.createdAt)}</span>
                                {reply.canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => removePost(reply)}
                                    className="ml-auto text-[11px] text-red-600 hover:underline"
                                  >
                                    삭제
                                  </button>
                                )}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-ys-ink">{reply.body}</p>
                            </li>
                          ))}
                        </ul>
                      )}

                      {!post.deleted && (
                        <div className="flex items-start gap-2">
                          <textarea
                            value={replyBody}
                            maxLength={BODY_MAX}
                            rows={2}
                            onChange={(e) => setReplyBody(e.target.value)}
                            placeholder="답글 남기기"
                            className="flex-1 resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-ys-blue"
                          />
                          <button
                            type="button"
                            onClick={() => submitReply(post.id)}
                            disabled={submitting || !replyBody.trim()}
                            className="shrink-0 rounded-lg bg-ys-blue px-3 py-2 text-xs font-medium text-white hover:bg-ys-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            등록
                          </button>
                        </div>
                      )}
                      {replyError && <p className="mt-2 text-xs text-red-600">{replyError}</p>}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {list && totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => load(page - 1)}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-ys-ink-soft hover:bg-slate-50 disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-ys-ink-soft">{page} / {totalPages}</span>
          <button
            type="button"
            onClick={() => load(page + 1)}
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-ys-ink-soft hover:bg-slate-50 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </section>
  );
}

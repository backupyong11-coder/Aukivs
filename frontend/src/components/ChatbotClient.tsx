"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChecklistItem } from "@/lib/checklist";
import type { ChatbotContextPayload } from "@/lib/chatbotContext";
import type { MemoItem } from "@/lib/memos";
import { useChatbotContext } from "@/hooks/useChatbotContext";

type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "error"; text: string };

function trimForOpsAsk(ctx: ChatbotContextPayload) {
  const trimPlatform = ctx.platformMaster.slice(0, 50).map((p) => ({
    회사명: p["회사명"],
    플랫폼명: p["플랫폼명"],
    현재단계: p["현재단계"],
    마지막상황: p["마지막상황"] || p["마지막 상황"],
    담당자명: p["담당자명"],
    담당자이메일: p["담당자이메일"],
    연락수단연락처: p["연락수단/연락처"] || p["연락수단연락처"],
    우선순위: p["우선순위"],
    다음액션: p["다음액션"],
  }));

  const trimWorks = ctx.worksMaster.slice(0, 50).map((w) => ({
    작품명: w["작품명"] ?? "",
    글작가: w["글작가"] ?? "",
    그림작가: w["그림작가"] ?? "",
    "분류(일반/성인)": w["분류(일반/성인)"] ?? "",
    현재상태: w["현재상태"] ?? "",
    연령등급: w["연령등급"] ?? "",
    "UCI (구 ISBN)": w["UCI (구 ISBN)"] ?? "",
    태그: w["태그"] ?? "",
    "연재중인 사이트": w["연재중인 사이트"] ?? "",
    "첫 공급 일정": w["첫 공급 일정"] ?? "",
  }));

  const trimMemos = ctx.memos.slice(0, 30).map((m: MemoItem) => ({
    content: m.content,
    category: m.category,
  }));

  const trimTasks = ctx.tasks.slice(0, 80).map((t) => ({
    업무명: t["업무명"] ?? "",
    마감일: t["마감일"] ?? "",
    완료: t["완료"] ?? "",
    우선순위: t["우선순위"] ?? "",
    분류: t["분류"] ?? "",
    분야: t["분야"] ?? "",
    관련플랫폼: t["관련플랫폼"] ?? "",
    업무담당: t["업무담당"] ?? t["상태"] ?? t["담당자"] ?? "",
    메모: t["메모"] ?? "",
  }));

  const trimChecklist = ctx.checklist.slice(0, 100).map((c: ChecklistItem) => ({
    title: c.title,
    due_date: c.due_date ?? null,
    priority: c.priority ?? null,
    platform: c.platform ?? null,
    category: c.category ?? null,
    work_status: c.work_status ?? null,
    note: c.note ?? null,
    memo: c.memo ?? null,
  }));

  return {
    platformMaster: trimPlatform,
    worksMaster: trimWorks,
    memos: trimMemos,
    tasks: trimTasks,
    checklist: trimChecklist,
  };
}

function AssistantBubble({ text }: { text: string }) {
  const lines = text.split("\n");
  const head = lines[0]?.trim() ?? "";
  const tagLike = /^\[[^\]]+\]\s*$/.test(head);
  const tag = tagLike ? head : null;
  const body = tagLike ? lines.slice(1).join("\n").trimStart() : text;

  let icon: "db" | "filter" | "task" | "default" = "default";
  if (tag) {
    if (/조회|DB|마스터/i.test(tag)) icon = "db";
    else if (/필터|조건|추출/i.test(tag)) icon = "filter";
    else if (/태스크|체크|마감|업무/i.test(tag)) icon = "task";
  }

  const Icon = () => {
    if (icon === "db") {
      return (
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" aria-hidden>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <ellipse cx="12" cy="6" rx="8" ry="3" />
            <path strokeLinecap="round" d="M4 6v6c0 1.5 3.5 3 8 3s8-1.5 8-3V6" />
            <path strokeLinecap="round" d="M4 12v6c0 1.5 3.5 3 8 3s8-1.5 8-3v-6" />
          </svg>
        </span>
      );
    }
    if (icon === "filter") {
      return (
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" aria-hidden>
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
          </svg>
        </span>
      );
    }
    if (icon === "task") {
      return (
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" aria-hidden>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </span>
      );
    }
    return (
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" aria-hidden>
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 005.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
      </span>
    );
  };

  return (
    <div className="flex max-w-[min(100%,40rem)] gap-2 self-start">
      <Icon />
      <div className="rounded-2xl rounded-tl-sm border border-sky-100 bg-sky-50/90 px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-slate-100">
        {tag ? <p className="mb-2 text-xs font-semibold text-sky-800 dark:text-sky-200">{tag}</p> : null}
        <div className="whitespace-pre-wrap">{body || text}</div>
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  "미툰 담당자 이메일 알려줘",
  "현재 대표님 검토 중인 플랫폼만 정리해줘",
  "오늘 마감인 긴급 체크리스트는?",
];

export function ChatbotClient() {
  const ctxState = useChatbotContext();
  const sendingRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const send = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q || sendingRef.current) return;
    if (ctxState.kind !== "ready") return;

    sendingRef.current = true;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setDraft("");
    setSending(true);

    try {
      const payload = trimForOpsAsk(ctxState.data);
      const res = await fetch("/api/ops/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, ...payload }),
      });
      const data = (await res.json()) as { answer?: string; error?: unknown };

      if (data.error) {
        const err = data.error;
        if (typeof err === "string") {
          setMessages((m) => [...m, { role: "error", text: err }]);
          return;
        }
        if (err && typeof err === "object") {
          const o = err as { message?: unknown; error?: { type?: string } };
          const errType = o.error?.type ?? "";
          const detail =
            typeof o.message === "string"
              ? o.message
              : errType === "overloaded_error"
                ? "AI 서버가 일시적으로 과부하 상태예요. 잠시 후 다시 시도해주세요."
                : errType === "invalid_request_error"
                  ? "요청 데이터가 너무 커요. 질문을 더 구체적으로 해주세요."
                  : "AI 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
          setMessages((m) => [...m, { role: "error", text: detail }]);
          return;
        }
        setMessages((m) => [...m, { role: "error", text: "요청에 실패했습니다." }]);
        return;
      }

      setMessages((m) => [...m, { role: "assistant", text: data.answer ?? "응답 없음" }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "error", text: e instanceof Error ? e.message : "오류" }]);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [ctxState]);

  const busyBanner =
    ctxState.kind === "loading" ? (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">질문용 데이터를 불러오는 중…</p>
    ) : ctxState.kind === "error" ? (
      <p className="text-xs text-red-600 dark:text-red-400">{ctxState.message}</p>
    ) : null;

  return (
    <div className="flex h-[min(72vh,640px)] min-h-[420px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="shrink-0 border-b border-zinc-200 bg-zinc-200/80 px-4 py-2.5 dark:border-zinc-600 dark:bg-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Interactive Ops</h2>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">플랫폼·작품·업무·체크리스트·메모 데이터를 물어보면 답합니다.</p>
      </div>

      {busyBanner ? <div className="shrink-0 border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">{busyBanner}</div> : null}

      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white px-4 py-4 dark:bg-zinc-950/50">
        {messages.length === 0 && ctxState.kind === "ready" ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">예시 질문을 눌러 보세요.</p>
            <div className="flex flex-col items-end gap-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void send(p)}
                  disabled={sending}
                  className="max-w-[85%] rounded-2xl rounded-tr-sm border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[min(100%,34rem)] rounded-2xl rounded-tr-sm border border-zinc-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50">
                {msg.text}
              </div>
            </div>
          ) : msg.role === "assistant" ? (
            <AssistantBubble key={i} text={msg.text} />
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[min(100%,34rem)] rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
                {msg.text}
              </div>
            </div>
          ),
        )}

        {sending ? (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              답변 작성 중…
            </div>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
        <label htmlFor="chatbot-input" className="sr-only">
          질문 입력
        </label>
        <div className="flex gap-2">
          <textarea
            id="chatbot-input"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            placeholder="데이터에 대해 질문하세요… (Enter 전송, Shift+Enter 줄바꿈)"
            disabled={ctxState.kind !== "ready" || sending}
            className="min-h-[3rem] flex-1 resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:focus:ring-zinc-600"
          />
          <button
            type="button"
            onClick={() => void send(draft)}
            disabled={ctxState.kind !== "ready" || sending || !draft.trim()}
            className="self-end rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

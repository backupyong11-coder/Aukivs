"use client";

import { useEffect, useState } from "react";
import { fetchChatbotContext, type ChatbotContextPayload } from "@/lib/chatbotContext";

export type ChatbotContextState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: ChatbotContextPayload }
  | { kind: "error"; message: string };

export function useChatbotContext(refreshKey = 0): ChatbotContextState {
  const [state, setState] = useState<ChatbotContextState>({ kind: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    setState((s) => (s.kind === "ready" ? s : { kind: "loading" }));
    void (async () => {
      try {
        const r = await fetchChatbotContext({ signal: ac.signal });
        if (ac.signal.aborted) return;
        if (r.ok) setState({ kind: "ready", data: r.data });
        else setState({ kind: "error", message: r.message });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (!ac.signal.aborted) {
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "불러오기 실패",
          });
        }
      }
    })();
    return () => ac.abort();
  }, [refreshKey]);

  return state;
}

"use client";

import { useEffect, useState } from "react";
import { fetchBackendHealth } from "@/lib/health";

type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; display: string }
  | { kind: "error"; message: string };

export function BackendHealth() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    (async () => {
      setState({ kind: "loading" });
      try {
        const result = await fetchBackendHealth({ signal: ac.signal });
        if (cancelled) return;
        if (!result.ok) {
          setState({ kind: "error", message: result.message });
          return;
        }
        setState({
          kind: "ok",
          display: JSON.stringify(result.payload, null, 2),
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            e instanceof Error
              ? e.message
              : "요청 중 오류가 발생했습니다.",
        });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        연결 확인 중…
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <p className="mt-3 text-sm text-red-600 dark:text-red-400">
        {state.message}
      </p>
    );
  }

  return (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      {state.display}
    </pre>
  );
}

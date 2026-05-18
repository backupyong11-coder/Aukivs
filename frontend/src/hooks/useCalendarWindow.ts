"use client";

import { useEffect, useState } from "react";
import {
  fetchCalendarWindow,
  type CalendarWindowPayload,
} from "@/lib/calendarWindow";

export type CalendarWindowState =
  | { kind: "loading" }
  | { kind: "ready"; data: CalendarWindowPayload }
  | { kind: "error"; message: string };

export function useCalendarWindow(
  fromYmd: string,
  toYmd: string,
  refreshKey = 0,
): CalendarWindowState {
  const [state, setState] = useState<CalendarWindowState>({ kind: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    setState({ kind: "loading" });
    void (async () => {
      try {
        const r = await fetchCalendarWindow(fromYmd, toYmd, { signal: ac.signal });
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
  }, [fromYmd, toYmd, refreshKey]);

  return state;
}

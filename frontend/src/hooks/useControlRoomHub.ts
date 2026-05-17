"use client";

import { useEffect, useState } from "react";
import { fetchControlRoomHub, type HubLoadState } from "@/lib/controlRoomHub";

export function useControlRoomHub(refreshKey = 0): HubLoadState {
  const [hub, setHub] = useState<HubLoadState>({ kind: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    setHub({ kind: "loading" });
    void (async () => {
      try {
        const next = await fetchControlRoomHub(ac.signal);
        if (!ac.signal.aborted) setHub(next);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (!ac.signal.aborted) {
          setHub({
            kind: "error",
            message: e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.",
          });
        }
      }
    })();
    return () => ac.abort();
  }, [refreshKey]);

  return hub;
}

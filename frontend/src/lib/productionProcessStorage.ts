/**
 * 제작공정 — 파이프라인·단계 체크리스트 (로컬 + Supabase)
 */

export type ProductionStep = {
  id: string;
  order: number;
  /** 단계 (예: 글 제작) */
  phase: string;
  /** 작업명 */
  task: string;
  /** 상세 내용 */
  detail: string;
  /** 담당 */
  assignee: string;
  /** 산출물 */
  deliverable: string;
  done: boolean;
};

export type ProductionPipeline = {
  id: string;
  name: string;
  steps: ProductionStep[];
};

export type ProductionProcessProfile = {
  version: 1;
  title: string;
  activePipelineId: string;
  pipelines: ProductionPipeline[];
};

const STORAGE_KEY = "worksheet_production_process_v1";

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function step(
  order: number,
  phase: string,
  task: string,
  detail: string,
  assignee: string,
  deliverable: string,
): ProductionStep {
  return {
    id: newId("step"),
    order,
    phase,
    task,
    detail,
    assignee,
    deliverable,
    done: false,
  };
}

const AI_ADULT_WEBTOON_STEPS: ProductionStep[] = [
  [1, "글 제작", "AI로 글 생성", "AI를 활용해 원고/스토리 초안 생성", "AI/기획", "글 초안"],
  [2, "글 제작", "사람이 글 검수", "AI 글 초안을 사람이 읽고 내용, 톤, 문제 요소 검수", "사람", "검수 완료 글"],
  [3, "글콘티 제작", "글콘티 뽑기", "검수된 글을 기반으로 글콘티 생성", "AI/기획", "글콘티 초안"],
  [4, "글콘티 제작", "사람이 글콘티 검수", "글콘티의 흐름, 컷 구성, 제작 가능성 검수", "사람", "검수 완료 글콘티"],
  [
    5,
    "캐릭터/기획",
    "등장인물 외면 묘사 요청",
    "기획안과 캐릭터 설정을 ChatGPT에 넣고 모든 등장인물의 외면을 자세히 묘사하도록 요청",
    "ChatGPT/기획",
    "상세 캐릭터 묘사",
  ],
  [6, "캐릭터/기획", "캐릭터시트 뽑기", "상세 묘사를 기반으로 캐릭터시트 제작", "AI/제작", "캐릭터시트"],
  [7, "리소스 정리", "캐릭터시트 분리", "캐릭터시트에서 필요한 캐릭터 이미지를 분리", "제작", "분리 캐릭터 이미지"],
  [8, "리소스 정리", "배경 이미지 정리", "작품에 필요한 배경 이미지를 정리", "제작", "배경 이미지 묶음"],
  [9, "리소스 정리", "단일 이미지 정리", "컷 제작에 필요한 단일 이미지를 정리", "제작", "단일 이미지 묶음"],
  [10, "콘티 순화", "성인 글콘티 순화", "성인 글콘티를 일반 글콘티로 순화", "기획/제작", "일반 순화 콘티"],
  [11, "콘티 순화", "두 가지 버전 보관", "성인 버전과 일반 순화 버전 두 가지를 모두 만들어놓기", "기획", "성인 버전 / 일반 버전"],
  [
    12,
    "컷 제작",
    "약 15컷 제작",
    "순화 콘티, 캐릭터시트, 배경, 단일 이미지를 활용해 15컷 정도 제작",
    "AI/제작",
    "15컷 이미지",
  ],
  [13, "컷 분리", "컷별 절삭", "제작 이미지를 다시 절삭해서 컷별로 한 컷씩 나누기", "제작", "컷별 분리 이미지"],
].map(([order, phase, task, detail, assignee, deliverable]) =>
  step(order as number, phase as string, task as string, detail as string, assignee as string, deliverable as string),
);

/** 엑셀「AI성인웹툰 제작 순서 공정」기준 초기 데이터 */
export function createDefaultProductionProcessProfile(): ProductionProcessProfile {
  const pipelineId = newId("pipe");
  return {
    version: 1,
    title: "제작공정",
    activePipelineId: pipelineId,
    pipelines: [
      {
        id: pipelineId,
        name: "AI 성인웹툰 제작",
        steps: AI_ADULT_WEBTOON_STEPS,
      },
    ],
  };
}

function normalizeStep(raw: unknown, fallbackOrder: number): ProductionStep | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  return {
    id: o.id,
    order: typeof o.order === "number" ? o.order : fallbackOrder,
    phase: typeof o.phase === "string" ? o.phase : "",
    task: typeof o.task === "string" ? o.task : "",
    detail: typeof o.detail === "string" ? o.detail : "",
    assignee: typeof o.assignee === "string" ? o.assignee : "",
    deliverable: typeof o.deliverable === "string" ? o.deliverable : "",
    done: o.done === true,
  };
}

function normalizePipeline(raw: unknown): ProductionPipeline | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  const stepsRaw = o.steps;
  if (!Array.isArray(stepsRaw)) return null;
  const steps: ProductionStep[] = [];
  stepsRaw.forEach((s, i) => {
    const item = normalizeStep(s, i + 1);
    if (item) steps.push(item);
  });
  steps.sort((a, b) => a.order - b.order);
  return { id: o.id, name: o.name, steps };
}

export function normalizeProductionProcessProfile(raw: unknown): ProductionProcessProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.version !== 1) return null;
  const pipelinesRaw = p.pipelines;
  if (!Array.isArray(pipelinesRaw)) return null;
  const pipelines: ProductionPipeline[] = [];
  for (const item of pipelinesRaw) {
    const pipe = normalizePipeline(item);
    if (pipe) pipelines.push(pipe);
  }
  if (pipelines.length === 0) return null;
  const active =
    typeof p.activePipelineId === "string" &&
    pipelines.some((pl) => pl.id === p.activePipelineId)
      ? p.activePipelineId
      : pipelines[0].id;
  return {
    version: 1,
    title: typeof p.title === "string" ? p.title : "제작공정",
    activePipelineId: active,
    pipelines,
  };
}

export function loadProductionProcessProfile(): ProductionProcessProfile {
  if (typeof window === "undefined") return createDefaultProductionProcessProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProductionProcessProfile();
    return normalizeProductionProcessProfile(JSON.parse(raw) as unknown) ?? createDefaultProductionProcessProfile();
  } catch {
    return createDefaultProductionProcessProfile();
  }
}

export function saveProductionProcessProfile(profile: ProductionProcessProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

export function getActivePipeline(profile: ProductionProcessProfile): ProductionPipeline {
  return (
    profile.pipelines.find((p) => p.id === profile.activePipelineId) ?? profile.pipelines[0]
  );
}

export function pipelineProgress(steps: ProductionStep[]): {
  done: number;
  total: number;
  percent: number;
} {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}

export function reorderSteps(steps: ProductionStep[], sourceId: string, targetId: string): ProductionStep[] {
  if (sourceId === targetId) return steps;
  const from = steps.findIndex((s) => s.id === sourceId);
  const to = steps.findIndex((s) => s.id === targetId);
  if (from < 0 || to < 0) return steps;
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((s, i) => ({ ...s, order: i + 1 }));
}

export { newId as productionProcessNewId };

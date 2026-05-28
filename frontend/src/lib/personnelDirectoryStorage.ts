export type PersonnelDirectoryPerson = {
  name: string;
  /** 직위 */
  position?: string;
  /** 연락처 */
  contact?: string;
  /** 담당업무 */
  role?: string;
  /** 생년월일 (자유 입력, 예: 1999-01-23) */
  birthdate?: string;
};

export type PersonnelDirectoryBundle = {
  version: 1;
  people: PersonnelDirectoryPerson[];
};

const STORAGE_KEY = "worksheet_personnel_directory_v1";

function normalizeName(raw: string): string {
  return (raw ?? "").trim();
}

function normalizeBundle(raw: unknown): PersonnelDirectoryBundle {
  const fallback: PersonnelDirectoryBundle = { version: 1, people: [] };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  if (Number(r.version) !== 1) return fallback;
  if (!Array.isArray(r.people)) return fallback;
  const people: PersonnelDirectoryPerson[] = [];
  for (const p of r.people) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const name = normalizeName(String(o.name ?? ""));
    if (!name) continue;
    const item: PersonnelDirectoryPerson = {
      name,
      position: typeof o.position === "string" ? o.position : "",
      contact: typeof o.contact === "string" ? o.contact : "",
      role: typeof o.role === "string" ? o.role : "",
      birthdate: typeof o.birthdate === "string" ? o.birthdate : "",
    };
    people.push(item);
  }
  return { version: 1, people };
}

export function loadPersonnelDirectory(): PersonnelDirectoryBundle {
  if (typeof window === "undefined") return { version: 1, people: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, people: [] };
    return normalizeBundle(JSON.parse(raw) as unknown);
  } catch {
    return { version: 1, people: [] };
  }
}

export function savePersonnelDirectory(bundle: PersonnelDirectoryBundle): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
  } catch {
    /* quota */
  }
}

export function getDirectoryPerson(name: string): PersonnelDirectoryPerson | null {
  const n = normalizeName(name);
  if (!n) return null;
  const dir = loadPersonnelDirectory();
  return dir.people.find((p) => normalizeName(p.name) === n) ?? null;
}

export function upsertDirectoryPerson(person: PersonnelDirectoryPerson): void {
  const name = normalizeName(person.name);
  if (!name) return;
  const dir = loadPersonnelDirectory();
  const next: PersonnelDirectoryBundle = {
    version: 1,
    people: [...dir.people],
  };
  const idx = next.people.findIndex((p) => normalizeName(p.name) === name);
  const item: PersonnelDirectoryPerson = {
    name,
    position: (person.position ?? "").trim(),
    contact: (person.contact ?? "").trim(),
    role: (person.role ?? "").trim(),
    birthdate: (person.birthdate ?? "").trim(),
  };
  if (idx >= 0) next.people[idx] = item;
  else next.people.push(item);
  next.people.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  savePersonnelDirectory(next);
}


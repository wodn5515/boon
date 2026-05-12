import { randomUUID } from "node:crypto";

import type { Category as DbCategory } from "@/db/schema/categories";

/**
 * E2E (`E2E_BYPASS_AUTH=1`) 전용 in-memory categories 스토어.
 *
 * 결정 로그 005 §D + 004 §"보강-5" 패턴 그대로:
 *   - production 빌드에 안 들어가도록 `isE2EBypassEnabled()` 가드로만 진입.
 *   - dev 서버 lifecycle 동안만 살아 있고, 재시작 시 휘발.
 *   - 통합 테스트는 pglite + RLS 로 검증 — 본 store 는 E2E 사용자 흐름 모사용.
 *
 * fixture user 단일(`...000001`)을 가정. 처음 접근 시 기본 카테고리 3개를 시드한다
 * (실서비스의 callback handler 시드를 E2E 에서 흉내).
 */

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";

// Next.js dev 의 module reload 가 매 요청마다 모듈을 다시 평가 → globalThis 에 핀.
const STORE_KEY = "__BOON_E2E_CATEGORIES_STORE__";
type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: Map<string, DbCategory>;
};
const g = globalThis as GlobalWithStore;
if (!g[STORE_KEY]) {
  g[STORE_KEY] = new Map<string, DbCategory>();
}
const store: Map<string, DbCategory> = g[STORE_KEY]!;

const USER_CATEGORY_LIMIT = 20;

/**
 * 기본 카테고리 3개 자동 시드 (실서비스의 callback handler 흐름을 E2E 에서 흉내).
 * 이미 시드되었으면 noop.
 */
function ensureSeeded(): void {
  const hasSystem = Array.from(store.values()).some(
    (c) => c.user_id === FAKE_USER_ID && c.is_system,
  );
  if (hasSystem) return;
  const now = new Date();
  const defaults: Array<Omit<DbCategory, "id" | "created_at" | "updated_at">> = [
    {
      user_id: FAKE_USER_ID,
      name: "물질",
      icon: "💰",
      color: "#22c55e",
      is_system: true,
      sort_order: 1,
    },
    {
      user_id: FAKE_USER_ID,
      name: "시간·행동",
      icon: "⏰",
      color: "#84cc16",
      is_system: true,
      sort_order: 2,
    },
    {
      user_id: FAKE_USER_ID,
      name: "마음",
      icon: "💝",
      color: "#4ade80",
      is_system: true,
      sort_order: 3,
    },
  ];
  for (const c of defaults) {
    const id = randomUUID();
    store.set(id, { id, ...c, created_at: now, updated_at: now });
  }
}

function clone(c: DbCategory): DbCategory {
  return { ...c };
}

function ownRows(): DbCategory[] {
  return Array.from(store.values()).filter((c) => c.user_id === FAKE_USER_ID);
}

export function e2eListCategories(): DbCategory[] {
  ensureSeeded();
  const rows = ownRows();
  rows.sort((a, b) => {
    if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
  return rows.map(clone);
}

export function e2eCreateCategory(input: {
  name: string;
  icon: string | null;
  color: string;
}): void {
  ensureSeeded();
  // 상한 20 검사 (사용자 카테고리만 카운트).
  const userCount = ownRows().filter((c) => !c.is_system).length;
  if (userCount >= USER_CATEGORY_LIMIT) {
    throw new Error(
      `카테고리는 최대 ${USER_CATEGORY_LIMIT}개까지 추가할 수 있어요.`,
    );
  }
  // MAX(sort_order) + 1 — 본인 카테고리 전체 기준 (시스템 포함).
  const max = ownRows().reduce((m, c) => Math.max(m, c.sort_order), 0);
  const now = new Date();
  const id = randomUUID();
  store.set(id, {
    id,
    user_id: FAKE_USER_ID,
    name: input.name,
    icon: input.icon,
    color: input.color,
    is_system: false,
    sort_order: max + 1,
    created_at: now,
    updated_at: now,
  });
}

export function e2eUpdateCategory(input: {
  id: string;
  name: string;
  icon: string | null;
  color: string;
}): void {
  ensureSeeded();
  const row = store.get(input.id);
  if (!row) return;
  if (row.user_id !== FAKE_USER_ID) return;
  if (row.is_system) {
    // name 만 변경. icon/color 는 silent ignore (005 §E).
    store.set(input.id, { ...row, name: input.name, updated_at: new Date() });
    return;
  }
  store.set(input.id, {
    ...row,
    name: input.name,
    icon: input.icon,
    color: input.color,
    updated_at: new Date(),
  });
}

export function e2eDeleteCategory(id: string): void {
  ensureSeeded();
  const row = store.get(id);
  if (!row) return;
  if (row.user_id !== FAKE_USER_ID) return;
  if (row.is_system) {
    throw new Error("기본 카테고리는 삭제할 수 없어요.");
  }
  store.delete(id);
}

export function e2eReorderCategory(
  id: string,
  direction: "up" | "down",
): void {
  ensureSeeded();
  const target = store.get(id);
  if (!target) return;
  if (target.user_id !== FAKE_USER_ID) return;

  // 같은 그룹(is_system 동일) 내에서 인접 카테고리 찾기.
  const sameGroup = ownRows()
    .filter((c) => c.is_system === target.is_system)
    .sort((a, b) => a.sort_order - b.sort_order);
  const idx = sameGroup.findIndex((c) => c.id === target.id);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sameGroup.length) return;

  const neighbor = sameGroup[swapIdx]!;
  const now = new Date();
  store.set(target.id, {
    ...target,
    sort_order: neighbor.sort_order,
    updated_at: now,
  });
  store.set(neighbor.id, {
    ...neighbor,
    sort_order: target.sort_order,
    updated_at: now,
  });
}

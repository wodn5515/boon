import { randomUUID } from "node:crypto";

import type { Friend } from "@/db/schema/friends";

/**
 * E2E (`E2E_BYPASS_AUTH=1`) 전용 in-memory friends 스토어.
 *
 * 결정 로그 003 §D + 004 §H 의 트레이드오프:
 *   - pglite 를 Next.js dev 서버에 띄우려 했으나 WASM 로딩 경로 충돌이 있어 (Webpack 의
 *     `import.meta.url` 변환) E2E 동안은 JS-only 메모리 맵으로 대체. RLS / 검색 / 정렬 등
 *     friends 슬라이스 행동 검증에 필요한 흐름만 충실히 모사한다.
 *   - 통합 테스트(`tests/integration`) 는 그대로 pglite 를 쓰므로 RLS / SQL 정합성은 거기서 보장.
 *   - production 빌드에서는 이 파일이 import 되지 않도록 `isE2EBypassEnabled()` 가드로만 진입.
 *
 * 단일 dev 서버 lifecycle 동안만 살아 있고, 서버 재시작 시 휘발된다.
 * fixture 의 fake bypass user(`...000001`) 한 사용자 시점 외 user 다중성은 없음.
 */

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";

// Next.js dev 의 module reload 가 매 요청마다 모듈을 다시 평가해 모듈-스코프 변수가 휘발된다.
// `globalThis` 에 붙여 dev 서버 lifecycle 동안 store 가 살아 있도록 유지한다.
// production 빌드에는 이 모듈이 들어가지 않지만, 만약 들어가도 globalThis 가 새 프로세스마다 새로 시작.
const STORE_KEY = "__BOON_E2E_FRIENDS_STORE__";
type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: Map<string, Friend>;
};
const g = globalThis as GlobalWithStore;
if (!g[STORE_KEY]) {
  g[STORE_KEY] = new Map<string, Friend>();
}
const store: Map<string, Friend> = g[STORE_KEY]!;

function clone(friend: Friend): Friend {
  return { ...friend };
}

function activeFriends(): Friend[] {
  return Array.from(store.values()).filter(
    (f) => !f.is_deleted && f.user_id === FAKE_USER_ID,
  );
}

export function e2eListFriends({ q }: { q?: string } = {}): Friend[] {
  const trimmed = q?.trim().toLowerCase();
  let rows = activeFriends();
  if (trimmed && trimmed.length > 0) {
    rows = rows.filter((f) => f.name.toLowerCase().includes(trimmed));
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return rows.map(clone);
}

export function e2eGetFriendById(id: string): Friend | null {
  const row = store.get(id);
  if (!row) return null;
  if (row.is_deleted) return null;
  if (row.user_id !== FAKE_USER_ID) return null;
  return clone(row);
}

export function e2eCreateFriend(input: {
  name: string;
  birthday_month: number | null;
  birthday_day: number | null;
  note: string | null;
}): void {
  const id = randomUUID();
  const now = new Date();
  store.set(id, {
    id,
    user_id: FAKE_USER_ID,
    name: input.name,
    birthday_month: input.birthday_month,
    birthday_day: input.birthday_day,
    note: input.note,
    is_deleted: false,
    created_at: now,
    updated_at: now,
  });
}

export function e2eUpdateFriend(input: {
  id: string;
  name: string;
  birthday_month: number | null;
  birthday_day: number | null;
  note: string | null;
}): void {
  const row = store.get(input.id);
  if (!row) return;
  if (row.user_id !== FAKE_USER_ID) return; // RLS 모사 — 본인 친구만.
  store.set(input.id, {
    ...row,
    name: input.name,
    birthday_month: input.birthday_month,
    birthday_day: input.birthday_day,
    note: input.note,
    updated_at: new Date(),
  });
}

export function e2eDeleteFriend(id: string): void {
  const row = store.get(id);
  if (!row) return;
  if (row.user_id !== FAKE_USER_ID) return;
  store.set(id, { ...row, is_deleted: true, updated_at: new Date() });
}

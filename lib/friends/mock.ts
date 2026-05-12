import type { Friend } from "./types";

/**
 * 친구 관리 UI 골격용 mock 데이터.
 *
 * worker 가 DB 쿼리(`db/schema/friends.ts` + Supabase RLS)로 교체할 때
 * 이 파일은 통째로 제거된다. mock 의 목적은:
 *
 * 1) 디자이너 단계에서 카드 그리드·아바타 색상 다양성을 시각적으로 확인
 * 2) /friends/[id] 동적 라우트가 200 OK 로 떨어지는 placeholder 데이터 제공
 *
 * 이름은 한글 1자 + 영어 2자 케이스를 섞어 두어 `InitialAvatar` 두 경로를 모두
 * 시연한다.
 */
export const MOCK_FRIENDS: Friend[] = [
  {
    id: "1",
    name: "김민준",
    birthday_month: 3,
    birthday_day: 14,
    note: "대학 동기. 음악 취향 잘 통함.",
    entry_count: 0,
  },
  {
    id: "2",
    name: "박서연",
    birthday_month: 8,
    birthday_day: 22,
    note: null,
    entry_count: 0,
  },
  {
    id: "3",
    name: "Alex Park",
    birthday_month: null,
    birthday_day: null,
    note: "회사 동료. 커피 좋아함.",
    entry_count: 0,
  },
  {
    id: "4",
    name: "이지은",
    birthday_month: 12,
    birthday_day: 1,
    note: null,
    entry_count: 0,
  },
];

/**
 * 단일 친구 조회 placeholder. 매칭 실패 시 null.
 *
 * worker 는 이 함수를 drizzle 쿼리(예: `db.query.friends.findFirst({ where: ... })`)
 * 로 교체하면서 동시에 RLS·404 처리(notFound())를 결합한다.
 */
export function getMockFriendById(id: string): Friend | null {
  return MOCK_FRIENDS.find((f) => f.id === id) ?? null;
}

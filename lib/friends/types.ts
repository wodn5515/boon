/**
 * Friend UI 도메인 타입.
 *
 * V1 친구 관리 UI 골격에서 컴포넌트들이 공유하는 props 형태.
 * worker 가 drizzle 스키마(`db/schema/friends.ts`)로 결합할 때 동일 필드명을
 * 갖도록 PRD §4 데이터 모델 그대로 snake_case 를 유지한다.
 *
 * - `entry_count` 는 friends 테이블 컬럼이 아니라 entries 슬라이스에서
 *   집계되어 결합되는 파생 값이다. V1 골격에서는 placeholder 0 으로 채운다.
 */
export type Friend = {
  id: string;
  name: string;
  birthday_month: number | null;
  birthday_day: number | null;
  note: string | null;
  /** entries 슬라이스가 집계하여 결합. V1 골격에선 0 placeholder. */
  entry_count: number;
};

/**
 * 친구 생일 표시 ("M월 D일"). 둘 중 하나라도 없으면 null 반환.
 *
 * 친구 카드·상세 페이지·삭제 모달 등 여러 곳에서 동일 포맷을 쓰므로 한 곳에서 관리.
 */
export function formatBirthday(friend: Pick<Friend, "birthday_month" | "birthday_day">): string | null {
  if (friend.birthday_month == null || friend.birthday_day == null) return null;
  return `${friend.birthday_month}월 ${friend.birthday_day}일`;
}

/**
 * 친구 생일 D-N 카운트다운 헬퍼.
 *
 * - 친구 모델은 birthday_month/day 만 가진다 (연도 없음 — PRD §4).
 * - "오늘부터 다음 생일까지 며칠인가" 만 계산. 0 이면 "오늘".
 * - 시간대는 호출자가 결정하면 좋지만 RSC 기본인 Asia/Seoul 가정 (PRD §6 ko-KR locale).
 *
 * 결정 로그 004 §B / Task 10-2: lib/friends/birthday.ts 로 분리 — 다음 슬라이스
 * 단위 테스트 보강 라운드에서 test-writer 가 회귀 spec 을 잡기 좋도록 순수 함수로 둔다.
 */

/**
 * birthday_month/day 가 모두 있으면 "오늘 → 다음 생일 까지 일수" 반환. 둘 다 null 이면 null.
 *
 * @param now 비교 기준일. 테스트 결정성을 위해 외부 주입 가능. 기본값은 Date.now().
 */
export function daysUntilBirthday(
  birthday_month: number | null,
  birthday_day: number | null,
  now: Date = new Date(),
): number | null {
  if (birthday_month == null || birthday_day == null) return null;
  if (
    !Number.isInteger(birthday_month) ||
    !Number.isInteger(birthday_day) ||
    birthday_month < 1 ||
    birthday_month > 12 ||
    birthday_day < 1 ||
    birthday_day > 31
  ) {
    return null;
  }

  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = now.getFullYear();
  let target = Date.UTC(thisYear, birthday_month - 1, birthday_day);
  // 올해 생일이 지났으면 내년 생일.
  if (target < todayUtc) {
    target = Date.UTC(thisYear + 1, birthday_month - 1, birthday_day);
  }
  const diffMs = target - todayUtc;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * "D-N" 또는 "오늘" 라벨. 생일 정보 없으면 null.
 */
export function birthdayCountdownLabel(
  birthday_month: number | null,
  birthday_day: number | null,
  now: Date = new Date(),
): string | null {
  const d = daysUntilBirthday(birthday_month, birthday_day, now);
  if (d == null) return null;
  if (d === 0) return "오늘";
  return `D-${d}`;
}

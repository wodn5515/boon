/**
 * 친구별 통계 보강 (PR #9 / `/friends/[id]` 추가 통계 섹션).
 *
 * dashboard 위젯 D 의 카테고리 분포가 친구 한 명에 대해 이미 재활용되고 있다 — 본 모듈은
 * 그 옆에 끼워넣을 두 번째 통계 슬라이스를 위해 entries 배열에서 파생되는 형태를 잡는다.
 *
 * 디자이너 라운드 골격 — 본격 결합은 worker 가 page.tsx 또는 별도 SQL aggregate 에서 수행.
 * 친구 상세 페이지가 이미 `listEntriesByFriend(friend.id)` 결과를 한 번 fetch 해서 카테고리 분포를
 * 같은 배열로 in-memory aggregate 하는 패턴(004 §C / page.tsx::aggregateByCategory) 과 동일하게,
 * 본 모듈도 entries 배열을 입력으로 받는 순수 함수로 노출한다.
 * - 친구 한 명의 entries 는 보통 수십~수백 row 라 in-memory aggregate 가 충분히 저렴.
 * - worker 가 별도 SQL aggregate 쿼리를 만들 필요 없음 → 슬라이스가 깔끔.
 * - 본 함수들은 server/client 양쪽에서 모두 호출 가능 (순수 함수 + Date / Intl 만 사용).
 */

import type { Entry } from "@/lib/entries/types";

/**
 * 월별 받은 신세 누적 추이 데이터 row.
 *
 * - `month` 은 정렬·키로 쓸 "YYYY-MM" 형식 (예: "2025-04"). 차트 X 축 카테고리 키이자
 *   ResponsiveContainer 가 동일한 row 를 식별할 때 쓰는 dataKey.
 * - `label` 은 화면에 보이는 짧은 라벨 (예: "4월" 혹은 "2024.11"). 디자이너 라운드에서는
 *   12개월 안쪽이면 "M월", 그보다 길면 "YY.M" 으로 끊는다.
 * - `count` 는 그 달에 받은 신세 건수. 0 도 포함 — 빈 달은 차트에서 갭 없이 평평하게 보여야
 *   "이 친구한테 한동안 신세를 안 받았던 구간" 회상이 자연스럽다.
 */
export type MonthlyTrendDatum = {
  month: string;
  label: string;
  count: number;
};

/**
 * 친구 활동 요약 — 첫/마지막 신세 날짜와 평균 간격.
 *
 * - 신세가 0건이면 모든 필드 null.
 * - 신세가 1건이면 first/last 는 동일 날짜, averageIntervalDays 는 null
 *   (한 점으로는 간격이 정의되지 않음 — 표시도 생략).
 * - 평균 간격은 첫 신세부터 마지막 신세까지의 총 일수를 (N-1) 로 나눈 정수 (반올림).
 */
export type FriendActivitySummary = {
  firstDate: string | null;
  lastDate: string | null;
  averageIntervalDays: number | null;
};

/**
 * 월별 추이 집계.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - **가변 윈도우 (12개월 고정 아님)** 채택:
 *     - 친구별 데이터 양은 천차만별 — 어떤 친구는 작년 한 달만, 어떤 친구는 5년치.
 *     - 12개월 고정으로 자르면 "그 이전 신세는 차트에서 사라진" 인상을 주는데,
 *       이건 회상 노트 톤(PRD §2) 과 정면 충돌. 받은 기억이 화면에서 사라지면 안 된다.
 *     - 대신 데이터 양이 적을 때(<6 months span)는 최소 6개월 폭으로 패딩,
 *       많을 때는 자연스럽게 first → last 사이 모든 달을 0 포함해 채워 평평한 흐름을 보존.
 *   - **빈 달 0 채움** — 위와 같은 이유. 신세가 없던 달도 차트 X 축에 자리를 잡아야
 *     "이 친구와 잠시 거리감이 있었구나" 같은 자연스러운 회상이 가능.
 *   - **라벨 포맷 동적**: 윈도우가 12개월 이내면 "M월", 그보다 길면 "YY.M".
 *     X 축 라벨이 길어지면 모바일에서 겹쳐서 가독성 떨어진다.
 *
 * 거절된 대안:
 *   - **12개월 고정 윈도우** — 단순하지만 위 회상 노트 톤 위배. PR 설명에 적힌 "12개월 또는
 *     데이터에 따라 가변" 중 가변을 택한 이유가 이거다.
 *   - **3/6/12 토글** — PRD §3 의 friend 상세 통계에 토글이 명시 안 됐고, V1 골격에 부속
 *     컨트롤이 늘어나는 게 회상 노트 미니멀 톤과 안 맞음. V2 후순위.
 *
 * @param entries 친구 한 명에 대한 신세 배열 (정렬 무관).
 * @param now 테스트 친화 — 기본은 현재 시각. 윈도우 패딩에 사용.
 */
export function aggregateMonthlyTrend(
  entries: ReadonlyArray<Entry>,
  now: Date = new Date(),
): ReadonlyArray<MonthlyTrendDatum> {
  if (entries.length === 0) return [];

  // 각 entry 의 received_date → "YYYY-MM" 키로 그룹.
  const counts = new Map<string, number>();
  let minKey = "";
  let maxKey = "";
  for (const e of entries) {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(e.received_date);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!minKey || key < minKey) minKey = key;
    if (!maxKey || key > maxKey) maxKey = key;
  }
  if (!minKey || !maxKey) return [];

  // 윈도우 결정: first → max(last, now) 사이를 채운다.
  // 가변이지만 너무 짧으면(<6) 6개월 폭으로 패딩 — 빈 차트가 휑하지 않도록.
  const todayKey = formatMonthKey(now.getFullYear(), now.getMonth() + 1);
  const endKey = maxKey > todayKey ? maxKey : todayKey;

  // 결정 로그 011 §C-4 — 비정상 입력(minKey → endKey 가 1000개월 이상)은 빈 배열 반환.
  //   padIfShort 가 padding 으로 보정하기 전에 윈도우 폭 자체를 점검한다. padIfShort 가 호출하는
  //   enumerateMonths 가 가드 초과 시 [] 를 반환하면 padIfShort 가 잘못 "짧은 윈도우" 로 인지해
  //   6개월 패딩으로 우회하기 때문에 상위에서 명시 분기.
  if (monthsSpan(minKey, endKey) > 1000) return [];

  const startKey = padIfShort(minKey, endKey);

  // start → end 사이 모든 달을 0 채움.
  const result: MonthlyTrendDatum[] = [];
  const months = enumerateMonths(startKey, endKey);
  if (months.length === 0) return [];
  const useShortLabel = months.length <= 12;
  for (const key of months) {
    const [y, mo] = key.split("-").map(Number);
    result.push({
      month: key,
      label: useShortLabel ? `${mo}월` : `${String(y).slice(2)}.${mo}`,
      count: counts.get(key) ?? 0,
    });
  }
  return result;
}

/**
 * 활동 요약 — 첫/마지막 신세 날짜와 평균 간격(일).
 *
 * 디자이너 자율 결정:
 *   - 평균 간격은 단순 평균 (총 폭 / (N-1)) — 분산/표준편차 같은 통계 노출은 회상 노트 톤이 아님.
 *   - 1건 이하 시 평균 null → UI 에서 표시 생략 (분기는 컴포넌트가 처리).
 *   - 날짜는 ISO "YYYY-MM-DD" 그대로 반환 — 한국어 포맷(YYYY년 M월 D일) 은 UI 레이어에서.
 */
export function summarizeActivity(
  entries: ReadonlyArray<Entry>,
): FriendActivitySummary {
  if (entries.length === 0) {
    return { firstDate: null, lastDate: null, averageIntervalDays: null };
  }
  // received_date 가 "YYYY-MM-DD" 라 lexicographic 정렬이 곧 시간 정렬.
  const dates = entries
    .map((e) => e.received_date)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (dates.length === 0) {
    return { firstDate: null, lastDate: null, averageIntervalDays: null };
  }
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  if (dates.length < 2) {
    return { firstDate, lastDate, averageIntervalDays: null };
  }
  const spanDays = diffDays(firstDate, lastDate);
  // (N-1) 로 나눠야 "N건 사이 N-1개의 간격" 의 평균이 된다.
  const averageIntervalDays = Math.round(spanDays / (dates.length - 1));
  return { firstDate, lastDate, averageIntervalDays };
}

/**
 * "YYYY년 M월 D일" 한국어 포맷 — 활동 요약 카드에서 회상 톤 카피에 끼워 넣는다.
 *
 * UI 컴포넌트가 직접 쓰는 헬퍼라 stats.ts 에 두는 게 응집도가 높다.
 * `formatReceivedDate` (entries/types.ts) 는 "오늘/어제/YYYY.M.D" 친근 포맷이라
 * 회상 카피 ("처음 받은 신세는 ...이에요") 톤에 맞지 않음 — 별도 헬퍼로 분리.
 */
export function formatKoreanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${y}년 ${Number(mo)}월 ${Number(d)}일`;
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function formatMonthKey(year: number, month1based: number): string {
  return `${year}-${String(month1based).padStart(2, "0")}`;
}

/**
 * "YYYY-MM" 두 키 사이의 월 폭 (inclusive). startKey > endKey 면 0.
 * enumerateMonths 의 1000개월 가드와 정합 — 결정 로그 011 §C-4 의 비정상 입력 차단용.
 */
function monthsSpan(startKey: string, endKey: string): number {
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  const span = (ey - sy) * 12 + (em - sm) + 1;
  return span > 0 ? span : 0;
}

/**
 * minKey → endKey 사이 윈도우가 6개월 미만이면 6개월 폭으로 패딩.
 * 첫 신세가 endKey 한두 달 전이면 차트가 너무 휑하므로 endKey 기준 -5개월까지 끌어준다.
 */
function padIfShort(minKey: string, endKey: string): string {
  const months = enumerateMonths(minKey, endKey);
  if (months.length >= 6) return minKey;
  // endKey 기준 5개월 전 (총 6개월 폭).
  const [ey, em] = endKey.split("-").map(Number);
  const baseDate = new Date(ey, em - 1 - 5, 1);
  return formatMonthKey(baseDate.getFullYear(), baseDate.getMonth() + 1);
}

function enumerateMonths(startKey: string, endKey: string): string[] {
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  const out: string[] = [];
  let y = sy;
  let m = sm;
  // 안전 가드: 1000개월 (≈83년) 이상이면 비정상 입력 — 빈 배열 반환.
  // 결정 로그 011 §C-4 — 주석의 의도(빈 배열 반환) 와 동작을 일관화. 가드 초과 시 누적된
  // 결과를 모두 버리고 []. aggregateMonthlyTrend 가 받으면 상위에서도 [] 로 전파된다.
  let guard = 0;
  while (guard++ < 1000) {
    out.push(formatMonthKey(y, m));
    if (y === ey && m === em) return out;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return [];
}

function diffDays(isoA: string, isoB: string): number {
  const [ay, am, ad] = isoA.split("-").map(Number);
  const [by, bm, bd] = isoB.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

---
slice: friend-detail-stats (PR #9)
base: stage
worktree: .worktrees/feature-friend-stats
date: 2026-05-13
status: in-progress (worker 통합 검증 대기)
---

# 010. 친구 상세 추가 통계 보강 + PR #8 #3 청산

`/friends/[id]` 친구 상세 페이지의 통계 카드 보강. PRD §3 의 "친구별 통계 (총 신세 수, 카테고리 분포)" 는 이미 PR #6(dashboard 위젯 D 재활용) 에서 결합됨. 본 슬라이스는 회상 노트 톤(PRD §2) 정합 자연 확장 + PR #8 #3 mock 시연 버튼 production 가드 청산.

V1 10/10 슬라이스. 이후 V1 마무리 메타로 진입.

---

## §A. 추가 통계 두 가지 — 월별 추이 + 활동 요약

PRD §3 의 "친구별 통계" 가 이미 결합됐다는 전제에서, 회상 노트 톤(시간의 흐름·자연 메타포·부드러운 환기) 에 가장 정합한 두 통계만 추가:

1. **월별 받은 신세 누적 추이** — 친구와의 시간선이 어떻게 흘러왔는지
2. **활동 요약** — 첫 신세 / 마지막 신세 / 평균 간격(일)

**거절된 대안**:
- 보답 시점별 분포(anytime/birthday/event/date) — 의미 약함, 시각적 잡음
- 카테고리 카드를 클릭 시 filter 토글 — 친구 상세 컨텍스트에서 인터랙션 가치 낮음
- 친구당 entries aggregate SQL 신설 — in-memory aggregate 로 충분(아래 §I)

## §B. 차트 — Recharts AreaChart (BarChart 거절)

디자이너 자율 판단 1 채택. "추이" 의미가 회상 톤·식물 메타포 정합. Bar 는 절대값 비교 인상이 강해 시간선 표현에 맞지 않음.

**거절된 대안** (디자이너 보고 인용):
- BarChart — 톤 위배
- LineChart — 면적 인상 약함
- 누적 Area — 단일 시리즈라 의미 없음

## §C. 가변 윈도우 + 6개월 최소 패딩

디자이너 자율 판단 2 채택. 12개월 고정은 그 이전 신세가 화면에서 "사라지는" 인상 → 회상 노트 톤 위배. 대신:
- 데이터 범위에 따라 윈도우 가변
- 윈도우 폭이 6개월 미만이면 직전 달까지 패딩 (`endKey - 5개월` 로 startKey 끌어줌)

test-writer 시나리오 7 (`[2024-01-01, 2024-04-01]` + `now=2024-04-30` → `[2023-11..2024-04]`, counts `[0,0,1,0,0,1]`) 가 정책의 명시적 구체화로 잠금.

**거절된 대안**:
- 12개월 고정 — 사라지는 인상
- 3/6/12 토글 — 컨트롤 추가가 미니멀 톤 위배 + PRD §3 미명시
- 윈도우 없음 (모든 기간) — 첫 신세 N년 전이면 차트가 휑함

## §D. 빈 달 0 채움

디자이너 자율 판단 3 채택. "이 친구와 잠시 거리감이 있었던 구간" 도 회상 노트 풍경의 일부. 0 인 달을 0으로 그려야 사용자가 신세가 정말 없었던 시기를 인지.

## §E. 단색 그라데이션 (--brand-primary → 투명)

디자이너 자율 판단 4 채택. 한 친구 = 한 시리즈라 카테고리 색을 섞지 않음. 카테고리 분포 차트(다색 PieChart, 위젯 D + 친구 상세 결합) 와 톤 구분.

## §F. X축 동적 라벨 + Y축 hide

디자이너 자율 판단 5·6 채택.
- ≤12개월: "M월"
- >12개월: "YY.M"
- `tickInterval` 도 12/24/24+ 구간별로 0/1/2 자동
- Y축 hide — 숫자 축이 부담스러운 회상 노트 톤. Tooltip 만 정확값 표시 (표제: "YYYY년 M월")

## §G. 활동 요약 3통계 한 카드 + "마음" 어휘 변주

디자이너 자율 판단 7 채택. 카드 3개 분할은 페이지 상단 통계 카드 2개와 합쳐 시각 잡음. 한 카드 안 3-grid 가 단정.

카피:
- "처음 받은 신세는 {{date}}이에요"
- "가장 최근 신세는 {{date}}"
- "평균 {{N}}일에 한 번 **마음**을 받았어요" — "신세" 단어 반복 회피로 어휘 변주

**거절된 대안**:
- 카피 없는 숫자만 — 회상 노트 톤 위배
- "X일 만에 한 번 만나왔어요" 인격화 — 실제 만남이 아닌 기록 간격이라 사실 왜곡

## §H. 1건 이하 평균 간격 null 분기 + 부드러운 환기 카피

디자이너 자율 판단 8 채택. 신세 1건 이하 시 `averageIntervalDays = null`. UI 는 그 자리에 부드러운 카피로 자리 유지:

> "신세가 한 번 더 쌓이면 평균 간격도 보여드려요"

빈 칸 대신 회상 톤 카피로 grid 균형 유지.

## §I. in-memory aggregate (별도 SQL 거절)

디자이너 자율 판단 11 채택. 별도 `getFriendStats` SQL aggregate 쿼리를 만들지 않고, 기존 `listEntriesByFriend` 결과를 page.tsx 에서 `aggregateMonthlyTrend()` / `summarizeActivity()` 두 함수에 그대로 흘림.

**근거**:
- 카테고리 분포(`aggregateByCategory`) 와 동일 패턴 — 친구 상세는 어차피 전체 entries 를 타임라인으로 렌더하므로 SQL 라운드트립 추가 가치 0
- worker 결합 부담 ↓ — 별도 정정-1 SQL 작성 불필요
- in-memory 처리도 친구당 entries 가 50~500건 규모로 부담 없음

**거절된 대안**:
- 별도 SQL aggregate — 라운드트립 증가, 정정-1 패턴 중복 작성
- DB view — V1 토이 단계 과잉

## §J. 아이콘 셋

디자이너 자율 판단 9 채택. 활동 요약 카드 3통계에 각각:
- 첫 신세: `CalendarHeart` (`--brand-primary`)
- 최근 신세: `CalendarCheck` (`--brand-light`)
- 평균 간격: `Hourglass` (`--brand-lime`)

3종 카테고리 색 시스템(物質/時間/마음) 과 톤 정합.

## §K. `formatKoreanDate` 헬퍼 분리

디자이너 자율 판단 10 채택. `lib/friends/stats.ts::formatKoreanDate(yyyymmdd)` → `"2024년 11월 23일"` 자연어 한국어 포맷. zero-padding 없음.

`entries/types.ts::formatReceivedDate` 는 "오늘/어제/YYYY.M.D" 친근 포맷이라 회상 카피 톤("처음 받은 신세는 ...이에요") 에 안 맞음 → 별도 헬퍼.

## §L. test-writer 라운드 — 디자이너 골격 잠금 (TDD 가 아닌 회귀 방어선)

본 슬라이스의 본질은 **디자이너 골격을 회귀 방어선으로 잠그기**. test-writer 보고 §1 채택:

- 디자이너 라운드(279e4ef)에서 `lib/friends/stats.ts` 의 3 헬퍼 + 2 컴포넌트 + page.tsx 결합까지 본격 결합이 모두 완료됨
- worker 가 본 슬라이스에서 추가로 만들 실패 빨강은 없음
- 17/17 spec 이 첫 시도부터 통과 — **의도된 결과**

008·009 의 "디자이너 골격 → worker 본격 결합" 패턴과 다른 형태(디자이너가 본격 결합까지 흡수). 본 슬라이스는 회상 노트 톤 정합 추가 통계라 SQL/Server Action 신규 0건, in-memory aggregate 로 끝나기 때문.

worker 라운드 역할:
- 통합 검증 (npm test + e2e + typecheck + lint 점검)
- README 동기화 점검 (본 슬라이스는 신규 라우트 없음 — 변경 없음 예상)
- peer 검증 호출 (lint + sfx)
- PR 생성

worker 가 본격 코드를 만들 필요는 없음. 다만 `aggregateMonthlyTrend` / `summarizeActivity` 가 in-memory 라 정정-1 SQL 누락 위험 0 — sfx 라운드도 가벼움 예상.

## §M. NODE_ENV mock 버튼 가드 spec 생략

test-writer 보고 §3 채택. PR #8 #3 청산 커밋(`813c254`) 의 `process.env.NODE_ENV !== "production"` 가드는:
- production build 모드에서만 의미 발현 → dev 모드 E2E 흐름으로는 자연스러운 잠금 어려움
- 단위 레이어도 build-time 분기라 부자연
- **코드 리뷰로 충분** — 1 줄 가드 + production 빌드에서 mock 데이터 import 자체가 안 됨

**거절된 대안**:
- Playwright build 모드 별도 spec — 본 슬라이스 범위 밖, V1 마무리 메타 슬라이스에서 검토 가능
- vitest 환경 변수 모킹 spec — build-time 분기는 환경 변수 모킹으로 재현 어렵고 회귀 잠금 의미 약함

## §N. Recharts SVG selector — 그대로 두고 깨지면 후속 라운드

test-writer 보고 §4 채택. 시나리오 4 의 차트 SVG 검증이 `svg.recharts-surface` 클래스 의존 — Recharts 업그레이드 시 깨질 가능성 0이 아니지만, V1 토이 단계에서 `data-testid="monthly-trend-chart"` 명시 hook 까지 가는 건 과잉. 현재 통과하면 그대로 두고 깨지면 worker 라운드에서 hook 추가.

## §O. PR #8 #3 청산 — mock 시연 버튼 production 가드

`813c254` 커밋으로 청산:
- `components/import/step-1-upload.tsx` 의 "예시 파일로 흐름 살펴보기" Button 을 `process.env.NODE_ENV !== "production"` 가드로 감쌈
- production 빌드에서는 mock 버튼 자체가 렌더되지 않음
- dev 에서는 그대로 시연 가능 (009 §M-5 정합 — mock 시연 흐름 보존)

본 슬라이스에서 청산 사유:
- 사용자 가시 잠재적 데이터 오염 (호기심에 mock 데이터로 끝까지 진행 시 fixture 친구가 본인 친구 목록에 추가) 의 우선순위 = "다음 슬라이스 첫 작업 가치 있음" (PR #8 리뷰 §🟢 #3 명시)
- 1 줄 가드 + 도메인 영향 0 → friend-stats 슬라이스에 자연 묶음

## §P. PR #6·#7·#8 잔여 리뷰 트레이스 (V1 마무리 메타 이관)

본 슬라이스 외 이관 목록:

| PR | 항목 | 상태 |
|---|---|---|
| #6 | TZ 종속 🟡 S1 | V1 마무리 메타 |
| #6 | 위젯 D byCategory N+1 🟢 N2 | V1 마무리 메타 |
| #6 | locale collation | V1 마무리 메타 |
| #7 | parseDate semantic validation 🟢 | V1 마무리 메타 |
| #7 | data-memo attribute 길이 🟢 | V2 deferred |
| #7 | reorderEntries tiebreak 🟢 | V2 deferred |
| #7 | getRecentEntries 위임 분리 💬 | V2 메모 |
| #8 | formatAmount ↔ buildMemo 한국어 단위 일관화 🟢 | V1 마무리 메타 |
| #8 | ImportStepper cursor·aria-disabled 🟢 | V1 마무리 메타 |
| #8 | mock 시연 버튼 production 가드 🟢 | **본 슬라이스 청산** (§O) |
| #8 | XLSX.read file size limit 🟢 | V1 마무리 메타 |
| #8 | e2eBulkImportEntries partial atomicity 💬 | V2 메모 (통합 spec 이 본질 잠금) |

V1 마무리 메타에서 한 묶음 청산 + Vercel production 배포 점검 + README 정리.

## §Q. V2 메모

- 친구 상세 차트 인터랙션(month bar 클릭 → 해당 월 entries 필터링)
- 보답 시점별 분포 시각화 (V1 톤 위배라 거절했지만 V2 사용자 요청 있으면 재검토)
- 평균 간격 기반 "회상 환기 알림" (회상 노트 톤 정합) — 알림 시스템 V2

## §R. README 동기화

본 슬라이스에서 README 갱신 점검:
- 사이트맵 변경 없음 (기존 `/friends/[id]` 라우트의 통계 카드 보강)
- 스택 변경 없음 (Recharts 이미 사용 중)
- 데이터 모델 변경 없음

worker 라운드에서 변경 없음 확인하고 미수정 유지.

## §T. peer 라운드 결과 (worker 통합 검증 직후)

| 라운드 | lint | sfx |
|---|---|---|
| 1 | 🟢 PASS + 🟡 1건 (TODO 주석) | 🔴 0 / 🟡 2 / 🟢 3 |

sfx 라운드 발견 → 모두 V1 마무리 메타 이관 (본 슬라이스 보안 의도 완전 달성, 본 슬라이스 청산 우선순위 낮음):

### 🟡 should
1. **`lib/import/mock.ts` production 번들 잔존** — `components/import/import-wizard.tsx:16` 의 unconditional import 의존. 813c254 의 production 가드는 사용자가 mock 흐름에 진입하는 경로(보안 의도)는 완전 차단했지만, mock 모듈 코드 자체가 번들에 포함됨. V1 토이 단계에서 번들 사이즈 중요도 낮음 → V1 마무리 메타에서 dynamic import 또는 NODE_ENV 분기로 청산 가능.
2. **`lib/friends/stats.ts:94` `todayKey` TZ 경계 1개월 시프트** — Date.UTC 사용했지만 시스템 TZ 가 UTC-12 등 극단인 경우 경계 1개월 시프트 가능. 실질 영향 매우 제한적 (windowstartKey 1개월), Asia/Seoul 정착하는 V1 마무리 메타에서 PR #6 🟡 S1 와 한 묶음 청산.

### 🟢 nit
- `MOCK_MONTHLY_TREND` 미사용 export — 디자이너가 컴포넌트 단위 테스트/스토리북 용도로 남긴 것이지만 현재 사용처 없음. 정리 가능 (V2 또는 V1 마무리 메타).
- `aggregateMonthlyTrend` 의 `maxKey > todayKey` 시드 시연 데이터(미래 received_date) 가 들어왔을 때 edge case — V1 spec 0건이라 실 위험 0.
- 디자이너 라운드 TODO 주석 1건 — V1 마무리 메타에서 cleanup.

010 §P "PR #6·#7·#8 잔여 리뷰 트레이스" 표에 본 슬라이스 sfx 새 발견 2건 추가 이관:

| sfx 🟡 | mock 번들 잔존 (`lib/import/mock.ts` import-wizard:16) | V1 마무리 메타 |
| sfx 🟡 | `lib/friends/stats.ts::todayKey` TZ 경계 (PR #6 🟡 S1 와 동일 카테고리) | V1 마무리 메타 |

## §U. V1 10/10 슬라이스 도착

본 PR #9 머지로 V1 코드 슬라이스 10건 완료:

| # | 슬라이스 | PR |
|---|---|---|
| 1 | Next.js 부트스트랩 + 디자인 토큰 | #1 |
| 2 | Google OAuth 인증 게이트 | #2 |
| 3 | 친구 CRUD | #3 |
| 4 | 카테고리 CRUD + /settings | #4 |
| 5 | entries CRUD | #5 |
| 6 | 메인 대시보드 위젯 4종 | #6 |
| 7 | /entries 리스트·검색 페이지 | #7 |
| 8 | 엑셀 import 5단계 워크플로우 | #8 |
| 9 | **친구 상세 추가 통계** (본 PR) | #9 |
| 10 | V1 마무리 메타 (다음 슬라이스) | — |

다음 슬라이스 = V1 마무리 메타 — `/meta` 흐름 (디자이너·TDD 게이트·팀 spawn·peer 검증 모두 생략, Lead 단독 작업). 청산 목록:

- PR #6 잔여: TZ 종속 🟡 S1 + 위젯 D byCategory N+1 🟢 N2 + locale collation
- PR #7 잔여: parseDate semantic validation 🟢
- PR #8 잔여: formatAmount ↔ buildMemo 한국어 단위 일관화 🟢 / ImportStepper cursor·aria-disabled 🟢 / XLSX.read file size limit 🟢
- PR #9 잔여(본 §T): mock 번들 잔존 🟡 / todayKey TZ 경계 🟡 / MOCK_MONTHLY_TREND 미사용 🟢 / TODO 주석 🟢
- Vercel production 배포 점검 + 환경 변수 동기화
- README 정리 (V1 사이트맵 최종본 + 스택)

V2 deferred (3건): data-memo 길이 / reorderEntries tiebreak / e2eBulkImportEntries partial atomicity.

## §S. 메타 노트 — 디자이너 골격이 본격 결합까지 흡수한 첫 케이스

008 메타 노트("디자이너는 결정 로그 손대지 마라") 정합 + 009 첫 실행 + 본 010 두 번째 실행. 추가로 본 010 은 **디자이너 라운드가 worker 본격 결합까지 흡수한 첫 케이스**.

근거:
- SQL/Server Action 신규 0건 (in-memory aggregate)
- 정정-1 패턴 재작성 불필요 (기존 `listEntriesByFriend` 결과 재활용)
- 디자이너의 도메인 = UI + 헬퍼 = 본 슬라이스 전체

향후 슬라이스에서 동일 패턴(데이터 변경 0 + UI/헬퍼만) 이 다시 나오면, worker 라운드를 통합 검증 + peer + PR 생성 으로 축소하는 운영 가능. 다만 SQL/Server Action/데이터 모델 변경이 있는 슬라이스는 worker 본격 결합 유지 (008·009 패턴).

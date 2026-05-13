# 008-entries-list-page: `/entries` 신세 리스트·검색 페이지 UI 골격

> 작성: 2026-05-13  /  작성자: Lead 에이전트 (designer)
> 관련 작업: `feature/entries-list` (베이스 origin/stage, acfa19b — PR #6 머지 후)

## 배경
PRD §3 / §5 의 `/entries` 슬라이스에 진입한다. PR #6 까지 V1 핵심 4종(친구·카테고리·신세·대시보드) + 위젯 5종이 결합돼 있고, 본 슬라이스가 다음 두 가지를 묶는다.

- **위젯 A "전체 보기" → /entries**: 메인 대시보드 위젯 A 의 `viewAllHref` 기본값이 이미 `/entries` 였으나 (007 §G), 실제 페이지가 비어 있어 미결합 상태였다. 본 슬라이스에서 페이지를 신설하면 위젯 A 컴포넌트 자체는 손대지 않고 결합이 완성된다.
- **검색·필터 한 곳에 모음**: PRD §3 "신세 리스트 / 검색" — 텍스트 검색(메모) / 친구·카테고리·날짜 범위 필터 / 정렬. 친구 목록(`/friends`)이 이미 URL searchParams + 즉시 클라이언트 필터 + Enter URL 동기화 (004 §D) 의 패턴을 잡아 둬 동일 패턴을 확장.

본 PR 의 디자이너 라운드는 페이지 골격 + EntryItem 친구 표시 + 필터 바 컴포넌트 + queries 시그니처 placeholder + mock 까지. 실제 SQL 결합·Server Action 결합·E2E 시나리오는 후속 worker / test-writer 라운드.

## 결정

### A. 페이지 레이아웃
`app/(authenticated)/entries/page.tsx` — Server Component. URL searchParams 로 `q / friend / category / from / to / sort` 를 받아 mock 위에서 골격 필터링·정렬·count 표시.

레이아웃 (위→아래):
1. **헤더** — "받은 신세" 타이틀 + 부제 + 우상단 "엑셀 가져오기" 버튼(placeholder, 다음 슬라이스에서 결합)
2. **필터 바 카드** — `<EntriesFilterBar />` (Client Component, GET form): 검색 input · 친구 select · 카테고리 select · from/to date · 정렬 select + "초기화" link
3. **결과 영역** — "N건 표시 중" 카운트 + `<ul>` of `<EntryItem showFriend />`
4. **빈 상태** — 필터 결과 없음 vs 데이터 자체 없음 두 분기

### B. URL searchParams 키와 정렬 기본값
- `q` — 메모 텍스트 검색 (case-insensitive substring)
- `friend` — friend_id
- `category` — category_id
- `from` / `to` — ISO date (YYYY-MM-DD)
- `sort` — `recent` (기본) / `oldest`

기본 정렬은 위젯 A·`/friends/[id]` 타임라인과 동일한 `received_date DESC, created_at DESC`. 사용자가 `sort=oldest` 를 명시하면 둘 다 ASC.

### C. 즉시 클라이언트 필터 + Enter URL 동기화
- `FriendsListSearch` (004 §D) 의 패턴 그대로 채택: 필터 바는 GET form 으로 submit 시 `/entries?...` 로 URL 갱신, 입력하는 동안에도 부모 `<ul>` 의 `<li data-entry-*>` 속성을 읽어 클라이언트에서 즉시 숨김/표시.
- `<EntryItem />` `<li>` 에 `data-friend-id` / `data-category-id` / `data-received-date` / `data-memo` 메타를 노출 → 필터 바가 attribute lookup 으로 동기 매칭. 이 속성들은 검색 UX 외 사이드 이펙트 없음.

### D. 페이지네이션 — V1 은 "최근 50건" 한도, 페이지네이션 V2
- mock 시연 시 결과가 적어 50건 한도가 화면을 다 채우지 못한다. V1 사용자 데이터 규모(개인 노트, 보통 수십~수백 건)에서 50건 한도가 회상 노트 톤상 충분. 추후 사용자 데이터가 늘어나면 V2 에서 무한 스크롤/페이지네이션 재논의.
- "표시 중인 50건 중 N건이 필터에 해당" 같은 메시지 대신 "N건 표시 중" 단일 카피로 단순화 (Boon 회상 노트 톤).

### E. EntryItem `showFriend` 모드 확장
- `components/entries/entry-item.tsx` 이미 `showFriend` prop 보유 (006). 본 페이지는 친구 아바타+이름 노출을 표준으로 사용.
- 클라이언트 필터 매칭용 data 속성을 `<li>` 에 attach. EntryItem 컴포넌트 자체에 추가.
- 이 외 시각 변경 없음 — `/friends/[id]` 에서 `showFriend={false}` 호출 그대로 호환.

### F. `listEntriesFiltered` 시그니처 placeholder
`lib/entries-list/queries.ts` 새 파일. 본 슬라이스에서는 시그니처와 JSDoc 만 정의하고 본체는 mock 위에서 골격 필터링 (worker 가 SQL 본격 결합 시 mock 분기 삭제 + drizzle 본체로 교체).

```ts
export async function listEntriesFiltered(params: {
  q?: string;
  friendId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  sort?: "recent" | "oldest";
  limit?: number; // 기본 50
}): Promise<ReadonlyArray<Entry>>
```

본 함수는 향후 `getRecentEntries(limit)` (dashboard 위젯 A) 의 자연스러운 superset 이다 — limit 만 주면 동일 결과. worker 가 합칠지(dashboard.queries 의 getRecentEntries 를 listEntriesFiltered 위로 위임) 본격 결합 시 판단.

### G. mock 데이터 위치 — `lib/entries-list/mock.ts`
- 페이지·필터·EmptyState 분기 시연용. 친구·카테고리는 함께 inline 으로 mock (실제 슬라이스에서 listFriends/listCategories 결합 시 제거).
- mock 은 디자이너 시연 / typecheck 통과만 목적. worker 가 본격 결합 시 lib/entries-list/queries.ts 의 mock 분기와 함께 삭제.

### H. 위젯 A 결합
위젯 A 컴포넌트 자체는 PR #6 에서 이미 `viewAllHref="/entries"` 가 기본값이다. 본 슬라이스가 `/entries` 페이지를 신설하면 클릭 → 페이지 진입이 자동 결합. 위젯 A 컴포넌트 수정 없음.

## 근거
- **004 §D 패턴 재사용**: 친구 목록 검색이 URL searchParams + 즉시 클라이언트 필터 + GET form 의 트리오로 RSC 친화 + 공유 가능 URL + 즉시 반응을 모두 만족시켰다. 같은 톤으로 entries 검색도 자연스럽게 확장된다.
- **007 §G 톤 일치**: 위젯 A 의 compact row 는 액션이 없는 정보 표시용, `/entries` 는 본 페이지로서 수정·삭제 액션을 노출. EntryItem 이 이미 양쪽 구분을 prop 으로 표현하고 있어 추가 컴포넌트 없이 재사용.
- **mock 위 골격 → worker 본격 결합** 패턴: 002·004·005·006·007 모두 디자이너 라운드에서 mock + queries 시그니처 placeholder 만, worker 가 SQL 결합 + E2E + sfx 라운드를 진행. 본 슬라이스도 동일.
- **V1 페이지네이션 회피**: 회상 노트 톤상 무한 스크롤은 회상의 단위를 흐린다. 50건 한도는 사용자가 한 번에 "최근 신세 한 묶음" 을 인지하는 범위.

## 거절된 대안
- **(A) 전체 페이지를 Client Component 로 만들고 fetch 로 데이터 끌어오기** — RSC 친화 패턴 깨짐. URL 공유 시 SEO/캐시 손해. 004 §D 와 어긋남.
- **(B) 무한 스크롤 / 페이지네이션을 V1 부터** — V1 데이터 규모상 과잉. mock 50건 + V2 페이지네이션이 충분.
- **(C) Radix Select 로 친구·카테고리 필터 구현** — Radix Select 는 GET form 의 native submit 흐름과 잘 안 맞아 hidden input 보강이 필요. native `<select>` 가 GET form 패턴에 더 자연스럽고 모바일 OS 휠도 그대로 지원.
- **(D) 검색을 메모 외에 친구 이름까지 확장** — 친구 이름은 별도 `friend` 필터로 이미 다룬다. 검색 input 이 두 의미를 동시에 가지면 디버깅·UX 모호. V1 에서는 메모 텍스트만.
- **(E) "갚음" 토글 필터를 본 슬라이스에 같이 추가** — PRD §3 본 슬라이스 명세에 없음. V2 에서 갚음 워크플로우 정립 시 함께 도입.

## 후속 영향
- worker 라운드:
  - `lib/entries-list/queries.ts::listEntriesFiltered` 본체 SQL 결합 (정정-1 패턴 + friends.is_deleted=false + categories JOIN). E2E bypass 분기 함께.
  - `lib/dashboard/queries.ts::getRecentEntries` 가 본 함수의 자연 케이스 (limit=5, 정렬=recent) 와 동일 — 위임 여부 판단.
  - mock 파일들 (`lib/entries-list/mock.ts`) 제거.
  - 페이지 page.tsx 의 mock 호출 → 실제 queries 호출로 swap.
- test-writer 라운드:
  - E2E 시나리오: 필터 5종(검색/친구/카테고리/날짜/정렬) 각각의 결과 동기화, "필터 초기화" 동작, 빈 상태 분기.
  - 단위 테스트: `listEntriesFiltered` 의 빈 검색어/대소문자/날짜 경계 케이스.
- 다음 슬라이스 결합: "엑셀 가져오기" 진입점은 본 슬라이스에서 placeholder 버튼만, 실제 import 페이지는 별도 슬라이스.

---

## Lead 보강 (2026-05-13, append)

본 결정 로그 §A~H는 디자이너 라운드에서 작성됨 (정책상 결정 로그는 Lead 영역이지만 디자이너 자율 결정 정리라 베이스 보존). Lead가 후속 결정 보강:

### I. test-writer 자율 결정 6건 채택
1. **시나리오 21 (URL parsing 헬퍼 단위 spec) 작성 안 함** — `pickFirst/parseSort/parseDate`가 page.tsx 모듈 private 함수. 통합 시나리오 13~18이 결과 의미 잠금 충분. 필요 시 worker 결합 후 sfx 라운드에서 추가
2. **시나리오 19 getRecentEntries 위임 강도** — "같은 데이터에서 같은 memo 시퀀스" 검증. worker가 위임 안 하고 두 함수 평행 유지해도 사용자 가시 결과 동일하면 통과 (worker 자율, 008 §F "후속 영향" 그대로)
3. **시나리오 8 mock 위 통과** — 회귀 잠금 유효, 그대로 유지
4. **시나리오 9 빈 상태** — test-with-reset이 e2e-store 비워줘 자연 해소
5. **PR #6 잔여 일부 청산 명시** — TZ 종속(🟡 S1), N+1(🟢 N2), N4 트레이드오프는 본 슬라이스 작업 외, V2 메모 (§J 참고)
6. spec 직접 커밋(154fbf9) — Lead 정리 부담 줄임

### J. `escapeLike` util 공용화 결정
- 현재 `lib/friends/queries.ts`에 `escapeLike` 함수 있음 (PR #3 sfx 🟢 #8 청산). 본 슬라이스에서 `lib/entries-list/queries.ts::escapeLike` 추가 export 필요한데, **동일 함수 2곳 복제는 부채**
- **worker 결정**: `lib/utils/like-escape.ts` 공용 utility로 추출. `escapeLike(input: string): string` named export. friends·entries-list 모두 거기서 import
- spec(시나리오 20)의 import 경로는 worker가 공용화 후 정해진 경로로 갱신 가능 — 다만 spec 수정은 test-writer 영역. worker는 spec import 경로 잠금 그대로(`lib/entries-list/queries.ts::escapeLike`)을 보존하기 위해 entries-list/queries.ts에서 `export { escapeLike } from "@/lib/utils/like-escape"` re-export
- 결과: spec import 경로 변경 0, 공용 util 통합 ✅

### K. PR #6 사용자 리뷰 잔여 (트레이스 보존)
PR #6 종합 리뷰의 nit·question 중 본 슬라이스에서 청산되는 항목 없음 (모두 V1 마무리 메타 또는 V2 deferred). 본 슬라이스가 직접 다루지 않지만 트레이스 보존 차원에서 명시:

| PR #6 항목 | 상태 |
|---|---|
| 🟡 S1 monthRange/daysUntilBirthday TZ 종속 | V1 마무리 메타 또는 V2 — PR #6 본문 명시 |
| 🟢 N1 localeCompare "ko" | PR #6에서 청산 (68924c6) |
| 🟢 N2 N+1 query (위젯 D byCategory) | V2 — PR #6 본문 명시 |
| 🟢 N3 formatDiff 주석 정합 | PR #6에서 청산 (68924c6) |
| 🟢 N4 (기타) | V2 — PR #6 본문 명시 |
| getTopFriends production vs E2E locale 차이 | V1 마무리 메타에서 collation 정합 (사용자 코멘트 인용) |

### L. README 동기화 점검
- 사이트맵 `/entries` 이미 명시
- 데이터 모델 변경 없음
- "주요 기능" 표 신세 리스트/검색 행 그대로
- 변경 없으면 worker가 PR 본문에 "README 동기화 변경 없음" 명시

### M. V2 메모 추가 (Lead 보강)
- 위젯 D byCategory N+1 해소 (group-by SQL aggregate)
- production vs E2E locale collation 정합 (PostgreSQL collation 명시 또는 application-layer sort 통일)
- monthRange/daysUntilBirthday Asia/Seoul timezone fix
- entries-list 무한 스크롤 / 페이지네이션 (50건 한도 도달 시)

## 결정 로그 작성 권한 메타 노트

정책상 결정 로그는 Lead 영역인데 본 008은 디자이너가 §A~H를 직접 작성했다. 사용자 운영 원칙("Lead 자율 판단 + 결정 로그") 보존을 위해 다음 슬라이스부터:
- 디자이너 에이전트는 결정 로그 손대지 말고 자율 판단 사항만 보고로 정리
- Lead가 보고 받아 결정 로그 작성

다음 슬라이스 디자이너 단발 호출 시 명시. 본 008은 정리되어 있어 베이스 보존.

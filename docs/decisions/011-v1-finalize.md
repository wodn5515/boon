---
slice: v1-finalize (PR #10)
base: stage
worktree: .worktrees/feature-v1-finalize
date: 2026-05-13
status: in-progress (test-writer 대기)
---

# 011. V1 마무리 — 잔여 부채 13건 일괄 청산 + Vercel production 배포 준비

V1 10번째이자 마지막 슬라이스. PR #6·#7·#8·#9 의 리뷰 잔여 부채 13건 청산 + Vercel production 배포 준비 + README V1 최종본 정리. 본 슬라이스 머지 후 V1 = production-ready.

## §A. 슬라이스 흐름 — /work (디자이너 게이트 생략)

청산 13건 중 사용자 가시 동작 변경이 6건(TZ / parseDate / formatAmount 정합 / file size limit / Stepper a11y / mock 번들 dynamic) 포함. CLAUDE.md §9 의 "사용자 가시 변경 → /work" 정합.

디자이너 게이트 생략 — 새 UI 컴포넌트 신규 0건. 모두 기존 컴포넌트의 작은 보강 또는 비-UI 코드 변경.

TDD 게이트는 일부 항목만 (회귀 잠금 가치 있는 6개). 나머지는 worker 가 코드 변경만 + peer 라운드 회귀.

팀 spawn: worker + lint + sfx (peer 검증 필수, CLAUDE.md §13).

## §B. 청산 13건 우선순위 + spec 범위

### 사용자 가시 변경 (6건)

| # | 항목 | 출처 | spec 잠금 |
|---|---|---|---|
| B-1 | `next.config.ts` TZ 정착 (`Asia/Seoul`) | PR #6 🟡 S1 + PR #9 🟡 S2 + PR #9 review 💬 | **unit 잠금** (자정 경계 케이스) |
| B-2 | `parseDate` semantic validation (`/entries` URL) | PR #7 🟢 #1 + PR #9 review § | **e2e + unit 잠금** |
| B-3 | `formatAmount` ↔ `buildMemo` 한국어 단위 정합 | PR #8 🟢 #1 | **unit 잠금** |
| B-4 | `XLSX.read` file size limit (10MB) | PR #8 🟢 #4 | **e2e 잠금** (fixture 부담 → unit 으로 축소 가능) |
| B-5 | ImportStepper 비활성 단계 `aria-disabled` + cursor | PR #8 🟢 #2 + PR #9 review § | **unit (RTL) 잠금** |
| B-6 | mock 번들 dynamic import / 조건부 import | PR #9 sfx 🟡 #1 | **spec 생략** (build-time 분기 검증 어려움) |

### 코드 품질·성능 (4건)

| # | 항목 | 출처 | spec 잠금 |
|---|---|---|---|
| C-1 | `pickGreetingName` `@` 없는 이메일 fallback | PR #6 review § | **unit 잠금** |
| C-2 | `formatDiff` 첫 달 사용자 분기 | PR #6 review § | **unit 잠금** |
| C-3 | `getTopFriends` recent_memo N+1 → 단일 쿼리 | PR #6 review § | **통합 잠금** |
| C-4 | `enumerateMonths` 1000개월 가드 주석/코드 일관화 | PR #9 🟢 nit | **unit 잠금** |

### 코드 정리 (1건)

| # | 항목 | 출처 | spec 잠금 |
|---|---|---|---|
| D-1 | `MOCK_MONTHLY_TREND` 미사용 export 제거 + page.tsx TODO 주석 제거 | PR #9 🟢 nit | **spec 생략** (dead code 정리) |

### 인프라·문서 (2건)

| # | 항목 | 출처 | spec 잠금 |
|---|---|---|---|
| E-1 | Vercel production 배포 점검 + 환경 변수 등록 + 마이그레이션 적용 | Lead 의무 | **Lead 단독** (worker 영역 외) |
| E-2 | README V1 최종본 (사이트맵 + 스택 + 진행 현황) | 본 슬라이스 의무 | **worker 작성** |

## §C. spec 잠금 대상 8건 → test-writer 단발 호출

test-writer 가 다음 8개 spec 을 선작성. 모두 현재 코드 기준 빨갛게 실패해야 함:

1. **B-1 TZ 정착** — `lib/friends/stats.ts::aggregateMonthlyTrend` 가 `now=2024-12-01T00:00:00+09:00` 시 todayKey `2024-12` 잠금. `process.env.TZ = "Asia/Seoul"` 가 적용된 후에야 통과.
2. **B-2 parseDate semantic** — `/entries?from=2026-13-45` 진입 시 정상 페이지 (필터 미적용) + invalid date 가 SQL 까지 흘러가지 않음.
3. **B-3 formatAmount ↔ buildMemo 정합** — `"10만원"` 입력 시 `extractDigitsKoreanAware("10만원")` = `"100000"` 결과를 `formatAmount` 가 같이 사용.
4. **B-4 file size limit** — `XLSX.read` 호출 전 `file.size > 10 * 1024 * 1024` 가드 + 사용자 친화 메시지.
5. **B-5 Stepper a11y** — `<div role="none" aria-disabled="true">` + `cursor-not-allowed` 클래스.
6. **C-1 pickGreetingName `@` 없는 fallback** — `pickGreetingName({email: "noatsign"})` → 빈 문자열 또는 fallback ("친구") 잠금.
7. **C-2 formatDiff 첫 달** — `formatDiff(null)` 또는 `formatDiff(undefined)` 시 "지난 달과 비교할 데이터가 없어요" 류 부드러운 카피.
8. **C-3 getTopFriends 단일 쿼리** — `db` proxy 로 호출 횟수 카운트, top 5 친구 노출 시 SQL 호출 1회.
9. **C-4 enumerateMonths 1000개월 가드** — 비정상 입력 시 빈 배열 반환 (주석 의도 채택).

## §D. spec 생략 5건 사유

- **B-6 mock 번들 dynamic import** — build-time 분기. dev 모드 spec 으로 회귀 잠금 어려움. worker 가 dynamic import 적용 + sfx 가 production 번들 dead code 확인.
- **D-1 dead code 정리** — 코드 삭제. 빨강 만들 spec 없음. lint 가 unused export 검증.
- **E-1 Vercel 배포** — Lead 의무. spec 영역 외.
- **E-2 README** — 문서.

## §E. PR #6 사용자 가시 잔여 (위 C-1, C-2, C-3)

PR #6 리뷰에서 인지된 3건:
- `pickGreetingName` `@` 없는 이메일 fallback — 현재 split("@")[0] 로 처리 → `@` 없으면 전체 그대로 노출. fallback 카피 도입.
- `formatDiff` 첫 달 사용자 — 지난 달 데이터 0건일 때 NaN% / Infinity% 가 노출 가능. 부드러운 카피로 대체.
- `getTopFriends` recent_memo N+1 — top 5 친구 각각 최근 신세 1건을 별도 쿼리로 fetch. LEFT JOIN LATERAL 로 단일 쿼리화 (PR #8 `matchFriendsByName` 패턴 재활용).

## §F. V2 deferred 3건 (본 슬라이스 외)

- PR #7 `data-memo` attribute 길이 — V2 무한 스크롤 시점
- PR #7 `reorderEntries` tiebreak — V2 데이터 정합성 강화
- PR #8 `e2eBulkImportEntries` partial atomicity — 통합 spec 이 본질 잠금

## §G. Vercel production 배포 절차 (Lead 단독)

1. `next.config.ts` TZ 정착 (`env: { TZ: "Asia/Seoul" }`) — worker B-1 청산 후 적용
2. Vercel 프로젝트 환경 변수 등록:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`
   - `NEXT_PUBLIC_APP_URL` = production URL
3. Supabase Google OAuth Redirect URL 갱신 → production URL/auth/callback
4. Supabase production DB 에 drizzle 마이그레이션 적용 (`db/migrations/0001~0008_*.sql`)
5. Vercel 배포 후 실제 동선 점검:
   - 로그인 / OAuth callback
   - 친구 CRUD / entries CRUD / 카테고리 CRUD
   - 엑셀 import (실제 .xlsx 파일)
   - 친구 상세 통계 / 대시보드 위젯 4종 / /entries 리스트

위 4·5 는 사용자 권한 필요. Lead 가 가이드만 PR 본문에 명시하고 사용자가 직접 수행.

## §H. README V1 최종본 (worker 의무, §E-2)

V1 머지 완료 후 README 가 반영해야 할 사항:
- 슬라이스 10건 완료 목록 (정정-1 / 단일 진실 원천화 / 디자이너 흡수 패러다임 한 줄씩)
- 사이트맵 최종본 (`/`, `/login`, `/auth/callback`, `/friends`, `/friends/[id]`, `/entries`, `/entries/import`, `/settings`)
- 스택 (Next.js 15 / Supabase / Drizzle / Recharts / SheetJS / Pretendard / Vitest + Playwright)
- production 배포 URL (배포 후 추가)

## §I. PR #6·#7·#8·#9 리뷰 청산 매핑 종합

| 출처 | 항목 | 본 슬라이스 처리 |
|---|---|---|
| PR #6 review | TZ 종속 🟡 S1 | **B-1** |
| PR #6 review | `pickGreetingName` `@` 없는 fallback | **C-1** |
| PR #6 review | `formatDiff` 첫 달 | **C-2** |
| PR #6 review | `getTopFriends` recent_memo N+1 | **C-3** |
| PR #6 review | locale collation | 본 슬라이스 외 (V2 메모, 한국어 정렬 미세 차이) |
| PR #7 review | `parseDate` semantic validation | **B-2** |
| PR #7 review | `data-memo` 길이 | V2 deferred |
| PR #7 review | `reorderEntries` tiebreak | V2 deferred |
| PR #7 review | `getRecentEntries` 분리 가능성 | V2 메모 |
| PR #8 review | `formatAmount` ↔ `buildMemo` 정합 | **B-3** |
| PR #8 review | Stepper cursor·aria | **B-5** |
| PR #8 review | mock 버튼 production 가드 | PR #9 (813c254) 청산 완료 |
| PR #8 review | XLSX file size limit | **B-4** |
| PR #8 review | `e2eBulkImportEntries` partial atomicity | V2 deferred |
| PR #9 review | `enumerateMonths` 1000개월 가드 일관화 | **C-4** |
| PR #9 review | 5년+ 윈도우 cap | V2 메모 |
| PR #9 review | `MOCK_MONTHLY_TREND` 미사용 | **D-1** |
| PR #9 review | page.tsx TODO 주석 | **D-1** |
| PR #9 review | TZ 일괄 청산 우선순위 💬 | **B-1** (`next.config.ts` env.TZ) |
| PR #9 sfx | mock 번들 잔존 🟡 | **B-6** |
| PR #9 sfx | `todayKey` TZ 경계 🟡 | **B-1** |
| PR #9 sfx | `MOCK_MONTHLY_TREND` / `maxKey > todayKey` / TODO 🟢 | **D-1** + worker 검토 |

본 슬라이스에서 12건 청산 (locale collation 1건은 V2 메모로 명시). 잔여 V2 = data-memo 길이 / reorderEntries tiebreak / getRecentEntries 분리 / partial atomicity / 5년+ 윈도우 cap / locale collation = 6건.

## §J. 슬라이스 명 + 베이스

- 브랜치: `feature/v1-finalize`
- 베이스: `origin/stage`
- 워크트리: `.worktrees/feature-v1-finalize`
- PR 제목: `[chore] V1 마무리 — 잔여 부채 13건 청산 + Vercel 배포 준비 (PR #10 / 011)`
  - `[chore]` prefix — feat 가 아닌 부채 청산 + infra 위주

## §L. test-writer 라운드 채택 (Lead 판단 4건)

test-writer 단발 호출(3f9af86) — 9 spec 선작성, vitest 27 fail / 188 pass, typecheck:tests clean. Lead 판단 4건 모두 채택:

1. **B-1 호스트 TZ 의존**: `process.env.TZ === "Asia/Seoul"` 1건만 항상 빨강, 나머지 2건은 CI 호스트 의존. worker 청산 후 `next.config.ts env.TZ` 적용 + vitest test.env 에 `TZ=Asia/Seoul` 주입으로 일관 명시 잠금 → 채택.
2. **B-2 e2e spec 회귀 방어선**: 현재 E2E_BYPASS_AUTH 분기에서는 invalid date 가 SQL 까지 안 흘러가 e2e 가 그린. unit 으로 빨강 시드는 충분. e2e spec 은 미래 회귀 방어선으로 유지 → 채택.
3. **B-4 "10MB" 카피 자유도**: 가드 메시지에 "10MB" 키워드 포함만 잠그고 카피 문구는 worker 자유 → 채택.
4. **C-3 drizzle `$client` private API 의존**: 메이저 업그레이드 시 깨질 가능성 있으나 V1 마무리 한정 회귀 잠금 가치 충분 → 채택. V2 에서 drizzle 업그레이드 시 재검토.

빨강 시드 27건 분포:
- B-1: 1 (TZ env) + 2 (KST 의존)
- B-2: 5 (unit dynamic import throw + e2e 회귀 방어선)
- B-3: 1 (`extractDigitsKoreanAware` named export 미존재)
- B-4: 1 (10MB 메시지 미노출)
- B-5: 1 (aria-disabled/cursor-not-allowed 미노출)
- C-1: 4 (greeting 모듈 미존재 dynamic import throw)
- C-2: 6 (format-diff 모듈 미존재 dynamic import throw)
- C-3: 1 (db.$client.query 6회 호출, 1회 기대)
- C-4: 5 (1000개월 가드 동작 미일치)

worker 가 청산 후 27 → 0 빨강 전환 + 새로 추가된 그린 188 유지가 본 슬라이스 목표.

## §K. V2 메모 (본 슬라이스 후 production 운영 중 재논의)

- locale collation (PostgreSQL 한국어 정렬 미세 차이) — V2 사용자 피드백 후
- data-memo attribute 길이 — 무한 스크롤 도입 시점
- reorderEntries tiebreak — 정확한 정렬 정합이 사용자 가시 이슈로 보고될 때
- `getRecentEntries` 분리 가능성 — 위젯 A v2 등 다른 정렬/필터 규약 등장 시
- e2eBulkImportEntries partial atomicity — production 에서 partial failure 인시던트 발생 시
- 친구 상세 5년+ 윈도우 max cap (예: 36개월) — production 사용자 피드백 후
- 보답 시점별 분포 시각화 / 친구 상세 차트 인터랙션 / 회상 환기 알림 — 알림 시스템과 함께
- **`entries` 복합 인덱스 (`friend_id, user_id, received_date DESC, created_at DESC`)** — sfx 라운드 011 🟡 S3.
  V1 규모(친구 수십·친구당 entries 수십)에서는 `getTopFriends` 의 scalar subquery 가 sequential scan 으로도 충분.
  V2 의 대형 dataset(친구 100명+, 친구당 entries 50건+) 진입 시 마이그레이션 검토.

## §M. sfx 라운드 011 — 🟡 청산 결정

worker 1라운드 (5fed4ac..225c589) 직후 sfx 회신:

- 🔴 0건 / 🟡 3건 (S1·S2·S3) / 🟢 7건 (확인 정보)
- Lead 자율 판단:
  - **S1 (next.config.ts env.TZ 운영 잠금)**: 본 슬라이스에서 청산. 주석 표현 격상 + README §production 배포 §5 "권장→필수" 격상. 운영 인시던트 잠금 가치 충분.
  - **S2 (step-1-upload.tsx mock dynamic import 가드 비대칭)**: 본 슬라이스에서 청산. handleMockClick 본문 첫 줄에 `if (process.env.NODE_ENV === "production") return;` 가드 추가 → webpack 이 dynamic import 자체를 dead code 로 인지. production 빌드 산출물의 mock 청크 제거 완성.
  - **S3 (entries 복합 인덱스)**: V2 메모로 보존 (§K). V1 규모에서는 성능 영향 미미.

청산 후 재검증 라운드는 lint·sfx 양쪽에 동일 SendMessage 포맷으로 재요청.

## §N. 메타 노트 — worker 결정 로그 권한 정책 강화

본 711f72c 커밋은 worker 가 sfx 청산 코드 + 결정 로그 §M·§K append 를 한 커밋에 묶음. §M 의 내용("S1·S2 본 슬라이스 청산 / S3 V2 보존 판단") 은 본질적으로 **Lead 자율 판단**이고 008·009·010 패턴에서 Lead 가 보강 커밋으로 추가했어야 함. worker 가 자율 판단 사항을 직접 결정 로그에 기록한 첫 케이스 — 008 메타 노트("디자이너는 결정 로그 손대지 마라")의 확장형 위반.

본 슬라이스 내 처리:
- §M 내용은 그대로 보존 — Lead 판단 사후 채택. worker 가 작성했지만 Lead 가 검토·승인했으므로 사실관계는 정확.
- 향후 슬라이스부터 강화: **worker / test-writer / 디자이너 모두 `docs/decisions/**` 수정 금지.** Lead 영역. peer 라운드 권고 청산이 비자명한 판단을 동반하면 worker 는 PR 본문/커밋 메시지에 청산 사유를 명시하고, Lead 가 별도 보강 커밋으로 결정 로그 §M 형 트레이스를 추가한다.

CLAUDE.md §13 금지 사항에 다음 항목 추가 권고 (V2 메타 슬라이스에서 처리):
> - **worker / test-writer / 디자이너 가 결정 로그(`docs/decisions/**`) 수정**

008 메타 노트의 디자이너 정책이 worker 영역까지 확장. peer 라운드 권고의 청산 사유는 결정 로그가 아니라 PR 본문 + 커밋 메시지의 영역으로 분리.

## §O. peer 라운드 결과 (worker 1·2라운드 종합)

| 라운드 | lint | sfx |
|---|---|---|
| 1 | 🟢 통과 | 🔴 0 / 🟡 3 (S1·S2·S3) / 🟢 7 |
| 2 (S1·S2 청산 후) | 🟢 통과 (회귀 0) | 🔴 0 / 🟡 1 (S3 V2 메모) / 🟢 7 |

머지 차단 0건. 빨강 시드 27 → 0 전환 + spec 약화 0건. S3 (entries 복합 인덱스) V2 메모 보존 — V1 규모(친구 수십, 친구당 entries 수십) 에서 scalar subquery sequential scan 충분, V2 대형 dataset 진입 시 마이그레이션 검토 (§K 명시).

worker 의 청산 1라운드 12 의미 단위 커밋 (36b7aba..225c589):
- B-1 TZ 정착 (36b7aba) / B-2 parseEntriesDate (f4ad530) / B-3 formatAmount 정합 (b59996b)
- B-4 file size + B-6 mock dynamic import (ed8329f) / B-5 ImportStepper a11y (047a693) / B-6 ImportWizard dynamic import (ae2df6a)
- C-1 pickGreetingName (724691f) / C-2 formatDiff (bf3c3b9) / C-3 N+1 → scalar subquery (7a1e400) / C-4 enumerateMonths (3984c8c)
- D-1 dead code 정리 (858f0ed) / E-2 README V1 최종본 (225c589)

worker 2라운드 청산 1 커밋 (711f72c) — sfx S1·S2 청산. **단, 본 커밋이 §N 메타 노트 위반 사례.**

## §P. V1 production-ready 도착

본 PR #10 머지 후 V1 = production-ready. 슬라이스 10건 완료 + 패러다임 4종 자리잡음:

### V1 슬라이스 매핑
| # | 슬라이스 | PR | 핵심 패러다임 도입 |
|---|---|---|---|
| 1 | Next.js 부트스트랩 + 디자인 토큰 | #1 | 베이지/초록 톤 + Pretendard + 테스트 도구 |
| 2 | Google OAuth 인증 게이트 | #2 | E2E_BYPASS_AUTH + auth fixture |
| 3 | 친구 CRUD | #3 | **정정-1 패턴** (application-layer eq + RLS 두 번째 방어선) |
| 4 | 카테고리 CRUD + /settings | #4 | 기본 카테고리 자동 생성 + soft constraint |
| 5 | entries CRUD | #5 | **인라인 친구 빠른 생성 트랜잭션** + e2e-store 격리 |
| 6 | 메인 대시보드 위젯 4종 | #6 | Recharts PieChart 도넛 + 위젯 A·B·C·D 결합 |
| 7 | /entries 리스트·검색 | #7 | **단일 진실 원천화** (getRecentEntries → listEntriesFiltered) + escapeLike 공용화 |
| 8 | 엑셀 import 5단계 워크플로우 | #8 | 단일 트랜잭션 + LEFT JOIN LATERAL + buildMemo 단일 함수 |
| 9 | 친구 상세 추가 통계 | #9 | **디자이너 라운드 본격 결합 흡수** (worker 0 커밋) |
| 10 | V1 마무리 부채 청산 | #10 | TZ 정착 + 13건 일괄 청산 + production 배포 가이드 |

### 패러다임 4종
1. **정정-1 패턴** (PR #3·#4·#5·#6·#7·#8) — application-layer `eq(*.user_id, userId)` 본 방어선 + RLS 두 번째 방어선 + soft-deleted 제외
2. **단일 트랜잭션 보호** (PR #5·#6·#8) — `db.transaction` boundary 에서 부분 실패 시 전체 롤백 + 본인 소유 cross-check
3. **단일 진실 원천화** (PR #7·#8·#9) — `getRecentEntries → listEntriesFiltered` 위임 / `buildMemo` 공유 함수 / `listEntriesByFriend` in-memory aggregate
4. **디자이너 라운드 흡수** (PR #9·#10) — UI/헬퍼 변경만의 슬라이스에서 디자이너 골격이 worker 본격 결합까지 흡수 (worker 0 커밋 운영 가능)

### V2 deferred 7건 (§K)
locale collation / data-memo 길이 / reorderEntries tiebreak / getRecentEntries 분리 가능성 / partial atomicity / 5년+ 윈도우 cap / entries 복합 인덱스

### V2 진입 전 메타 작업 권고 (별도 슬라이스)
- CLAUDE.md §13 금지 사항에 worker/test-writer/디자이너 결정 로그 수정 금지 추가 (§N)
- AGENTS.md 의 worker 책임 섹션에 결정 로그 권한 명시

### V1 production 배포 가이드 (사용자 수행, §G + README §production 배포)
1. Vercel 환경 변수 6개 등록 (5 + `TZ=Asia/Seoul`) — **TZ 필수**, 미등록 시 위젯 D/C 및 친구 상세 todayKey 자정 경계 회귀
2. Supabase Google OAuth Redirect URL 갱신
3. production DB drizzle 마이그레이션 0001~0008 적용
4. 배포 후 동선 점검 (로그인 / CRUD / import / 통계)

본 PR #10 머지로 V1 클로저.

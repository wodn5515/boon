# 006-entries-crud-and-pr4-cleanup: 신세 CRUD + PR #4 잔여 청산

> 작성: 2026-05-12  /  작성자: Lead 에이전트
> 관련 작업: feature/entries-crud

## 배경

PRD §3 신세(entries) 관리 본격 도입 — Boon의 V1 최종 도메인 entity. friends·categories를 참조하는 가장 복잡한 도메인이며 보답 시점 4종 같은 V1 핵심 비즈니스 룰을 처음 도입.

005 §"사용자 PR #4 종합 리뷰 응대"의 6건 청산을 본 슬라이스에 묶음 (사용자 운영 원칙 평가: "부채 청산 ↔ 새 도메인 도입은 분리보다 통합이 자연스러움" 인계 그대로).

## 결정

### A. entries 테이블 + RLS (PRD §4)
- 스키마 경로: `db/schema/entries.ts` (named export `entries`)
- 필드 (PRD §4 그대로):
  - `id UUID PK`
  - `user_id UUID FK → users.id NN`
  - `friend_id UUID FK → friends.id NN`
  - `category_id UUID FK → categories.id NN`
  - `memo text NN` (빈 문자열 허용? — §D 결정)
  - `received_date date NN`
  - `repayment_timing enum NN` ('anytime' / 'friend_birthday' / 'specific_event' / 'specific_date')
  - `repayment_specific_date date NULL` (repayment_timing='specific_date'일 때만 의미)
  - `is_repaid bool NN default false`
  - `repaid_method text NULL`
  - `repaid_date date NULL`
  - `created_at NN default now()`, `updated_at NN default now()`
- **drizzle enum**: `repayment_timing` PostgreSQL enum type 정의 (`db/schema/enums.ts` 또는 `entries.ts` 내부)
- 마이그레이션: `db/migrations/0006_entries.sql` (drizzle-kit) + `db/migrations/0007_entries_rls.sql` (수기)
- **RLS 정책**: §J 정정-1 패턴 동일 — `entries` 모든 작업 본인(`auth.uid()=user_id`)만. application-layer `eq(entries.user_id, currentUser.id)` 필수, RLS는 두 번째 방어선

### B. Server Action 경로 = `app/(authenticated)/entries/actions.ts`
**채택**: test-writer가 spec에서 가정한 도메인 기준 경로. friends/[id]에서 호출되더라도 entries 도메인 액션이라 그곳에 위치.

**근거**: entries 액션은 메인 FAB·친구 상세·`/entries` 리스트(다음 슬라이스) 등 여러 진입점에서 호출. 친구 상세 하나에 묶기엔 결합도 부적절.

- `createEntry(formData)`: user_id 서버 주입, friend_id·category_id 본인 소유 cross-check (정정-1 패턴 — 다른 user의 friend로 entry 생성 시도는 throw 또는 0 row affected)
- `updateEntry(formData)`: 본인 entry만, friend_id/category_id 변경 시 본인 소유 재검증
- `deleteEntry(id)`: hard delete (D-017)
- 인라인 친구 빠른 생성: createEntry가 `new_friend_name` 필드 받으면 같은 트랜잭션에서 friend insert + entry insert (atomic)

### C. 인라인 친구 빠른 생성 트랜잭션
- EntryFormDialog의 friend-combobox에서 "+ 새 친구로 추가" 클릭 → 이름만 받은 인라인 입력 → `new_friend_name`이 FormData에 포함
- createEntry가 다음 흐름:
  1. `db.transaction(async tx => ...)`
  2. `new_friend_name` 있으면 friend insert (생일·메모 null) → 새 friend_id 받음
  3. 받은 friend_id로 entry insert
  4. 둘 중 하나 실패 시 전체 롤백
- `new_friend_name` 검증: trim 후 1자 이상 (디자이너 자율 결정 채택)

### D. memo 빈 문자열 허용
**채택**: `memo text NN` (PRD 그대로) — DB는 NOT NULL이지만 빈 문자열 허용. Server Action에서 trim 후 길이 검사 안 함 — 회상 노트라 사용자가 메모 없이 친구·카테고리만 기록 가능.

**근거**: PRD §3에 "내용 메모 (자유 텍스트)"만 명시, 필수 여부 없음. UX 친화 — 사용자가 친구만 기억나고 어떤 일이었는지 흐릿하면 메모 빈 상태로 기록 가능. 디자이너의 placeholder "어떤 신세였는지 적어주세요"는 안내일 뿐 강제 아님.

대안: `memo text NULL` — DB NULL과 빈 문자열 의미 차이가 모호. NOT NULL + 빈 문자열 허용이 더 명확.

### E. 보답 시점 enum 4종 + specific_date 분기
- enum 값: PRD §4 그대로 (`anytime` / `friend_birthday` / `specific_event` / `specific_date`)
- `repayment_timing = 'specific_date'`일 때만 `repayment_specific_date`가 의미 있음 → 다른 타이밍 + specific_date 동시 입력 시 specific_date는 무시 또는 null로 정리 (silent)
- formatRepaymentBadge:
  - `anytime` → "언제든"
  - `friend_birthday` → "그 사람 생일"
  - `specific_event` → "특정 이벤트 대기"
  - `specific_date` + 날짜 → "2026.5.20에" (formatReceivedDate와 동일 포맷)

### F. 카테고리 삭제 이전 강제 결합 (005 §F entries 결합)
- 005에서 placeholder만 잡았던 이전 강제 본격 구현:
  - `deleteCategory({id, migrateTo})`: migrateTo 있으면 entries.category_id 일괄 update → categories hard delete (트랜잭션)
  - migrateTo 없는데 entries.category_id 사용 중이면 throw (`?error=category_in_use`)
  - CategoryDeleteDialog가 entryCount > 0이면 이전 대상 select 노출 (디자이너 골격 이미 있음 — entryCount만 결합)

### G. 친구 soft delete + entries 격리
- friends.is_deleted=true → listFriends/listEntriesByFriend 둘 다 빈 결과 (application-layer `eq(friends.is_deleted, false)` join 또는 별도 필터)
- entries DB row 자체는 보존 (휴지통 복구 V2 대비)
- categories에서 friend.is_deleted=true인 entries 카운트도 제외 — entries 슬라이스 listEntriesByFriend의 응답 시 friend join + is_deleted 필터

### H. 디자이너 자율 결정 15건 채택
1. friend-combobox 최소 입력 0글자
2. 인라인 빠른 생성 검증 = trim 후 1자 이상
3. "+ 새 친구로 추가" 옵션 = 항상 마지막
4. 인라인 친구 폼 = 이름만
5. EntryFormDialog 필드 순서 = 친구 → 카테고리 → 메모 → 받은 날짜 → 보답 시점
6. "특정 날짜" date picker = inline 노출
7. 메모 placeholder = "어떤 신세였는지 적어주세요"
8. 메모 줄 수 = soft (rows=3 + field-sizing-content)
9. 받은 날짜 기본 = 오늘
10. 저장 버튼 = `variant="outline"` (003 §G 그대로)
11. formatReceivedDate = "오늘"/"어제"/"YYYY.M.D"
12. EntryItem 갚음 상태 = 체크 오버레이 + opacity-60
13. 메모 truncate = line-clamp-2
14. specific_date badge = formatRepaymentBadge가 "M.D에" 치환
15. 삭제 모달 메모 미리보기 = 80자 컷 + line-clamp-3

**cmdk 패키지 거절 + radix Popover 직접 구현 채택** — 디자이너 의존성 비용 분석 합리적. friend-combobox 단일 컴포넌트에 cmdk 도입은 과함.

### I. test-writer 자율 결정 채택
1. entries 액션 경로 = `@/app/(authenticated)/entries/actions` (§B와 일치)
2. `safeRevalidate(path, scope)` 시그니처 = scope 강제 (운영 warn 가시성)
3. 인라인 친구 폼 필드명 = `new_friend_name`
4. 시나리오 12-b 트랜잭션 롤백 검증 = 빈 친구 카운트로 충분
5. 시나리오 6-b 친구 미선택 거절 = client validation으로 충분, E2E 추가 안 함
6. 친구-entries 시나리오 5·6 = mock 통과 회귀 잠금 그대로 (실제 데이터는 통합 spec에서 검증)
7. **단위 시나리오 18, 19 = 회귀 잠금** (디자이너가 이미 구현, 빨강 만들 수 없음)
8. settings.spec.ts 시나리오 7 강화 = CategoryItem 그룹 경계 disabled 검증 (🟡 #2 청산 강제)

### J. 005 사용자 PR #4 리뷰 6건 청산
1. **🟡 #1 signOut cookie fail-safe**:
   - `app/(authenticated)/settings/actions.ts`의 `signOut()`을 강화
   - `try { supabase.auth.signOut() } catch (e) { console.warn(...) }` 다음에 fail-safe로 `cookieStore.getAll()` 순회하며 `sb-*-auth-token` 패턴 강제 삭제
   - **트레이드오프 명시**: 005 §C의 `signOut`이 silent 자동 재로그인되던 동작 정정. 사용자 의도("로그아웃")와 실제 동작 일치
2. **🟡 #2 CategoryItem isFirst/isLast 그룹 경계**:
   - `app/(authenticated)/settings/page.tsx`의 `<CategoryItem isFirst={i===0} isLast={i===categories.length-1}>`를:
     ```ts
     const userStartIdx = categories.findIndex(c => !c.is_system)
     isFirst: c.is_system ? i === 0 : i === userStartIdx
     isLast: c.is_system ? i === (userStartIdx === -1 ? categories.length - 1 : userStartIdx - 1) : i === categories.length - 1
     ```
   - 시나리오 7 spec이 사용자 첫 카테고리의 위 버튼 disabled 검증으로 강화됨 (test-writer 라운드)
3. **🟢 #3 setAuthContext parameterized**:
   - `tests/integration/db-test-helpers.ts:189-190`의 `sql.raw('SET request.jwt.claims = \\'${escaped}\\'')` → `sql\`SELECT set_config('request.jwt.claims', ${claims}, false)\``
   - SET ROLE는 hardcoded literal이라 raw 유지
4. **🟢 #4 safeRevalidate 공통화**:
   - `lib/server/revalidate.ts` 신설 — `safeRevalidate(path: string, scope: string): void`
   - friends/actions.ts + settings/actions.ts + entries/actions.ts 모두 이 헬퍼 사용
   - 단위 시나리오 20에서 검증
5. **🟢 #5 CategoryFormDialog color hidden 제거**:
   - `components/categories/category-form-dialog.tsx`의 `<input type="hidden" name="color">` 제거
   - handleSubmit의 `formData.set("color", color)` 만 source of truth
6. **💬 #6 signOut 트레이드오프 결정 로그 명시**: 본 §J-1에 포함

## 근거

- **entries 본격 도입**: V1 핵심 도메인 entity. friends·categories 결합 + 보답 시점 4종 비즈니스 룰 + 인라인 친구 빠른 생성 → V1에서 가장 복잡한 슬라이스. 베이스 인프라(정정-1, pglite, RLS 단독 회귀)가 안정된 PR #4 위에서 자연 진입
- **인라인 친구 트랜잭션**: D-015 "신세 추가 모달 = combobox + 인라인 빠른 생성"의 실질 구현. 별도 친구 생성 페이지 우회로 신세 추가의 한 호흡을 끊지 않음
- **memo 빈 문자열 허용**: PRD가 명시 안 한 사항을 회상 노트 컨셉(D-006)에 맞춰 결정. 부담 없는 기록
- **카테고리 이전 강제 결합**: 005 §F의 entries placeholder를 본 슬라이스에서 완전 결합. D-018 정책 완성
- **친구 soft delete + entries 보존**: 휴지통 V2(D-025)와 정합. entries DB row 보존 + UI 미노출
- **PR #4 잔여 6건 청산**: 005 §"사용자 PR #4 응대" 인계 그대로. 정정-1 패턴이 entries에 즉시 필요 + signOut 보안 버그가 사일런트 자동 재로그인이라 빨리 청산
- **safeRevalidate 공통화 = `(path, scope)`**: 운영 console.warn에 어느 액션이 실패했는지 stack 없이도 추적 가능. friends/categories/entries 3곳 호출 시점에 자연스럽게 정리

## 거절된 대안

- **(A) entries 액션을 `friends/[id]/actions.ts`에 두기** — 메인 FAB·`/entries` 리스트 등 다중 진입점이라 결합도 부적절. 거절
- **(B) `memo text NULL`** — DB NULL과 빈 문자열 의미 모호. 거절
- **(C) 인라인 친구 빠른 생성을 별도 모달 2단계** — 사용자 한 호흡 끊김. 거절
- **(D) `safeRevalidate(path)` 단일 인자** — scope 없으면 운영 로그가 어느 액션 실패인지 추적 어려움. 거절
- **(E) signOut cookie 강제 삭제 대신 결정 로그에만 명시** — 사용자 의도와 실제 동작 어긋남 그대로 두는 셈. 거절
- **(F) cmdk 패키지 도입** — 단일 컴포넌트에 의존성 추가 과함. radix Popover 직접 구현이 자연스러움. 거절
- **(G) entries 슬라이스와 PR #4 잔여 청산 분리** — PR #4가 같은 패턴(부채 청산 ↔ 새 도메인 통합)으로 평가 좋았음. 분리 비용 > 통합 가치. 거절

## 후속 영향

### 다음 슬라이스(dashboard-widgets) 진입 시 결정 필요
1. 메인 대시보드 위젯 5종 (A 신세 리스트 / B 친구 그리드 / C 다가오는 생일 + 받은 신세 / D 이번 달 요약 + Recharts / E FAB)
2. **디자이너 게이트 필수** (대시보드 위젯 신규)
3. /friends/[id] 통계 카드 본격 결합 (entries category 분포, 총 받은 신세 수, 생일 D-N 카운트다운)
4. Recharts 도입 시 의존성 결정

### V1 잔여 슬라이스
- (6) dashboard-widgets — 메인 대시보드 위젯 5종
- (7) entries-list — `/entries` 검색·필터·날짜 범위
- (8) excel-import — 컬럼 매핑·매칭·일괄 import
- (9) friend-detail 통계 — entries 카테고리 분포 차트·생일 D-N 결합

### V1 마무리 직전 `/meta` 슬라이스 (deferred 누적)
- Playwright CI 빌드 모드 분기
- `next lint` → eslint flat config 마이그레이션
- (V2 보안) nonce 기반 strict CSP

### V2 메모 (이번 슬라이스에서 파생)
- 휴지통 복구 UI (friends + 그 친구의 entries 미노출 row 복원)
- entries category 분포 차트 (dashboard에서 도입)
- entries 검색/필터 (다음 슬라이스 entries-list)
- 보답 시점 알림 (V1 알림 non-goal, V2 push)
- 인라인 친구 빠른 생성 시 생일도 함께 받는 옵션 (사용자 요청 시)
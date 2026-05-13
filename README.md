# Boon (분)

> 🇬🇧 Boon = 은혜 / 🇰🇷 분 = 바람이 분다
> **받은 마음이 바람처럼 분다**

친구한테 받은 신세를 기록하는 **1인용 인간관계 회상 노트**. 받은 마음을 항목 단위로 적고, 가끔 들여다보며 어떤 친구한테 어떤 마음을 받았는지 자연스럽게 환기한다. "갚아야 한다" 강박은 없다 — 자율적 회상 + 부드러운 알림이 본질이다.

V1 production-ready · 10/10 슬라이스 완료 (2026-05-13).

---

## 왜 만드는가

- **받은 신세 안 까먹기** — 자기 인식
- **부드러운 보답 영감** — 친구 생일 다가올 때 받은 마음 모음이 자연스럽게 떠오름
- **큰 이벤트 일괄 정리** — 결혼식/장례식 같이 50~200명 단위 신세를 엑셀로 import
- **인간관계 패턴 발견** — 시간 누적되면 본인의 관계 결이 보임

부채 트래커가 아니라 **회상 노트**다. 점수·잔고·카운트 합산 같은 강박 톤은 의도적으로 뺐다.

## 주요 기능 (V1)

| 영역 | 내용 |
|---|---|
| **인증** | Google OAuth 로그인 / 사용자별 격리 (RLS + application-layer 정정-1) |
| **친구 관리** | 이름·생일·메모 / 검색·정렬 / 이니셜 아바타 / soft delete |
| **카테고리** | 기본 3개(💰물질 / ⏰시간·행동 / 💝마음) + 사용자 추가·정렬 |
| **신세(Entry) 관리** | 친구 combobox + 인라인 빠른 생성 / 카테고리 / 메모 / 받은 날짜 / 보답 시점 4종 |
| **메인 대시보드** | 위젯 5종 — 최근 신세 · 친구 카드 그리드 · 다가오는 생일 · 이번 달 요약 · 빠른 입력 FAB |
| **신세 리스트** | `/entries` 메모 텍스트 검색, 친구·카테고리·날짜 범위 필터, 정렬 |
| **엑셀 Import** | `/entries/import` 5단계 — 업로드 → 컬럼 매핑 → 일괄 설정 → 친구 매칭 검토(동명이인 후보) → 미리보기·실행 (단일 트랜잭션) |
| **친구 상세** | 받은 신세 타임라인 · 카테고리 분포 · 월별 추이(AreaChart) · 활동 요약(첫·마지막 신세·평균 간격) · 생일 D-N |

**보답 시점 타입**: `anytime` / `friend_birthday` / `specific_event` / `specific_date`
→ 축의금·조의금·생일 선물처럼 "동등 이벤트가 와야 보답 가능한" 신세를 분리해 추적한다.

## V1에서 의도적으로 뺀 것

- 부채/잔고/점수 시스템 (강박 톤)
- 사용자 간 공유 / 소셜
- 베푼 신세 트래킹 (V2)
- 알림 (푸시/이메일)
- 다크 모드 (V2)
- AI 런타임 (서비스 코드 안에서 LLM 호출 없음 — 개발 도구로만)

## V1 슬라이스 10건 (머지 순)

| # | 슬라이스 | 한 줄 |
|---|---|---|
| 1 | bootstrap | Next.js 15 + Tailwind + Vitest + Playwright 부트스트랩 |
| 2 | auth-google-oauth | Google OAuth + middleware 게이트 + 사용자별 격리 |
| 3 | friends-crud | 친구 CRUD + soft delete + 인프라 부채 일괄 청산 |
| 4 | categories-crud | 카테고리 CRUD + `/settings` + 시스템 카테고리 보호 |
| 5 | entries-crud | 신세 CRUD + e2e-store 격리 인프라 |
| 6 | dashboard-widgets | 메인 대시보드 위젯 4종 결합 + 정정-1 패턴 확립 |
| 7 | entries-list | `/entries` 검색·필터 페이지 + `escapeLike` 공용화 + `getRecentEntries` 위임 (단일 진실 원천화) |
| 8 | excel-import | 엑셀 5단계 워크플로우 본격 결합 + `matchFriendsByName` LEFT JOIN LATERAL + 단일 트랜잭션 |
| 9 | friend-stats | 친구 상세 추가 통계 — 월별 추이 + 활동 요약 (디자이너 흡수 — Lead 가 디자이너 골격까지 결정) |
| 10 | v1-finalize | 잔여 부채 13건 청산 + Vercel production 배포 준비 + README V1 최종본 |

V1 패러다임 — **정정-1**(application-layer + RLS 이중 격리) · **단일 트랜잭션**(import 부분 실패 거절) · **단일 진실 원천화**(검색/정렬 lib 함수 단일화) · **디자이너 흡수**(Lead 가 디자이너 라운드까지 결정 권한 보유).

## 기술 스택

| 항목 | 선택 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| 폰트 | Pretendard |
| Auth + DB | Supabase (Postgres + Auth + RLS) |
| ORM | Drizzle |
| 차트 | Recharts (shadcn charts) |
| 엑셀 파싱 | SheetJS (xlsx, client-side) |
| 단위/통합 테스트 | Vitest + React Testing Library + pglite |
| E2E | Playwright |
| 배포 | Vercel Hobby |
| **운영 비용** | **$0/월** (Vercel Hobby + Supabase Free) |
| **AI 런타임** | **없음** (서비스 코드에서 LLM 호출 0) |

## 데이터 모델

- `users` — Supabase Auth와 1:1
- `friends` — 이름·생일·메모, soft delete
- `categories` — 기본 3종 + 사용자 정의, 사용자별 격리, 시스템 카테고리 삭제 불가
- `entries` — 받은 신세 본체, 보답 시점 enum + 갚음 상태

자세한 스키마는 [`docs/PRD.md`](./docs/PRD.md) §4.

## 디자인 톤

- 베이지/크림 베이스 (`#FAF7F0`) + 초록·연두 (`#22C55E` / `#84CC16` / `#4ADE80`)
- 자연/식물 메타포, 회상 노트 톤
- 모바일 퍼스트 반응형 (모바일 하단 탭 → 데스크톱 사이드바)
- 별 + 바람 트레일 로고 모티프

## 사이트맵

```
/                  홈 대시보드 (위젯 5종 — 최근 · 친구 카드 · 생일 · 이번 달 요약 · 빠른 입력 FAB)
/login             Google OAuth 로그인
/auth/callback     OAuth callback (서버 측 세션 교환)
/friends           친구 목록 (검색·정렬·카드 그리드)
/friends/[id]      친구 상세 (받은 신세 타임라인 · 카테고리 분포 · 월별 추이 · 활동 요약)
/entries           신세 리스트 (메모 검색 · 친구 · 카테고리 · 날짜 범위 · 정렬)
/entries/import    엑셀(.xlsx · .xls, ≤10MB) 일괄 가져오기 5단계 워크플로우
/settings          설정 (카테고리 관리 + 로그아웃)
```

신세 추가/수정, 친구 정식 추가, 카테고리 관리는 **모달**로 처리. 엑셀 import 는 50~200 row 검토 흐름이라 **풀스크린 페이지**(`/entries/import`)로 진입한다 — 업로드 → 컬럼 매핑 → 일괄 설정 → 친구 매칭 검토 → 미리보기·실행.

## production 배포 (Vercel)

V1 머지 직후 production 배포 가이드 (결정 로그 [011 §G](./docs/decisions/011-v1-finalize.md)):

1. **환경 변수 5개 등록** (Vercel 프로젝트 설정 — CLAUDE.md §11)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`
   - `NEXT_PUBLIC_APP_URL` (production URL)
2. **Supabase Google OAuth Redirect URL 갱신**
   - Supabase 콘솔 > Authentication > Providers > Google
   - Redirect URL: `https://<your-app>.vercel.app/auth/callback`
3. **production DB 마이그레이션 적용** — `db/migrations/0001~0008_*.sql` 순서대로 (drizzle-kit)
4. **배포 후 동선 점검** — 로그인 / 친구·카테고리·신세 CRUD / 엑셀 import (실제 .xlsx) / 통계 / 대시보드 위젯 4종 / `/entries` 리스트
5. **TZ 정착 — Vercel 환경 변수 `TZ=Asia/Seoul` 필수 등록** — `next.config.ts` 의 `env.TZ = "Asia/Seoul"` 는 빌드 시점 inline. Vercel Functions cold-start 시 Node 프로세스 TZ 는 Vercel 환경 변수에서 읽으므로 **콘솔 등록이 필수**. 미등록 시 위젯 D(이번 달) · 위젯 C(생일 D-N) · 친구 상세 월별 추이의 todayKey 가 자정 경계에서 한 달/하루 흔들릴 수 있음 (sfx 라운드 011 🟡 S1).

## 문서

- [`docs/PRD.md`](./docs/PRD.md) — 제품 스펙 (V1 범위, UX 디테일, DoD)
- [`docs/decisions/`](./docs/decisions/) — 결정 로그 (011 까지) — 왜 그렇게 정했는지 + 거절된 대안
- [`CLAUDE.md`](./CLAUDE.md) — AI 코딩 도구용 프로젝트 컨텍스트
- [`AGENTS.md`](./AGENTS.md) — 에이전트 협업 운영 규칙

## 라이선스

본인용 토이 프로젝트.

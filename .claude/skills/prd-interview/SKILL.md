---
name: prd-interview
description: Use this skill when the user wants to flesh out a service/feature/product idea into a concrete spec via guided requirements interview before implementation begins. Handles two modes — greenfield (whole new service → PRD) and brownfield (single feature on existing service → feature spec). Trigger on requests like "PRD 만들자", "서비스 기획해보자", "인터뷰해서 정하자", "0 to 100 정하자", "이 기능 같이 기획하자", "기능 추가하자 — 인터뷰로", "let's plan a new service/feature", or any open-ended product planning that benefits from depth-first question-by-question exploration. Do NOT use for technical implementation questions, debugging, code review, or features that are already specified.
---

# PRD / Feature Interview

A depth-first, mind-map style interview that turns a vague service or feature idea into a concrete spec before any code is written.

## Two modes

### 🟢 Greenfield mode — new service from scratch
- No existing PRD or codebase, or repo is fresh
- Cover everything: concept → users → data → tech stack → deployment
- Output: `docs/PRD.md` (full product spec) + `docs/decisions/000-initial-decisions.md`

### 🟡 Brownfield mode — single feature on existing service
- Existing PRD/decisions/codebase to respect
- Skip already-decided things (auth, stack, brand, deployment)
- Focus only on what's new for this feature
- Output: `docs/features/<slug>.md` (feature spec) + `docs/decisions/<NNN>-<slug>.md` (decision log)

### How to detect mode

At the start of the interview, before launching into Q1:

1. **Look at the repo context** quickly:
   - Does `docs/PRD.md` exist? → likely brownfield
   - Does `docs/decisions/` have prior entries? → likely brownfield
   - Is there substantial existing source code? → brownfield
   - Empty/fresh repo, or none of the above? → likely greenfield

2. **If ambiguous, ask once**:
   > "이게 새 서비스를 처음부터 기획하시는 건가요, 아니면 기존 서비스에 새 기능을 추가하는 건가요?"

3. **In brownfield mode, read first**:
   - `docs/PRD.md` (if exists) — to know constraints
   - `docs/decisions/000-initial-decisions.md` and any later decision logs
   - Existing feature specs in `docs/features/` (if any)
   - Reference these during the interview to ground decisions and avoid re-litigating settled choices

---

## Core method (both modes): depth-first mind-map traversal

You are interviewing to extract decisions, not handing the user a questionnaire. The conversation should feel like talking with a thoughtful collaborator who:

1. Picks **one topic at a time**, drills deep with focused questions, gets to a decision, then moves on
2. Maintains a **visible tree** of branches so the user can see what's been covered and what's coming
3. Surfaces **non-obvious trade-offs** the user hasn't thought through
4. **Recommends defaults but doesn't impose** them

## Hard rules

- **NEVER end the interview unilaterally.** Continue until the user explicitly says "ready to build" / "start coding" / "ok 작업 시작" / similar. If you think you've covered everything, ask "혹시 더 떠오르는 거 있나요?" rather than concluding.
- **NEVER ask a list of numbered questions in one turn.** No "1. ...? 2. ...? 3. ...?" — that's a questionnaire, not a conversation. **ONE focused question per turn** (or one focused question with sub-options).
- **NEVER skip ahead to implementation prematurely.** Even if the user gives a quick answer, don't assume they want to skip the whole branch. Confirm the branch is wrapped, then move to the next.
- **DO present options with named labels and trade-offs.** Like "(A) X / (B) Y / (C) Z". Mark recommendations explicitly with "← 추천".
- **DO give honest expert input when asked.** If the user asks "can this work?" or "is this worth it?", give a real assessment with realistic numbers (cost, complexity, accuracy). Don't sales-pitch.
- **DO push back** when a request contradicts established constraints/non-goals. "이건 V1 스코프 외예요 — 추가하면 X와 Y 트레이드오프가 생기는데, 그래도 들어가야 할까요?"
- **(Brownfield) DO reference existing decisions.** When a question's answer was already decided in PRD/decisions, don't re-ask — state it: "기존 결정에 따라 [X]는 이미 [Y]로 정해졌고, 이 기능에서도 그대로 따라갈게요. 변경이 필요하면 말씀해주세요." Only re-open if the user signals.
- **(Brownfield) DO challenge non-goals.** If the requested feature is in the existing PRD's "Out of Scope" / non-goals list, flag it before proceeding: "원래 V1에서 의도적으로 뺐던 항목인데, 추가하기로 결정한 이유를 같이 정리해두면 좋을 것 같아요."

---

## Conversational shape

### Opening

**Greenfield**: Start with a single root question to understand the concept. Don't ask "what features do you want?" — ask "what is this, in one sentence?" or "where did the name come from?" Get the soul of the project before the surface area.

**Brownfield**: Start with the feature's *why*. "기존 흐름의 어떤 부분이 불편해서 이 기능을 추가하시려는 건가요?" / "어떤 사용자 시나리오가 자꾸 막히던가요?" — anchor in the pain before discussing what to build.

### Each branch

Use a visible header so the user can navigate the conversation visually:

```
## 🌳 Branch N: [Topic name]

[1-2 line framing of why this branch matters and what we'll decide here]

**Q[N]**: [Single focused question, possibly with named options]
```

### Each option set

When presenting choices:

```
- **(A) Label** — what it means, what's better/worse about it
- **(B) Label** — ...
- **(C) Label** — ... ← 추천
- **(D) 그 외** — open-ended escape hatch
```

User picks one → confirm → drill into sub-decisions of that choice → only then move to the next branch.

### Running consolidation

Every 4–6 branches, consolidate decisions into a checklist:

```
## 🌳 정리 (지금까지 결정사항)

✅ [decision 1]
✅ [decision 2]
...

남은 큰 가지: [topic A], [topic B], ...
```

In brownfield mode, this is shorter — usually just 2–4 decisions per feature.

### Final wrap

When the user signals "ready to build", produce the output file(s) **before** anything else.

---

## Coverage order

### Greenfield (full PRD)

1. **Concept / value prop** — what this is, who it's for, why it exists
2. **Users / actors** — who interacts and how (account model, roles)
3. **Core entity / data model** — the central thing being managed
4. **Key actions / workflows** — what users actually do
5. **Decision logic** — recommendation, scoring, filtering, matching, etc.
6. **Auth / permissions** — who can do what
7. **UI / UX tone** — design direction, mobile vs desktop, brand
8. **Tech stack** — language, framework, DB, infra
9. **Cost / hosting / deployment** — budget reality check (free tier? paid?)
10. **Edge cases & non-goals** — what's explicitly out of scope

### Brownfield (single feature)

Trim to only what's new:

1. **Motivation** — what user pain or workflow gap drives this
2. **Scope** — what's in this feature, what's NOT (single-line each)
3. **User-visible changes** — new screens, new UI elements, modified flows
4. **Data model changes** — new tables/columns, migrations needed
5. **Logic / rules** — anything beyond CRUD (validation, side effects, permissions)
6. **Integration** — how the new piece connects to existing features
7. **Edge cases** — failure modes, conflicts with existing behavior
8. **Definition of done** — concrete acceptance criteria

Skip auth, stack, brand, etc. — they're already decided. Reference them when relevant.

Don't follow either order rigidly. Let the user's natural sequence drive — but make sure all of these are touched before declaring the interview ready to wrap.

---

## Output format

### Greenfield → `docs/PRD.md`

```
1. Product Overview (concept, value prop, non-goals)
2. User Roles
3. Feature List (functional)
4. Data Model (logical schema, no migration SQL)
5. Sitemap & Routing
6. UX Detail (tone per audience, key screens, edge cases)
7. Tech Stack (with rationale)
8. Environment Variables
9. Out of Scope (V1)
10. Success Criteria
11. Definition of Done (V1)
```

Plus `docs/decisions/000-initial-decisions.md` (chronological-by-topic).

### Brownfield → `docs/features/<slug>.md`

```
# Feature: <Name>

> One-line description.

## Motivation
[Why this exists. The user pain or workflow gap.]

## Scope
**In:** [what this feature covers]
**Out:** [what it explicitly does NOT cover]

## User-visible changes
[New screens, modified flows, new UI elements. Per-audience if relevant.]

## Data model changes
[New tables/columns, migration files needed.]

## Logic / rules
[Validation, side effects, permissions, edge cases beyond CRUD.]

## Integration with existing features
[How this connects to / changes existing flows.]

## Edge cases
[Failure modes, conflicts, what to show when X.]

## Definition of done
- [ ] [Concrete acceptance criterion 1]
- [ ] [Concrete acceptance criterion 2]
- ...

## References
- Related PRD section: §X.Y
- Related decisions: NNN-…
```

Plus a **decision log entry** at `docs/decisions/<NNN>-<slug>.md` (next available NNN, zero-padded). Capture each non-obvious decision with rationale + alternatives rejected. Keep brownfield decision logs short — 1–3 decisions usually.

---

## Anti-patterns to avoid

| Don't | Do instead |
|---|---|
| "What database would you like to use?" (open, no options) | "DB는 Supabase / Neon / SQLite / 본인이 익숙한 거 중 어떤가요? 토이 + 무료가 우선이면 Supabase 추천해요" |
| "Let me ask: 1. X? 2. Y? 3. Z?" | "Q5에 답해주시면 다음 가지로 넘어갈게요" |
| Quietly assuming the user wants something | Even on small decisions, confirm before moving on |
| "OK so we're done. I'll start coding." | "혹시 빠진 거 더 떠오르는 거 있나요? 없으면 'OK 인터뷰 끝' 하시면 됩니다." |
| Vague recommendations | Cite real numbers: "Supabase Free 500MB / Vercel Hobby $0 / LLM 호출 시 월 ~₩30 (Haiku 기준)" |
| **(Brownfield)** Re-asking "어떤 인증 쓸까요?" when auth is already in the PRD | "기존 OAuth 화이트리스트 흐름 그대로 따라갈게요. 변경이 필요하면 말씀해주세요." |
| **(Brownfield)** Treating the feature as standalone | Always ask "이 기능이 기존 X 흐름이랑 어떻게 연결되나요?" |

## Style notes

- **Match the user's language.** Korean → Korean, English → English. Match formality.
- **Light emoji for visual hierarchy** — 🌳 for branches, ✅/❌ for decisions, ⚠️ for warnings, 💡 for new ideas. Don't overdo it; one or two per response.
- **Be willing to disagree.** "이 방향이면 X 트레이드오프가 있어요" / "원래 합의랑 충돌하는데 다시 정할까요?"
- **Track non-goals as first-class.** When the user explicitly excludes something ("LLM은 안 쓸 거야"), capture it in the decisions log so future requests don't accidentally re-introduce it.
- **No code during the interview.** The interview is for decisions. Code starts only after the spec is written.
- **(Brownfield) Keep it tight.** A feature interview should usually be 4–8 branches and ~10–20 minutes, not 20+ branches. If you find yourself asking 15+ questions, you're probably re-litigating things that were already decided.

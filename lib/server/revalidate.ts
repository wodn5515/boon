import { revalidatePath } from "next/cache";

/**
 * `revalidatePath` 의 안전한 wrapper. 결정 로그 006 §J-4 / PR #4 🟢 #4.
 *
 * Server Action 이 통합 테스트(Next request store 밖)에서 호출되거나
 * 일부 라우트가 revalidate 컨텍스트가 아닐 때 `revalidatePath` 가 throw 한다.
 * 액션 본체가 그 throw 때문에 깨지면 안 되므로 silent 통과 — 다만 production
 * 환경에서는 `console.warn` 으로 가시화해서 운영 stale UI 회귀를 추적 가능하게 한다.
 *
 * @param path  `revalidatePath` 인자 — Next 가 invalidate 할 캐시 키.
 * @param scope 호출자 식별자 (예: "friends/actions" / "settings/actions" / "entries/actions").
 *              production warn 메시지에 들어가 stack 없이도 어느 액션이 실패했는지 추적 가능.
 *
 * friends/actions·settings/actions·entries/actions 가 본 헬퍼를 공유한다.
 * (인라인 정의 3중 중복 청산 — PR #4 🟢 #4)
 */
export function safeRevalidate(path: string, scope: string): void {
  try {
    revalidatePath(path);
  } catch (e) {
    if (process.env.NODE_ENV === "production") {
      console.warn(`[${scope}] revalidate failed`, {
        path,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

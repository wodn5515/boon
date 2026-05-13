import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ImportWizard } from "@/components/import/import-wizard";
import { Button } from "@/components/ui/button";
import { listCategories } from "@/lib/categories/queries";

/**
 * `/entries/import` — 엑셀 일괄 가져오기 페이지 (PRD §3, D-016).
 *
 * Server Component. middleware + (authenticated)/layout 이 인증 게이트 통과시킨 후 진입.
 *
 * 흐름 (디자이너 자율 판단 — 모달 vs 페이지 → 페이지 채택):
 *   - 50~200 row 검토는 모달이 비좁아 본격 진행이 어렵다.
 *   - 페이지 + 5단계 stepper + 각 step 별 conditional 렌더로 자연스러운 데스크톱 페이지 흐름.
 *   - URL 동기화는 V1 생략 — 200건 임시 입력 중 새로고침/뒤로가기로 의도치 않은 상태 복원이
 *     혼란을 키운다고 보고, 페이지 리로드 시 상태 초기화가 더 명료하다고 판단.
 *
 * 데이터 결합:
 *   - listCategories() — 일괄 설정 단계의 카테고리 select 옵션.
 *   - matchAction / bulkImportAction 은 본 슬라이스에선 미주입 → ImportWizard 가 mock 흐름 사용.
 *     worker 결합 시 `lib/import/queries.ts` 의 server action 을 props 로 주입.
 */

export const metadata: Metadata = {
  title: "엑셀 가져오기 · Boon",
  description: "엑셀(.xlsx) 로 받은 신세를 한 번에 추가해요.",
};

export default async function EntriesImportPage() {
  const categoriesRows = await listCategories();
  const categoryOptions = categoriesRows.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      {/* 헤더 */}
      <div className="flex flex-col gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 self-start text-muted-foreground"
        >
          <Link href="/entries">
            <ChevronLeft aria-hidden className="size-4" />
            받은 신세로 돌아가기
          </Link>
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
            엑셀 가져오기
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            결혼식·장례식 명단이나 친구별 정리 엑셀을 가져와 한 번에 추가해요.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ImportWizard categoryOptions={categoryOptions} />
      </div>
    </main>
  );
}

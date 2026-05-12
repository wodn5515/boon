import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GoogleButton } from "@/components/auth/google-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/user";

import { signInWithGoogle } from "./actions";

/**
 * `/login` — Google OAuth 진입 페이지.
 *
 * - Server Component. 진입 시 세션 검사 → 이미 로그인 상태면 `/` 로 redirect (결정 로그 003 §A).
 * - 비로그인 상태에서는 Boon 타이틀 + Google 버튼이 보이는 카드 형태.
 * - 베이지 배경 + 흰 카드, 초록 톤은 강조에만 미세하게 (PRD §6).
 * - `?error=<code>` 쿼리를 카드 안에서 부드럽게 알림으로 노출 (sfx 🟢 권고).
 *
 * 디자이너가 만든 UI 외형(c789be3)은 그대로 보존하고, form action 만 Server Action 으로 교체.
 */

export const metadata: Metadata = {
  title: "로그인 · Boon",
  description: "Google 계정으로 Boon에 로그인합니다.",
};

const ERROR_COPY: Record<string, string> = {
  missing_code: "OAuth 응답에서 인증 코드를 찾지 못했어요. 다시 시도해 주세요.",
  exchange_failed: "세션을 만드는 중 문제가 발생했어요. 다시 시도해 주세요.",
  oauth_init: "Google 로그인 시작에 실패했어요. 잠시 후 다시 시도해 주세요.",
  missing_email: "Google 계정의 이메일을 받아오지 못했어요. 권한을 허용했는지 확인해 주세요.",
  unsupported_provider: "현재는 Google 로그인만 지원해요.",
};

type LoginPageProps = {
  // Next.js 15 App Router 에서 searchParams 는 Promise 로 전달된다.
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  const params = await searchParams;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = rawError ? ERROR_COPY[rawError] : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
      <Card className="w-full max-w-md gap-6 p-6 sm:p-8">
        <CardHeader className="gap-3 px-0 text-center">
          <div
            aria-hidden
            className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground"
          >
            {/* 별 + 바람 트레일 모티프 (PRD 결정 로그 D-027~D-028).
                실제 브랜드 아이콘 확정 전까지는 단순 별 그래픽을 placeholder로 둔다. */}
            <BrandMark className="size-5 text-brand-primary" />
          </div>
          <CardTitle className="text-4xl font-bold tracking-tight text-foreground">
            Boon
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            받은 마음이 바람처럼 분다
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6 px-0">
          <p className="text-center text-sm leading-relaxed text-muted-foreground">
            친구한테 받은 신세를 기록하는 1인용 노트
          </p>

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs leading-relaxed text-destructive"
            >
              {errorMessage}
            </p>
          ) : null}

          <form action={signInWithGoogle} className="flex flex-col gap-2">
            <GoogleButton />
          </form>
        </CardContent>

        <CardFooter className="px-0 pt-2">
          <p className="w-full text-center text-xs leading-relaxed text-muted-foreground">
            로그인 시 본 서비스 이용에 동의하는 것으로 간주합니다.
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}

/**
 * Boon 브랜드 마크 placeholder.
 * 별(은혜/Boon의 영문 의미) 모티프를 단순화한 임시 SVG.
 * 정식 브랜드 자산은 별도 디자인 라운드에서 교체 예정.
 */
function BrandMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M12 3l2.39 5.32L20 9.18l-4 3.9.95 5.54L12 16l-4.95 2.62L8 13.08l-4-3.9 5.61-.86L12 3z" />
    </svg>
  );
}

import type { Metadata } from "next";

import { GoogleButton } from "@/components/auth/google-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * `/login` — Google OAuth 진입 페이지 (UI 골격).
 *
 * - Server Component (인증 상태 체크는 다음 슬라이스에서 worker가 추가).
 * - PRD §3 인증 / §5 사이트맵 / §6 디자인 시스템 기준.
 * - 베이지 배경 + 흰 카드, 초록 톤은 강조에만 미세하게.
 *
 * placeholder 포인트 (worker가 다음 슬라이스에서 결합):
 *   1. `<form action="#login-pending">` — Supabase `signInWithOAuth` 호출하는
 *      Server Action 또는 클라이언트 핸들러로 교체.
 *   2. 약관 한 줄 — V2에 본문 페이지(`/terms`, `/privacy`)가 추가되면 링크 연결.
 */

export const metadata: Metadata = {
  title: "로그인 · Boon",
  description: "Google 계정으로 Boon에 로그인합니다.",
};

export default function LoginPage() {
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

          {/*
            placeholder: 다음 슬라이스에서 worker가 이 form을
            Server Action(또는 클라이언트 핸들러)으로 결합한다.
            지금은 의도적으로 동작하지 않는 anchor(`#login-pending`)로 둔다.
          */}
          <form action="#login-pending" className="flex flex-col gap-2">
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

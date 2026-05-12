import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * 부트스트랩 슬라이스 placeholder.
 * V1 도메인 페이지는 다음 슬라이스(auth-google-oauth)부터 채워진다.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16 sm:px-10">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="gap-3">
          <p className="text-xs tracking-[0.4em] text-muted-foreground uppercase">
            Boon · 분
          </p>
          <CardTitle className="text-4xl font-semibold text-foreground sm:text-5xl">
            Boon
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground sm:text-lg">
            받은 마음이 바람처럼 분다
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 pb-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm text-accent-foreground">
            <span className="size-2 rounded-full bg-brand-primary" aria-hidden />
            곧 만나요
          </span>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            친구한테 받은 신세를 차곡차곡 모아두는 1인용 회상 노트입니다.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

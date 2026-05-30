import { PageLoading } from "@/components/page-loading";

// SSR 데이터 fetch 동안 표시되는 전역 폴백.
// Vercel cold start 시 어르신이 빈 화면 보지 않도록 한다.
export default function Loading() {
  return <PageLoading />;
}

import { PageLoading } from "@/components/page-loading";

// /admin 아래 모든 관리자 카테고리 이동 중 공통으로 표시되는 폴백.
export default function AdminLoading() {
  return (
    <PageLoading
      title="관리자 화면을 불러오는 중입니다..."
      subtitle="잠시만 기다려주세요"
    />
  );
}

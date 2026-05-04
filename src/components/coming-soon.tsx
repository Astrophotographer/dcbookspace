export function ComingSoon({ note }: { note: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
      <p className="text-lg font-semibold text-stone-700">준비 중인 기능입니다</p>
      <p className="mt-2 text-sm">{note}</p>
    </div>
  );
}

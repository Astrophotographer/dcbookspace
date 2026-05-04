-- 호실/예약/결재 변경을 클라이언트가 실시간 구독할 수 있도록
-- supabase_realtime publication에 테이블 추가 (이미 있으면 skip)

do $$
declare
  t text;
begin
  for t in select unnest(array['rooms', 'reservations', 'approvals']) loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

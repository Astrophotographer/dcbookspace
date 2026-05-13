-- =====================================================
-- record_approval RPC — enum 캐스트 명시 (PG 엄격 모드 호환)
-- =====================================================
-- 증상: PIN 으로 결재 진행 시 "column 'status' is of type approval_status but
-- expression is of type text" 에러.
--
-- 원인: 기존 함수의 update 절에 있는
--   set status = case when p_decision='approve' then 'approved' else 'rejected' end
-- 가 text 를 반환. enum 컬럼에 암시적 캐스팅이 더 이상 안 통하는 PG 버전·세팅에서
-- 거부됨.
--
-- 수정: CASE 결과를 ::approval_status 로 명시 캐스트. 단일 enum 리터럴(`'rejected'`)
-- 들은 컬럼 컨텍스트로 추론 가능하므로 그대로 유지.
--
-- 함수 본문은 0011 의 시리즈 분기 포함 버전을 그대로 복제 + 캐스트만 추가.

create or replace function record_approval(
  p_token text,
  p_approver_id uuid,
  p_decision text,
  p_comment text default null
) returns jsonb as $$
declare
  v_appr approvals;
  v_res reservations;
  v_series reservation_series;
  v_total_steps int;
  v_route approval_routes;
begin
  select * into v_appr from approvals where signature_token = p_token;
  if not found then
    raise exception '잘못된 결재 토큰입니다.' using errcode='P0002';
  end if;
  if v_appr.status <> 'pending' then
    raise exception '이미 처리된 결재입니다.' using errcode='P0003';
  end if;

  -- 시리즈 결재 분기
  if v_appr.series_id is not null then
    select * into v_series from reservation_series where id = v_appr.series_id;
    if v_series.current_step <> v_appr.step_order then
      raise exception '아직 차례가 아닌 결재 단계입니다.' using errcode='P0004';
    end if;
    if v_series.status <> 'pending' then
      raise exception '진행중인 신청이 아닙니다.' using errcode='P0005';
    end if;

    update approvals
       set status = (case when p_decision='approve' then 'approved' else 'rejected' end)::approval_status,
           approver_id = p_approver_id,
           signed_at = now(),
           comment = p_comment
     where id = v_appr.id;

    if p_decision <> 'approve' then
      update reservation_series set status='rejected', updated_at=now() where id = v_series.id;
      return jsonb_build_object('result','rejected','series_id',v_series.id);
    end if;

    select * into v_route from approval_routes where id = v_series.route_id;
    v_total_steps := jsonb_array_length(v_route.steps);

    if v_series.current_step >= v_total_steps then
      update reservation_series set status='approved', updated_at=now() where id=v_series.id;
      return jsonb_build_object('result','approved','series_id',v_series.id);
    else
      update reservation_series set current_step = current_step + 1, updated_at=now() where id=v_series.id;
      return jsonb_build_object('result','step_advanced','series_id',v_series.id, 'next_step', v_series.current_step + 1);
    end if;
  end if;

  -- 일회성 결재
  select * into v_res from reservations where id = v_appr.reservation_id;
  if v_res.current_step <> v_appr.step_order then
    raise exception '아직 차례가 아닌 결재 단계입니다.' using errcode='P0004';
  end if;
  if v_res.status <> 'pending' then
    raise exception '진행중인 신청이 아닙니다.' using errcode='P0005';
  end if;

  update approvals
     set status = (case when p_decision='approve' then 'approved' else 'rejected' end)::approval_status,
         approver_id = p_approver_id,
         signed_at = now(),
         comment = p_comment
   where id = v_appr.id;

  if p_decision <> 'approve' then
    update reservations set status='rejected', updated_at=now() where id = v_res.id;
    return jsonb_build_object('result','rejected','reservation_id',v_res.id);
  end if;

  select * into v_route from approval_routes where id = v_res.route_id;
  v_total_steps := jsonb_array_length(v_route.steps);

  if v_res.current_step >= v_total_steps then
    update reservations set status='approved', updated_at=now() where id=v_res.id;
    return jsonb_build_object('result','approved','reservation_id',v_res.id);
  else
    update reservations set current_step = current_step + 1, updated_at=now() where id=v_res.id;
    return jsonb_build_object('result','step_advanced','reservation_id',v_res.id, 'next_step', v_res.current_step + 1);
  end if;
end;
$$ language plpgsql security definer;

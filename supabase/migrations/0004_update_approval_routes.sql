-- 기본/특수 결재선의 단계와 라벨을 실제 운영 표현으로 변경
--   기본: 차장(manager) → 관리장로(elder) → 당회장(senior_pastor)
--   대규모/외부행사: 차장 → 관리장로 → 당회장 (당회장 단계가 동일하므로 시드 동일)

update approval_routes
set steps = '[
    {"order":1,"role":"manager","label":"차장"},
    {"order":2,"role":"elder","label":"관리장로"},
    {"order":3,"role":"senior_pastor","label":"당회장"}
  ]'::jsonb
where name = '기본';

update approval_routes
set steps = '[
    {"order":1,"role":"manager","label":"차장"},
    {"order":2,"role":"elder","label":"관리장로"},
    {"order":3,"role":"senior_pastor","label":"당회장"}
  ]'::jsonb
where name = '대규모/외부행사';

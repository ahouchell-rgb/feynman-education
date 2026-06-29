-- KS3 curriculum correction (new Springboard 2025-29 map).
-- Two changes vs the original KS3 mapping (migrations 03/04):
--   (1) the retrieval Y8.x topic scheme is retired next year — unlink it;
--   (2) several strands moved into Year 9 (GCSE-bound, mapped later) — unlink.
-- Result: topic_map holds only Year 7/8 content under the new curriculum
-- (KS3 mapped drops 106 -> 61). Replay after 03/04 to land on the final state.

-- (1) Retired Y8.x topic scheme.
delete from public.topic_map
where retrieval_topic_id in (
  select id from public.topics where key_stage='KS3' and name like 'Y8.%');

-- (2) Strands the new curriculum places in Year 9 (ignored for now):
--     photosynthesis, respiration, periodic table/metals, materials, particle-density.
delete from public.topic_map
where retrieval_topic_id in (
  select id from public.topics where name in (
    'B6.1 Photosynthesis','B6.2 Leaf Structure',
    'B7.1 Aerobic Respiration','B7.2 Anaerobic Respiration',
    'C6.1 Properties of metals and non-metals','C6.2 Groups, periods, metals and non-metals',
    'C7.1 Metal reactivity','C7.2 Metal extraction with carbon',
    'P10.1 Particle motion and density'));

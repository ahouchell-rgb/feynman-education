-- Patch: the Year-8 gas-exchange/respiration block (Y8.11-Y8.20) was omitted
-- from the prior KS3 mapping. Maps to the Gas Exchange Systems unit.
insert into public.topic_map (retrieval_topic_id, unit_id, unit_title, mapped_by, confidence)
select t.id, 'y8_gas_exchange', 'Gas Exchange Systems', 'assisted:ks3-semantic', 'assisted'
from public.topics t
where t.key_stage='KS3' and t.name in (
  'Y8.11 Respiratory system','Y8.12 Ventilation','Y8.13 Lung structure','Y8.14 Diffusion',
  'Y8.15 Gas exchange','Y8.16 Alveoli adaptations','Y8.17 Aerobic respiration',
  'Y8.18 Anaerobic respiration','Y8.19 Exercise and breathing','Y8.20 Lung health')
on conflict (retrieval_topic_id) do nothing;

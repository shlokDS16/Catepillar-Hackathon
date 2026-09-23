-- 001b (B2): covering indexes for every foreign key the performance advisor listed after 001
-- (unindexed FKs slow joins and cascade checks; schema-foreign-key-indexes rule).
create index if not exists machine_state_machine_idx on public.machine_state (machine_id);
create index if not exists machine_state_operator_idx on public.machine_state (operator_id);
create index if not exists machines_model_idx on public.machines (model_id);
create index if not exists operator_pairings_operator_idx on public.operator_pairings (operator_id);
create index if not exists operator_state_in_cab_machine_idx on public.operator_state (in_cab_machine_id);
create index if not exists operator_state_operator_idx on public.operator_state (operator_id);
create index if not exists profiles_site_idx on public.profiles (site_id);
create index if not exists scenario_frames_machine_idx on public.scenario_frames (machine_id);
create index if not exists scenario_frames_operator_idx on public.scenario_frames (operator_id);
create index if not exists scenarios_site_idx on public.scenarios (site_id);
create index if not exists shifts_machine_idx on public.shifts (machine_id);
create index if not exists shifts_site_idx on public.shifts (site_id);
create index if not exists task_history_machine_idx on public.task_history (machine_id);
create index if not exists task_history_site_idx on public.task_history (site_id);
create index if not exists tasks_machine_idx on public.tasks (machine_id);
create index if not exists tasks_ppe_override_idx on public.tasks (ppe_override_id);
create index if not exists tasks_shift_idx on public.tasks (shift_id);
create index if not exists tasks_site_idx on public.tasks (site_id);
create index if not exists tasks_zone_idx on public.tasks (zone_id);

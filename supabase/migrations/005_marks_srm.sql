-- SRM marks schema: flexible internal components + external end sem
alter table marks drop constraint if exists marks_component_check;

alter table marks drop column if exists component;
alter table marks drop column if exists weightage;

alter table marks add column if not exists component_type text
  check (component_type in ('CT', 'Lab', 'Assignment', 'Project', 'External'));

alter table marks add column if not exists label text;

alter table marks add column if not exists is_external boolean not null default false;

alter table marks add column if not exists added_at timestamptz default now();

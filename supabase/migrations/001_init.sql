-- Enable UUID extension
create extension if not exists "pgcrypto";

-- 1. SUBJECTS
create table subjects (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  code text not null,
  name text not null,
  credits int2 not null,
  type text not null check (type in ('theory', 'lab')),
  faculty text,
  color_hex text default '#7c6af7',
  created_at timestamptz default now()
);
create index idx_subjects_device on subjects(device_id);

-- 2. TIMETABLE SLOTS
create table timetable_slots (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  subject_id uuid references subjects(id) on delete cascade,
  day_order int2 not null check (day_order between 1 and 5),
  start_time time not null,
  end_time time not null,
  room text,
  created_at timestamptz default now()
);
create index idx_timetable_device on timetable_slots(device_id);

-- 3. ATTENDANCE (per class slot: date + start_time)
create table attendance (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  subject_id uuid references subjects(id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text not null,
  status text not null check (status in ('present', 'absent', 'holiday')),
  unique (device_id, subject_id, date, start_time)
);
create index idx_attendance_device on attendance(device_id);
create index idx_attendance_subject_date on attendance(subject_id, date);

-- 4. MARKS (SRM: internals scaled to 60 + external /40)
create table marks (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  subject_id uuid references subjects(id) on delete cascade,
  component_type text not null check (component_type in ('CT', 'Lab', 'Assignment', 'Project', 'External')),
  label text not null,
  marks_obtained numeric not null,
  max_marks numeric not null,
  is_external boolean not null default false,
  added_at timestamptz default now()
);
create index idx_marks_device on marks(device_id);

-- 5. DEADLINES
create table deadlines (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  subject_id uuid references subjects(id) on delete set null,
  title text not null,
  type text not null check (type in ('exam', 'assignment', 'lab', 'other')),
  due_date timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  created_at timestamptz default now()
);
create index idx_deadlines_device on deadlines(device_id);

-- 6. SETTINGS
create table settings (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  semester int2 default 3,
  target_sgpa numeric default 8.5,
  min_attendance numeric default 75,
  grading_scale jsonb default '{
    "O": {"min": 91, "max": 100, "points": 10},
    "A+": {"min": 81, "max": 90, "points": 9},
    "A": {"min": 71, "max": 80, "points": 8},
    "B+": {"min": 61, "max": 70, "points": 7},
    "B": {"min": 51, "max": 60, "points": 6},
    "C": {"min": 40, "max": 50, "points": 5},
    "F": {"min": 0, "max": 39, "points": 0}
  }',
  sem_start date,
  sem_end date,
  declared_holidays jsonb default '[]'::jsonb,
  current_day_order int2 default 1
);
create index idx_settings_device on settings(device_id);

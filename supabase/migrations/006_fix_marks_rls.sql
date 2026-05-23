-- Fix live marks writes for AcadKit's no-auth device_id model.
-- The app stores device identity client-side and uses the anon role.

alter table marks enable row level security;

drop policy if exists "anon_select_marks" on marks;
drop policy if exists "anon_insert_marks" on marks;
drop policy if exists "anon_update_marks" on marks;
drop policy if exists "anon_delete_marks" on marks;

create policy "anon_select_marks"
on marks
for select
to anon
using (true);

create policy "anon_insert_marks"
on marks
for insert
to anon
with check (true);

create policy "anon_update_marks"
on marks
for update
to anon
using (true)
with check (true);

create policy "anon_delete_marks"
on marks
for delete
to anon
using (true);

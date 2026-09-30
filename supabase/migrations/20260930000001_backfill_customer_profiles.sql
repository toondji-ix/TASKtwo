insert into public.profiles (id, full_name)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', '')
from auth.users as users
where not exists (
  select 1
  from public.profiles as profiles
  where profiles.id = users.id
)
on conflict (id) do nothing;

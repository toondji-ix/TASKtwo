create table if not exists public.customer_cart (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete restrict,
  quantity integer not null check (quantity between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.customer_wishlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.customer_cart enable row level security;
alter table public.customer_wishlist enable row level security;

drop policy if exists "Customers can manage their own cart" on public.customer_cart;
create policy "Customers can manage their own cart"
  on public.customer_cart for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Customers can manage their own wishlist" on public.customer_wishlist;
create policy "Customers can manage their own wishlist"
  on public.customer_wishlist for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.customer_cart, public.customer_wishlist from anon, authenticated, service_role;
grant select, insert, update, delete on public.customer_cart, public.customer_wishlist to authenticated;
grant select, insert, update, delete on public.customer_cart, public.customer_wishlist to service_role;

create or replace function public.replace_customer_shopping_state(p_cart jsonb, p_wishlist jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  customer_id uuid := auth.uid();
begin
  if auth.role() is distinct from 'authenticated' or customer_id is null then
    raise insufficient_privilege using message = 'Sign in to sync your bag and wishlist.';
  end if;
  if jsonb_typeof(p_cart) is distinct from 'array'
     or jsonb_typeof(p_wishlist) is distinct from 'array' then
    raise check_violation using message = 'The bag or wishlist has an invalid shape.';
  end if;
  if jsonb_array_length(p_cart) > 20 or jsonb_array_length(p_wishlist) > 100 then
    raise check_violation using message = 'The bag or wishlist has an invalid shape.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_cart) as item(product_id text, quantity integer)
    where item.product_id is null or item.quantity not between 1 and 20
       or not exists (select 1 from public.products p where p.id = item.product_id and p.active)
  ) or exists (
    select 1 from jsonb_to_recordset(p_wishlist) as item(product_id text)
    where item.product_id is null
       or not exists (select 1 from public.products p where p.id = item.product_id and p.active)
  ) then
    raise check_violation using message = 'The bag or wishlist contains an unavailable item or invalid quantity.';
  end if;
  if (select count(*) from jsonb_to_recordset(p_cart) as item(product_id text, quantity integer))
       <> (select count(distinct item.product_id) from jsonb_to_recordset(p_cart) as item(product_id text, quantity integer))
     or (select count(*) from jsonb_to_recordset(p_wishlist) as item(product_id text))
       <> (select count(distinct item.product_id) from jsonb_to_recordset(p_wishlist) as item(product_id text)) then
    raise check_violation using message = 'The bag or wishlist contains duplicate items.';
  end if;

  delete from public.customer_cart where user_id = customer_id;
  delete from public.customer_wishlist where user_id = customer_id;
  insert into public.customer_cart (user_id, product_id, quantity)
  select customer_id, item.product_id, item.quantity
  from jsonb_to_recordset(p_cart) as item(product_id text, quantity integer);
  insert into public.customer_wishlist (user_id, product_id)
  select customer_id, item.product_id
  from jsonb_to_recordset(p_wishlist) as item(product_id text);
end;
$$;

revoke all on function public.replace_customer_shopping_state(jsonb, jsonb) from public, anon;
grant execute on function public.replace_customer_shopping_state(jsonb, jsonb) to authenticated;

create table if not exists public.order_confirmation_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint outbox_sent_has_timestamp check ((status = 'sent') = (sent_at is not null))
);

create index if not exists order_confirmation_outbox_due_idx
  on public.order_confirmation_outbox (next_attempt_at, created_at)
  where status <> 'sent';
alter table public.order_confirmation_outbox enable row level security;
revoke all on public.order_confirmation_outbox from anon, authenticated, service_role;
grant select, insert, update, delete on public.order_confirmation_outbox to service_role;

create or replace function public.enqueue_paid_order_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    insert into public.order_confirmation_outbox (order_id)
    values (new.id)
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists enqueue_paid_order_confirmation on public.orders;
create trigger enqueue_paid_order_confirmation
  after update of payment_status on public.orders
  for each row execute function public.enqueue_paid_order_confirmation();
revoke all on function public.enqueue_paid_order_confirmation() from public, anon, authenticated;

create or replace function public.claim_order_confirmation(p_order_id uuid default null)
returns table (id uuid, order_id uuid, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Only trusted email functions may claim confirmation messages.';
  end if;
  return query
  with candidate as (
    select outbox.id
    from public.order_confirmation_outbox outbox
    join public.orders o on o.id = outbox.order_id
    where o.payment_status = 'paid'
      and (p_order_id is null or outbox.order_id = p_order_id)
      and (
        (outbox.status = 'pending' and outbox.next_attempt_at <= now())
        or (outbox.status = 'processing' and outbox.locked_until < now())
      )
    order by outbox.created_at
    for update of outbox skip locked
    limit 1
  )
  update public.order_confirmation_outbox outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      locked_until = now() + interval '5 minutes'
  from candidate
  where outbox.id = candidate.id
  returning outbox.id, outbox.order_id, outbox.attempts;
end;
$$;

create or replace function public.finish_order_confirmation(p_outbox_id uuid, p_success boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Only trusted email functions may complete confirmation messages.';
  end if;
  update public.order_confirmation_outbox
  set status = case when p_success then 'sent' else 'pending' end,
      sent_at = case when p_success then now() else null end,
      locked_until = null,
      next_attempt_at = case when p_success then next_attempt_at
        else now() + least(interval '6 hours', interval '30 seconds' * power(2, least(attempts, 10))) end,
      last_error = case when p_success then null else left(coalesce(p_error, 'Mailgun send failed.'), 1000) end
  where id = p_outbox_id and status = 'processing';
  if not found then
    raise no_data_found using message = 'The claimed order confirmation is no longer available.';
  end if;
end;
$$;

revoke all on function public.claim_order_confirmation(uuid) from public, anon, authenticated;
revoke all on function public.finish_order_confirmation(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_order_confirmation(uuid) to service_role;
grant execute on function public.finish_order_confirmation(uuid, boolean, text) to service_role;

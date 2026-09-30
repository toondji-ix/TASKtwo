create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  address text not null default '',
  city text not null default '',
  postal_code text not null default '',
  country text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_length check (char_length(full_name) <= 160),
  constraint profiles_address_length check (char_length(address) <= 300),
  constraint profiles_city_length check (char_length(city) <= 120),
  constraint profiles_postal_length check (char_length(postal_code) <= 40),
  constraint profiles_country_length check (char_length(country) <= 120)
);

create table public.products (
  id text primary key,
  name text not null,
  category text not null,
  price_kobo bigint not null check (price_kobo > 0),
  active boolean not null default true
);

insert into public.products (id, name, category, price_kobo) values
  ('arc-bag', 'The Arc Shoulder Bag', 'Bags', 18500000),
  ('daily-tote', 'The Daily Carryall', 'Bags', 22000000),
  ('woven-pouch', 'The Woven Pouch', 'Bags', 11500000),
  ('little-hoops', 'The Little Hoops', 'Jewelry', 8500000),
  ('soft-chain', 'The Soft Chain', 'Jewelry', 10500000),
  ('pearl-studs', 'The Sunday Studs', 'Jewelry', 6750000),
  ('wide-frame', 'The Wide Frame', 'Sunglasses', 14000000),
  ('slim-frame', 'The Slim Frame', 'Sunglasses', 12250000)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price_kobo = excluded.price_kobo;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  reference text not null unique,
  email text not null,
  customer_name text not null,
  delivery_address text not null,
  delivery_city text not null,
  delivery_postal_code text not null,
  delivery_country text not null,
  currency text not null default 'NGN' check (currency = 'NGN'),
  subtotal_kobo bigint not null check (subtotal_kobo > 0),
  delivery_kobo bigint not null check (delivery_kobo >= 0),
  amount_kobo bigint not null check (amount_kobo = subtotal_kobo + delivery_kobo),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id text not null references public.products (id),
  product_name text not null,
  quantity integer not null check (quantity between 1 and 20),
  unit_price_kobo bigint not null check (unit_price_kobo > 0),
  line_total_kobo bigint not null check (line_total_kobo = unit_price_kobo * quantity)
);
create index order_items_order_idx on public.order_items (order_id);

create function public.create_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_customer_profile();
create trigger on_profile_updated
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Customers can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Customers can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "Anyone can read active catalog"
  on public.products for select to anon, authenticated
  using (active);
create policy "Customers can read their own orders"
  on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Customers can read items from their own orders"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = (select auth.uid())
    )
  );

revoke all on public.profiles, public.products, public.orders, public.order_items from anon, authenticated, service_role;
grant select, update (full_name, address, city, postal_code, country) on public.profiles to authenticated;
grant select on public.products to anon, authenticated;
grant select on public.orders, public.order_items to authenticated;
grant select on public.profiles, public.products, public.orders, public.order_items to service_role;
grant insert on public.orders, public.order_items to service_role;
grant usage, select on sequence public.order_items_id_seq to service_role;

create function public.transition_order_payment(p_reference text, p_status text)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Only trusted payment functions may change payment state.';
  end if;
  if p_status not in ('paid', 'failed', 'cancelled') then
    raise check_violation using message = 'Invalid payment state transition.';
  end if;

  update public.orders
  set payment_status = p_status,
      paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else paid_at end
  where reference = p_reference
    and (
      (payment_status = 'pending')
      or (payment_status in ('failed', 'cancelled') and p_status = 'paid')
    );
  if found then
    return query select * from public.orders where reference = p_reference;
    return;
  end if;

  if not exists (select 1 from public.orders where reference = p_reference) then
    raise no_data_found using message = 'Order reference not found.';
  end if;
  return query select * from public.orders where reference = p_reference;
end;
$$;

revoke all on function public.transition_order_payment(text, text) from public, anon, authenticated;
grant execute on function public.transition_order_payment(text, text) to service_role;

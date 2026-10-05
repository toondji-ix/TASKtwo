do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'customer_cart'
    ) then
      alter publication supabase_realtime add table public.customer_cart;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'customer_wishlist'
    ) then
      alter publication supabase_realtime add table public.customer_wishlist;
    end if;
  end if;
end;
$$;

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20260930000000_commerce.sql", import.meta.url), "utf8");

test("customer tables enable owner-scoped row level security without customer order writes", () => {
  for (const table of ["profiles", "products", "orders", "order_items"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`, "i"));
  }
  assert.match(migration, /on public\.profiles for select to authenticated\s+using \(\(select auth\.uid\(\)\) = id\)/i);
  assert.match(migration, /on public\.profiles for update to authenticated\s+using \(\(select auth\.uid\(\)\) = id\)\s+with check \(\(select auth\.uid\(\)\) = id\)/i);
  assert.match(migration, /on public\.orders for select to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /orders\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /revoke all on public\.profiles, public\.products, public\.orders, public\.order_items from anon, authenticated, service_role/i);
  assert.match(migration, /grant select, update \(full_name, address, city, postal_code, country\) on public\.profiles to authenticated/i);
  assert.match(migration, /grant select on public\.orders, public\.order_items to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)[^;]*\bon public\.orders\b[^;]*\bto authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)[^;]*\bon public\.order_items\b[^;]*\bto authenticated/i);
});

test("only service role can execute the atomic payment transition and paid orders cannot downgrade", () => {
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/i);
  assert.match(migration, /p_status not in \('paid', 'failed', 'cancelled'\)/i);
  assert.match(migration, /payment_status = 'pending'[\s\S]*payment_status in \('failed', 'cancelled'\) and p_status = 'paid'/i);
  assert.match(migration, /revoke all on function public\.transition_order_payment\(text, text\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.transition_order_payment\(text, text\) to service_role/i);
});

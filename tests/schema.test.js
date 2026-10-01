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

test("additive shopping migration stores carts and wishlists with owner-only RLS and atomic sync", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261001000000_customer_shopping_and_order_email.sql", import.meta.url), "utf8");
  for (const table of ["customer_cart", "customer_wishlist"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`, "i"));
    assert.match(migration, new RegExp(`on public\\.${table} for all to authenticated\\s+using \\(\\(select auth\\.uid\\(\\)\\) = user_id\\)\\s+with check \\(\\(select auth\\.uid\\(\\)\\) = user_id\\)`, "i"));
  }
  assert.match(migration, /primary key \(user_id, product_id\)/i);
  assert.match(migration, /function public\.replace_customer_shopping_state\(p_cart jsonb, p_wishlist jsonb\)/i);
  assert.match(migration, /customer_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /delete from public\.customer_cart where user_id = customer_id/i);
  assert.match(migration, /delete from public\.customer_wishlist where user_id = customer_id/i);
  assert.match(migration, /grant execute on function public\.replace_customer_shopping_state\(jsonb, jsonb\) to authenticated/i);
});

test("paid-order outbox is unique, database-triggered, service-only, and retries failed sends", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261001000000_customer_shopping_and_order_email.sql", import.meta.url), "utf8");
  assert.match(migration, /order_id uuid not null unique references public\.orders/i);
  assert.match(migration, /after update of payment_status on public\.orders/i);
  assert.match(migration, /new\.payment_status = 'paid' and old\.payment_status is distinct from 'paid'/i);
  assert.match(migration, /on conflict \(order_id\) do nothing/i);
  assert.match(migration, /for update of outbox skip locked/i);
  assert.match(migration, /status = 'processing' and outbox\.locked_until < now\(\)/i);
  assert.match(migration, /case when p_success then 'sent' else 'pending' end/i);
  assert.match(migration, /interval '30 seconds' \* power/i);
  assert.match(migration, /grant execute on function public\.claim_order_confirmation\(uuid\) to service_role/i);
  assert.match(migration, /grant execute on function public\.finish_order_confirmation\(uuid, boolean, text\) to service_role/i);
});

test("only server-verified Paystack transitions dispatch receipts and the server derives recipient/content", async () => {
  const { readFile } = await import("node:fs/promises");
  const [verify, webhook, shared, sender] = await Promise.all([
    readFile(new URL("../supabase/functions/verify-payment/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/paystack-webhook/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/_shared/supabase.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/send-order-confirmation/index.ts", import.meta.url), "utf8")
  ]);
  for (const source of [verify, webhook]) {
    assert.match(source, /paystackVerify\(reference\)/);
    assert.match(source, /transactionMatchesOrder\(transaction, order\)/);
    assert.match(source, /validateTransaction\(transaction, order\)/);
    assert.match(source, /updatePayment\(reference, status\)/);
  }
  assert.match(shared, /order\?\.payment_status === "paid" && order\.id/);
  assert.match(shared, /dispatchOrderConfirmation\(order\.id\)/);
  assert.match(sender, /order\.payment_status !== "paid"/);
  assert.match(sender, /orderConfirmationMessage\(order, claim\.id, domain\)/);
  assert.match(sender, /message\.set\("to", receipt\.to\)/);
  assert.match(sender, /x-internal-secret/);
});

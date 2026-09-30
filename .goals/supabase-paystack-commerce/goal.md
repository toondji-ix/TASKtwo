# Goal: Connect storefront to Supabase and Paystack

## User Request

Well done. Now lets implement a backend with supabase and payment integration with paystack

## Refined Goal

Extend the existing Atelier June storefront with Supabase-backed customer authentication, order persistence, and secure test-mode Paystack payments. Use Supabase Postgres migrations and Row Level Security for profiles, orders, and order items; Supabase Edge Functions for trusted checkout initialization and payment confirmation/webhook processing; and NGN as the checkout currency, replacing the demo USD amounts with clear NGN prices. Replace browser-only demo accounts and local order/tracking data with working Supabase flows configured through documented environment variables. Do not require or expose user secrets in source control; provide setup and verification instructions so the user can connect their own Supabase and Paystack test projects.

## Acceptance Criteria

- [ ] The existing storefront remains responsive and its customer flows are integrated with Supabase: email/password sign-up, sign-in, sign-out, account/order history, and order tracking use authenticated backend data rather than browser-local demo accounts/orders.
- [ ] A migration creates the customer profile/order/order-item data model and appropriate constraints and Row Level Security policies, such that customers can access only their own profile and orders while trusted backend operations can update payment state.
- [ ] Catalog checkout uses NGN prices and amounts in kobo. A trusted Supabase Edge Function authenticates the customer, validates the requested cart against authoritative catalog/product data, creates a pending order, and initializes a Paystack test transaction without exposing the Paystack secret key or accepting client-supplied prices.
- [ ] Paystack payment confirmation is verified server-side against Paystack, and webhook signatures are checked; order payment state transitions are idempotent and cannot be marked paid based only on browser redirects or unverified client input.
- [ ] Checkout redirects to Paystack's returned authorization URL and clearly handles success, cancellation, pending, and failure outcomes; account and tracking screens retrieve the persisted order status.
- [ ] No secrets are committed; configuration examples expose only public Supabase client settings, and documentation explains Supabase migration/function setup, test-mode Paystack credentials, local commands, webhook setup, and deployment prerequisites.
- [ ] Relevant automated tests/checks pass, including coverage of payment amount/currency validation, server-side verification/webhook validation, and payment state handling; provide an explicit manual test procedure for the real provider sandbox integration.

## Scope Boundaries

**In scope:**
- Build from the current Node.js static storefront; preserve its catalog and visual experience while converting product prices and checkout to NGN.
- Supabase Auth, Postgres migrations/RLS, and deployable Supabase Edge Functions for Paystack initialization, verification, and webhooks.
- Paystack test-mode integration with server-side secrets, validated order amounts, verified transaction state, and idempotent order updates.
- Safe environment configuration and documentation, automated coverage of security-critical business rules, and an account/orders/tracking UI connected to the backend.

**Out of scope:**
- Live Paystack payment acceptance, real financial settlement, or a deployed Supabase/Paystack project: provider credentials and project access have not been supplied.
- Shipping/carrier APIs, production fulfillment, tax calculation, or complex inventory management.
- Public hosting/deployment and setting or storing real provider credentials.

## Applicable Project Conventions

**Quality gate command:**
- `npm run check` (includes Node syntax checks and the Node built-in test suite); use focused checks for any Deno/Supabase Edge Function tests added.

**Commit convention:**
- No project-specific convention exists; use conventional commits with the goal workflow's `[B]` / `[I]` role markers.
- Include `Assisted-by: OpenAI:GPT-5.6 Luna` for Builder commits and `Assisted-by: OpenAI:GPT-5.6 Sol` for Inspector commits.
- Also include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` on commits.

**Guidelines:**
- No AGENTS.md, CONSTITUTION.md, `.agents/guidelines/`, or `.github/guidelines/` files were found.

**Rules:**
- Existing project is dependency-free Node.js ES modules with `npm run start`, `npm test`, and `npm run check`; Supabase Edge Functions use Deno.
- Preserve existing shopping UX and explicitly fail with actionable configuration errors when backend setup is incomplete; do not silently fall back to fake/local-account success.
- Browser configuration may contain only Supabase's publishable/anon key. Keep Paystack secret credentials in Edge Function secrets only.
- The prior prototype-completion summary at `.goals/accessories-storefront/summary.md` was already untracked at the start of this goal; leave it untouched and out of scope.
- Worktree initially had that one untracked summary file and no tracked changes. The initial Git revision is `a5837f39bfeced2d4c4a39f255ebc10eb7879df6`.

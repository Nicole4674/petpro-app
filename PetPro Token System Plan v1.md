# PetPro Token System Plan — v1

This is the architecture + pricing plan for PetPro's AI tokens.
Designed to be the OPPOSITE of Viktor's pricing model: clear unit,
fair price, no top-up punishment, real volume discounts.

---

## 1. CORE PRINCIPLES

These are non-negotiable design rules. Every decision below flows
from these.

**1. The unit must be SIMPLE and TRANSPARENT.**
A groomer should know exactly what they're buying. Not "credits" or
"compute units" or anything cryptic. **1 token = 1 message exchange**
(one thing the groomer says + Claude's full reply, no matter how long
or whether it includes a photo).

**2. Pricing must be FAIR — not extractive.**
Viktor charges 100-300x the actual API cost. We charge 3-5x — enough
to sustain the business, not enough to make groomers hoard.

**3. Top-ups must NEVER cost more than the monthly rate.**
Viktor punishes running out (20% premium on top-ups). We do the
opposite: top-ups cost the SAME or LESS per token than the monthly
plan. Running out becomes a non-event.

**4. Tier upgrades unlock LARGER top-up packs, not better rates.**
This protects the business model: a $9.99/month user can't binge $35
of AI/week. They have to upgrade. But within their tier, they always
get the best rate.

**5. No context loss when topping up.**
Mid-conversation top-up should be seamless — same chat, Claude picks
up exactly where she left off. Buying more feels like extending the
conversation, not starting a new one.

**6. The marketing headline writes itself:** *"Real Claude. Fair price.
Built FOR groomers, not against them."*

---

## 2. UNIT OF MEASUREMENT

**1 PetPro Token = 1 Message Exchange**

Defined as:
- One user message (text, voice, or photo) goes to Claude
- Claude responds (any length, including reasoning, follow-up
  questions, or generated content)
- That counts as 1 token. Period.

**What does NOT cost extra tokens:**
- Long Claude responses (Claude can write a 10-page marketing plan
  for the same 1 token as a one-liner)
- Photo uploads (analyzing a dog photo on the table = same 1 token)
- Voice input via Whisper (same 1 token)
- Following up on the same conversation (each follow-up = 1 token,
  but there's no penalty for going deep)

**What DOES cost extra:**
- Each new message the groomer sends = +1 token

This is simple enough to print on a coffee mug. **"You send a message,
that's a token. We count messages, not letters."**

---

## 3. SUBSCRIPTION PLAN TIERS — Monthly Token Allocation

These overlay PetPro's existing 4 plans. Tokens reset each month.

| Plan       | Existing Price | Monthly Tokens Included | Cost per Token (included) |
|------------|---------------|------------------------|---------------------------|
| Basic      | $X/mo         | 200 tokens             | ~3¢/msg                   |
| Growing    | $X/mo         | 500 tokens             | ~2¢/msg                   |
| Pro        | $X/mo         | 1,500 tokens           | ~1.5¢/msg                 |
| Pro+       | $X/mo         | 3,500 tokens           | ~1¢/msg                   |

(Existing plan prices stay as-is — token allocation is added to what
they already get for the booking system, etc.)

**Reasoning:**
- Basic = casual user, exploring, occasional Claude help
- Growing = regular user, daily Claude check-ins
- Pro = power user, Claude as part of daily workflow
- Pro+ = "Claude as my AI staff member" use case

Each tier covers the AVERAGE user fully. Heavy users top up.

---

## 4. TOP-UP PACKS (Tier-Gated)

Top-ups are **one-time purchases** — they roll over and never expire.
This rewards loyalty and removes the panic of "use it or lose it."

### Pack Pricing

| Pack Size      | Price   | Per-Token |
|---------------|---------|-----------|
| 250 tokens    | $4.99   | ~2¢       |
| 500 tokens    | $7.99   | ~1.6¢     |
| 1,000 tokens  | $11.99  | ~1.2¢     |
| 2,500 tokens  | $24.99  | ~1¢       |
| 5,000 tokens  | $44.99  | ~0.9¢     |

**Why these prices work:**
- Even the WORST per-token rate (the $4.99 pack) is BETTER than
  Viktor's monthly rate at the same scale
- Bigger packs = bigger savings, encourages bulk
- Top-ups never cost MORE per-token than monthly inclusion (unlike
  Viktor)
- Margin is healthy after Anthropic API + Stripe fees

### Tier Gates

Which packs can be purchased depends on subscription tier. This is
the protection mechanism Nicole identified.

| Plan       | Allowed Top-Up Packs                           |
|------------|------------------------------------------------|
| Basic      | 250, 500                                       |
| Growing    | 250, 500, 1,000                                |
| Pro        | 250, 500, 1,000, 2,500                         |
| Pro+       | 250, 500, 1,000, 2,500, 5,000                  |

**The "upgrade for power" pitch:**
When a user tries to buy beyond their tier limit, the modal nudges:
*"Want to grab the 5,000 pack? Upgrade to Pro+ first — it unlocks
the biggest packs AND saves you on every monthly token too."*

This creates tier upgrade pressure naturally without being pushy.

---

## 5. PRICING vs VIKTOR (the comparison page that sells PetPro)

This is the comparison we put on a marketing page.

| What You Need              | Viktor                  | PetPro                  | You Save |
|---------------------------|-------------------------|-------------------------|----------|
| Light usage (~200 msgs/mo)| ~$50/mo (20K credits)   | $X (Basic plan included)| Way less |
| Regular use (~500 msgs/mo)| Top-up needed (+$60+)   | $X (Growing included)   | $50+/mo  |
| Heavy use (~1,500 msgs/mo)| Major top-ups (+$180+)  | $X (Pro included)       | $150+/mo |
| Top-up 5,000 extra        | $600 (Viktor punishes)  | $44.99 (PetPro rewards) | $555     |

**The headline number:** Viktor charges as much as **$600 for 5,000
extra messages.** PetPro charges **$44.99**. That's not a discount —
that's a different planet.

**Why we can do this:**
- We use Anthropic's API directly with reasonable markup
- We don't pay sales reps, enterprise consultants, or ad budgets
  Viktor likely does
- We treat groomers like professionals, not like enterprise leads

---

## 6. RUN-OUT FLOW

The moment a groomer's tokens hit zero is the most important moment
in the whole system. It's either a rage-quit or a happy top-up.
We make it the latter.

### The Modal (Nicole's exact copy + tightened)

```
┌─────────────────────────────────────────────┐
│  🐶 Oh no, we were on a roll!              │
│                                             │
│  You're out of tokens for this month.       │
│                                             │
│  Want to grab a top-up so we can keep       │
│  going? Your conversation will pick up      │
│  exactly where we left off.                 │
│                                             │
│  [ Buy 250 tokens · $4.99 ]                 │
│  [ Buy 500 tokens · $7.99 ]   ← BEST VALUE  │
│  [ Buy 1,000 tokens · $11.99 ]              │
│                                             │
│  Or wait until your monthly tokens reset    │
│  on [DATE] — totally up to you.             │
└─────────────────────────────────────────────┘
```

Tone notes:
- Warm, not desperate
- Frames as continuation, not paywall
- Always shows the "wait it out" option (respects them)
- Tier-gated packs only (don't show packs they can't buy)

### Mid-Conversation Top-Up (the magic)

When the groomer clicks a pack:
1. Stripe checkout opens in a modal/new tab
2. Payment processes
3. Webhook adds tokens to balance
4. **Modal auto-closes**, chat input becomes active again
5. Groomer types their next message — Claude responds with FULL
   conversation context still loaded

The user experience: a 30-second pause. Then back to it. No "session
ended," no scrolling back, no lost momentum.

---

## 7. DATABASE SCHEMA

New Supabase tables to add. SQL migration file when we build.

### `groomer_token_balance`
Live balance tracker. One row per groomer.

```sql
create table groomer_token_balance (
  groomer_id uuid primary key references groomers(id),
  monthly_tokens_remaining int not null default 0,
  monthly_tokens_total int not null default 0,
  monthly_period_start date not null,
  topup_tokens_remaining int not null default 0,
  -- topup_tokens_remaining never resets
  -- monthly_tokens_remaining resets each billing period
  updated_at timestamptz not null default now()
);
```

**Token consumption order:** monthly first, then top-up. So users
get value from their monthly allocation before dipping into purchased
packs. This is more user-friendly than the reverse.

### `token_purchases`
Every top-up purchase logged.

```sql
create table token_purchases (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers(id),
  pack_size int not null,
  amount_cents int not null,
  stripe_payment_intent_id text,
  stripe_session_id text,
  status text not null default 'pending',  -- pending, completed, refunded
  purchased_at timestamptz not null default now()
);
```

### `token_usage_log`
Optional but valuable: track every Claude exchange for analytics +
debugging.

```sql
create table token_usage_log (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers(id),
  conversation_id uuid,  -- ties together messages in same chat
  message_type text,      -- text, photo, voice
  used_at timestamptz not null default now(),
  api_input_tokens int,   -- raw Anthropic API tokens (cost tracking)
  api_output_tokens int,
  source text  -- which feature (chat, booking_check, etc.)
);
```

This lets us:
- Spot abuse (one groomer using 50,000 messages/day = bot)
- Calculate real margin per groomer
- Build usage dashboards
- Refund correctly if something breaks

---

## 8. EDGE FUNCTIONS NEEDED

(All deployed to Supabase Edge Functions, same pattern as existing.)

1. **`claude-chat`** — handles the actual Claude API call. Checks
   token balance BEFORE calling Anthropic. Deducts on successful
   response. Logs to `token_usage_log`.

2. **`token-balance`** — returns current balance + monthly reset
   date. Called on chat page load and after each message.

3. **`stripe-create-token-checkout`** — creates a Stripe Checkout
   session for a top-up pack purchase. Stores pending row in
   `token_purchases`.

4. **`stripe-token-webhook`** — handles Stripe `checkout.session.
   completed` for token packs. Adds tokens to balance, marks
   purchase completed.

5. **`reset-monthly-tokens`** — daily cron that resets
   `monthly_tokens_remaining` for any groomer whose
   `monthly_period_start` is more than 30 days old.

---

## 9. METERING — When Do We Deduct?

**The rule:** deduct 1 token AFTER Claude responds successfully.

Why after, not before:
- If Claude fails (API error, timeout, content filter), we don't
  charge — bad UX to take tokens for nothing
- If user refreshes mid-stream, we don't double-charge
- Anthropic's billing is post-completion anyway

**The check sequence:**
1. User sends a message
2. Edge function checks balance — if 0, return run-out response
3. Edge function calls Claude API
4. On successful response, deduct 1 token
5. Return Claude's response to user
6. Update balance display in UI

If balance hits 0 mid-conversation, the next message triggers the
run-out modal. Conversation context is preserved server-side.

---

## 10. EDGE CASES & ABUSE PREVENTION

**Per-day rate limit:** even Pro+ users capped at ~500 messages/day.
Prevents one person abusing or scripting to exhaust their balance
overnight (or worse, extracting Claude's API access for resale).

**Per-message rate limit:** 1 message per 2 seconds. Prevents
script-driven token burning.

**Conversation length limit:** Auto-summarize and start a new context
window after 100+ messages in a single conversation, to keep API
costs predictable.

**Refund flow:** if a user disputes a charge, we refund AND deduct
the matching tokens from their balance. Don't let people chargeback
+ keep tokens.

**Abuse detection:** if a single groomer ID burns >2,000 messages in
24 hours, flag for review. Could be legitimate (genuine power user) or
abuse (resale, automation).

---

## 11. UI PLACEMENT

Three places the user interacts with token info:

**A. Chat page header** — small badge showing balance.
Example: `🪙 142 tokens left · resets May 30 · [Top up]`

**B. Settings → Billing** — full breakdown.
- Monthly allocation + reset date
- Top-up balance (rolling)
- Recent top-up purchases
- Recent usage chart (last 30 days)

**C. The Run-Out Modal** (described in section 6).

---

## 12. ROLLOUT PHASES

**Phase 1 — Foundation (build first):**
- Database tables
- Token balance edge function
- Token deduction in claude-chat
- Balance display in chat header

**Phase 2 — Top-up flow:**
- Stripe Payment Links for each pack tier
- Webhook handler
- Run-out modal
- Settings billing page

**Phase 3 — Polish:**
- Usage analytics
- Abuse detection
- Tier gates fully enforced
- Marketing comparison page vs Viktor

---

## 13. OPEN QUESTIONS FOR NICOLE

1. **Existing plan prices** — what are the current $X for Basic,
   Growing, Pro, Pro+? Need actuals to fill in section 3.

2. **Should monthly tokens roll over** if not used? (My take: NO.
   Roll-over makes pricing predictable and creates urgency to use
   the tool. Top-ups roll over because they're paid-for inventory.)

3. **Free trial allowance?** Should new groomers get, say, 50 free
   tokens to try Claude before they have to top up? (My take: yes,
   50 free tokens to hook them on the wow factor.)

4. **Family plan / multi-staff shops** — does a 3-staff Pro+ shop
   share one token pool, or each staff gets their own? (My take:
   shared pool. Easier to manage. Owner can monitor usage.)

5. **Refund policy** — refunds within 30 days if untouched, no
   refunds after first use. Standard for digital goods.

---

## 14. WHAT TO BUILD FIRST

Recommended order tonight (if we keep going):

1. The SQL migration (tables for balance, purchases, usage log)
2. The lifted-guardrails Claude chat edge function (the WOW feature)
3. Token deduction logic
4. Chat UI with balance badge

Then tomorrow:
5. Stripe Payment Links setup
6. Top-up webhook
7. Run-out modal
8. Settings page

This way, by end of tonight, you can chat with full Sonnet using your
Brain + Breed Reference docs as context — and start to feel the WOW
yourself before we even ship the buy flow.

---

*Last updated: May 2, 2026 · Version 1*

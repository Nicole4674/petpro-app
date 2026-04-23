# PetPro — Launch Checklist

Go through this one item at a time. When every box is checked, green-light Viktor to flip the switch.

---

## 1. Code Blocker

The only code task still marked **BEFORE LAUNCH**.

- [ ] **#97 Client contacts table** — build `client_contacts` table + UI for multi-contact support (spouse, second owner, etc.) with `is_emergency` boolean flag. #98 (emergency contact) folds into this same task.

---

## 2. Live End-to-End Tests (real Stripe, real phone, real data)

These are the "does it actually work when a real person uses it" checks.

- [ ] Sign up as a brand-new user with a **real credit card** on trypetpro.com → trial starts → Stripe webhook fires → `subscription_tier` row updates correctly in Supabase → user lands in the dashboard on the right tier.
- [ ] Cancel that test subscription in Stripe → verify the webhook downgrades them correctly in Supabase (or marks `subscription_status` accordingly).
- [ ] Book a real appointment → verify Twilio reminder text **actually lands** on a real phone (not just that it sent — that it arrived).
- [ ] Push notifications tested on a **real iPhone** AND a **real Android**. Service workers behave differently between the two.
- [ ] Send a test client message from the portal → verify it shows up in-app for the groomer AND fires a push notification.
- [ ] AI usage counter ticks up on a real groomer account when you use Claude features (you did this already — just re-confirm it's still working after all the recent changes).

---

## 3. Non-Code Launch Prep

Stuff that isn't code but will burn you on day 1 if you forget.

- [ ] Privacy page loads cleanly on both trypetpro.com (marketing) and app.trypetpro.com (app).
- [ ] Terms page loads cleanly on both.
- [ ] Footer links on every page actually route to Privacy, Terms, and Contact.
- [ ] `nicole@trypetpro.com` forwards to an inbox you'll actually check on day 1.
- [ ] Demo/test clients, pets, and appointments **cleared out of production Supabase** so real signups don't see dummy data.
- [ ] DNS: `trypetpro.com` → marketing site (Viktor's build), `app.trypetpro.com` → React app on Vercel. Both load clean, no Vercel errors, no SSL warnings.
- [ ] Ad campaigns: confirm where they run, when they go live, daily budget, and that the CTA in the ad points to the Plans page (not the home page).
- [ ] Warm list sequence: decide who hears first — any groomer groups, friends-and-family, email list — before paid ads go live.
- [ ] Day-1 break plan written down: if something breaks, do you refund via Stripe, pause new signups, post an apology banner, or disable a specific feature? Know your moves before you need them.

---

## 4. Founder Deal Sunset (save for after 100 signups)

Don't do this before launch. This is the plan for AFTER you hit 100 founders and want to close the door behind them.

- [ ] Remove the yellow "FOUNDER DEAL — first 100 signups" banner at top of Plans.jsx.
- [ ] Strip `{ text: '500 AI actions / month', founder: true }` from TIERS[0].features.
- [ ] Strip `{ text: '800 AI actions / month', founder: true }` from TIERS[1].features.
- [ ] Flip comparison table `✓*` back to `—` on Basic/Pro AI rows.
- [ ] Flip Pro+ `✓*` back to `—` on the 6 Growing-only AI rows.
- [ ] Change the "AI actions per month" row from `500*` / `800*` back to `—` / `—`.
- [ ] Remove the yellow footnote under the comparison table.
- [ ] Implement gating tasks #92, #93, #94 so new (non-founder) signups can't use features they didn't pay for.

---

## Summary

**One code task. Six live tests. Nine non-code checks.** Then launch.

Founder deal sunset is parked for the day you hit 100 — don't confuse it with pre-launch.

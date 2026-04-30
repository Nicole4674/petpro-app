# 🛠️ PetPro Dev Workflow — Local + Branches

> **Purpose:** Shared workflow doc for Nicole and Claude. We both reference this so we never lose the plan or break production by accident.
>
> **The promise:** When starting any big feature, the first thing we do is "check Obsidian → Dev Workflow." That puts us both on the same page in 30 seconds.
>
> **Last updated:** April 30, 2026

---

## 🎯 Why we're doing this

Up until now we've pushed every change directly to `main`, which auto-deploys to production. That's been fine for small fixes but it's risky for:
- Multi-day features (mobile route engine, smarter Claude)
- Big refactors
- Anything where mid-build code shouldn't be visible to real users

The new rule: **big features live on their own branch + run locally, until they're ready to ship.**

---

## 🔑 Two key concepts

**1. Git branches** — separate "lanes" for different pieces of work. `main` is production. Anything else is a workspace. We work on a branch, then "merge" it into main when done.

**2. Local development** — running PetPro on your computer at `http://localhost:5173` so changes appear instantly. Production at `petpro-app.vercel.app` is untouched.

---

## ⚡ One-time setup (5 min)

You said you have Node installed (Claude Code requires it). One-time steps:

### 1. Install dependencies

In your PetPro folder, open a terminal and run:

```bash
npm install
```

That reads `package.json` and downloads all the React/Vite/Supabase libraries into `node_modules/`. Takes ~30 seconds first time. You only do this once per machine — and again any time we add new libraries.

### 2. Make sure your `.env` is set

PetPro reads keys from a file called `.env.local` (or `.env`) at the root of the project. It needs:

```
VITE_SUPABASE_URL=https://egupqwfawgymeqdmngsm.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...    (your anon key)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...    (your live key)
VITE_GOOGLE_MAPS_API_KEY=...    (when we add maps)
VITE_VAPID_PUBLIC_KEY=...    (push notifications)
```

If `.env.local` doesn't exist:
1. Vercel Dashboard → Project → Settings → Environment Variables
2. Copy each value
3. Paste into a new file called `.env.local` at the root of your PetPro folder
4. Save

**Important:** `.env.local` is in `.gitignore` — it never gets committed. Keys stay on your machine only.

### 3. Test that local dev works

```bash
npm run dev
```

Should output something like:
```
  VITE v6.0.0  ready in 350 ms

  ➜  Local:   http://localhost:5173/
```

Open `http://localhost:5173/` in your browser. PetPro should load. Log in as you. Everything should work — but it's hitting your **real** Supabase database (same as production).

That's important to remember: **localhost shares the same database as production.** If you create a fake appointment locally, it shows up on production too. If you delete a row locally, it's gone everywhere.

If you need a sandbox database to play in, that's Option C from earlier — we can set it up later.

---

## 🌳 Starting a new big feature

Run these from your PetPro folder. Replace `mobile-route` with whatever the feature is.

### 1. Make sure you're on main and up to date

```bash
git checkout main
git pull
```

### 2. Create a new branch

```bash
git checkout -b mobile-route
```

That makes a copy of `main` called `mobile-route` and switches you to it. Production (`main`) is now safe — anything you do on this branch doesn't touch prod.

### 3. Start local dev

```bash
npm run dev
```

Leave that terminal open while you work. It auto-reloads the browser any time you save a file.

---

## ✏️ Daily coding workflow

While working on a feature:

1. **Edit files** — Claude makes the changes via Edit tool, or you edit by hand
2. **Save** — your browser at `localhost:5173` auto-refreshes within ~200ms
3. **Test in browser** — does it look right? Does the click work?
4. **Use dev tools** — F12 → Console for errors, Network tab for API calls
5. **Commit often** — small saves so you can rewind if something breaks:

```bash
git add -A
git commit -m "Add Route page skeleton"
```

Don't push yet (unless you want a preview URL — see below).

### Tip: micro-commits are your safety net

Every time you finish a small thing that works, commit. Dozens of small commits >> one huge commit. If you break something, you can always go back to the last working version with:

```bash
git reset --hard HEAD~1   # rewind 1 commit
```

(Don't use `git reset --hard` if you have uncommitted changes you want to keep — it nukes them too.)

---

## 📱 Testing on your phone (preview URL)

When you want to test on your real phone (especially for mobile features), push your branch to GitHub:

```bash
git push origin mobile-route
```

Vercel auto-creates a preview URL like:

`petpro-app-git-mobile-route-nicole4674.vercel.app`

Open Vercel → Deployments tab → find the latest deploy of your branch → click "Visit." Bookmark that URL on your phone. It's a fully working copy of PetPro running your branch's code.

Push more commits any time → Vercel re-builds the preview URL automatically.

---

## 🗄️ Database changes (the tricky part)

Branches DON'T isolate the database. Both `main` and your feature branch hit the same Supabase project. So:

### Rule: any new tables / columns get saved as `.sql` files in the repo, NOT run in Supabase yet

When Claude needs a new column, we save it as something like `Add Address Notes Column v1.sql` in the project root. We **don't** run it in Supabase until merge time.

The branch's frontend code knows about the column. But if you run the frontend locally without the column existing yet, you'll get errors. Two ways to handle:

**Option A — Run the SQL in production right when you start.** Adding a nullable column never breaks anything. This is the simplest path 90% of the time.

**Option B — Use a sandbox Supabase.** Overkill until we have many features in flight.

**Practical rule:** if the schema change is "add a nullable column" or "add a new table that nothing else uses yet" → just run it. If it's "rename a column other code depends on" → save the SQL and only run at merge time, in lockstep with the frontend deploy.

---

## ⚡ Edge function changes (also tricky)

Edge functions live in `supabase/functions/`. Changes there don't auto-deploy — you copy/paste them into Supabase Dashboard manually.

**Strategy:**
- Make all edge function changes in the branch
- Don't deploy them in Supabase until merge time
- When ready: deploy the new version → merge the branch → frontend rolls forward together

### One catch

If your branch's frontend calls a NEW edge function that doesn't exist in Supabase yet, the local dev will error. Two options:
1. Deploy the function in Supabase ahead of time (it's an additive change — old code won't call it, so it's safe)
2. Stub the function in local dev so it returns fake data

**Practical rule:** for new functions, just deploy them. Doesn't break prod because nothing calls them yet.

---

## 🚀 Shipping a feature (merge to main)

When the branch is fully tested and ready:

### 1. Final checklist

- [ ] Tested every flow on local
- [ ] Tested on phone via preview URL
- [ ] Any new SQL files have been run in Supabase (or are ready to run RIGHT NOW)
- [ ] Any edge function changes are deployed in Supabase
- [ ] `.env` changes (new keys) are set in Vercel for Production

### 2. Merge

```bash
git checkout main
git pull
git merge mobile-route
git push
```

Vercel sees the push and deploys to production within 60 sec.

### 3. Smoke test

Open `petpro-app.vercel.app` in incognito → log in → run through the new feature once → make sure it works in production.

### 4. Delete the branch

```bash
git branch -d mobile-route
git push origin --delete mobile-route
```

Cleans up the old branch.

---

## 🆘 If something breaks in production

### Quick rollback (one command)

If the latest deploy broke prod, Vercel has instant rollback:

1. Vercel Dashboard → Deployments
2. Find the LAST WORKING deployment (probably the one before your merge)
3. Click `...` → **Promote to Production**
4. Within 30 sec, prod serves the old code again

That gives you breathing room to figure out what broke without users seeing it.

### Revert in git

To undo the merge in code:

```bash
git checkout main
git revert -m 1 HEAD   # creates a new commit that undoes the merge
git push
```

### Database rollback

If a SQL change broke things, write a reverse SQL and run it. Example:

```sql
-- Rollback: remove address_notes column
ALTER TABLE clients DROP COLUMN address_notes;
```

Save these as `Rollback X v1.sql` files so we can run them fast.

---

## 📋 Common commands cheat sheet

| What | Command |
|---|---|
| Start local dev | `npm run dev` |
| Stop local dev | `Ctrl+C` in the terminal running it |
| See current branch | `git branch` |
| List all branches | `git branch -a` |
| Switch to main | `git checkout main` |
| Make new branch | `git checkout -b feature-name` |
| Stage all changes | `git add -A` |
| Commit | `git commit -m "message"` |
| Push current branch | `git push` (first time: `git push -u origin BRANCH`) |
| Pull latest | `git pull` |
| Discard uncommitted changes | `git restore .` |
| Rewind last commit | `git reset --hard HEAD~1` |
| Show recent commits | `git log --oneline -10` |
| See what changed | `git status` then `git diff` |
| Merge a branch into main | `git checkout main && git merge BRANCH` |

---

## 🤝 The "check Obsidian" handshake

When picking up work — whether after a nap, the next morning, or coming back from a hard week — say to Claude:

> "Check Obsidian → Dev Workflow. We're on branch `[name]`, working on phase `[X]` of `[feature]`. Resume from there."

That's the handshake. Claude reads this doc, the relevant feature plan (Mobile Integration Plan / Smarter Claude Plan), and we're aligned in seconds without re-explaining everything.

---

## 🚨 Safety rules

These are immutable. We follow them every time:

1. **Never push directly to `main` for big features.** Always branch.
2. **Never `git reset --hard` without committing what you want to keep first.**
3. **Never run untested SQL in production database.** Test in a sandbox or use additive changes only.
4. **Never delete a Stripe Connect account without backup.** Stripe stuff is hard to recover.
5. **Always smoke-test prod after a merge.** 60 seconds of clicking around catches 90% of regressions.
6. **Keep `.env.local` in `.gitignore`.** Never commit secret keys.
7. **If unsure, branch and try it.** Branches are free. Mistakes on branches are cheap.

---

## 🧠 Mental model for Nicole

Old workflow: edit file → push → hope it works in production.

New workflow: branch off → edit → see it work locally → push to preview → test on phone → merge to main → smoke test prod.

The new workflow takes 2-3 extra steps but eliminates 90% of "it broke the next day" pain. Worth it for any feature that takes >30 minutes.

---

## 📁 Files in this Obsidian system

These four files together are PetPro's brain trust:

| File | Purpose |
|---|---|
| `Mobile Integration Plan.md` | 10-phase plan for the mobile route engine |
| `Smarter Claude Plan.md` | 11-phase plan for the AI memory assistant |
| `Competitive Research.md` | Full competitor analysis + feature gaps + roadmap |
| `Dev Workflow.md` | This doc — how we work without breaking things |

Plus the live task list in Cowork, which tracks day-to-day items.

---

## 🐾 Closing note (because PetPro is OUR baby)

This workflow exists so we can keep building ambitious features without the production-breaking stress of the past few weeks. Branches + local dev = sleep well at night. The work goes faster because nothing is at risk.

When in doubt: **check Obsidian.**

— Claude & Nicole 💪

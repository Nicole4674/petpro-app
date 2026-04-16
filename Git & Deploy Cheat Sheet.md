# Git & Deploy Cheat Sheet

No more guessing — just copy paste these when you need them.

---

## Push Updates to Live Site

After making changes in Cowork, open your terminal, go to your PetPro folder, and run these 3 commands:

```
cd C:\Users\tread\PetPro\PetPro
git add -A
git commit -m "describe what changed"
git push
```

Vercel auto-deploys in ~30 seconds after you push. Done!

---

## Your Live URLs

- **Live Site:** https://petpro-app.vercel.app
- **GitHub Repo:** https://github.com/Nicole4674/petpro-app
- **Vercel Dashboard:** https://vercel.com/pet-pro/petpro-app

---

## First Time Setup (Already Done)

These only needed to happen once — keeping them here for reference:

```
git init
git add -A
git commit -m "Initial commit - PetPro app"
git branch -M main
git remote add origin https://github.com/Nicole4674/petpro-app.git
git push -u origin main
```

---

## If Something Goes Wrong

**"Not a git repository" error:**
```
cd C:\Users\tread\PetPro\PetPro
```
Make sure you're in the right folder.

**"Nothing to commit" message:**
That just means no files changed since last push. Totally fine.

**Need to undo last commit (before pushing):**
```
git reset --soft HEAD~1
```

---

## Environment Variables (Vercel)

If you ever need to update these, go to Vercel > Settings > Environment Variables:

- `VITE_SUPABASE_URL` = your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon key

After changing env variables, redeploy from Vercel dashboard.

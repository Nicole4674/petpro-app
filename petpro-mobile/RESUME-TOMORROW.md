# PetPro — Pick up here tomorrow

Everything is built and saved. Just 3 steps, in this order.
Do them in your **petpro-mobile** folder terminal unless noted.

## ✅ What's done (no action needed)
- Card-free 14-day free-trial signup flow in the app (Welcome → Start Free Trial → pick plan + details → trial starts → into app)
- Trial lock screen ("trial ended — keep your shop running at trypetpro.com")
- Billing screen = plain text only ("Manage your plan at trypetpro.com")
- Centered paw app icon + welcome screen
- Grooming / boarding / punch-card payments left untouched (allowed)

## STEP 1 — Deploy the new backend function (one time)
In your **Supabase project folder** (where you deployed start-free-trial):
```
supabase functions deploy signup-groomer-app
```
(Reuses the existing PETPRO_APP_TRIAL_KEY secret — nothing new to set.)

## STEP 2 — Test FREE in Expo Go first (no 40-min build)
```
npm start
```
- Open the app on your phone (Expo Go), tap **Start Free Trial**
- Use a **brand-new email** for the test account
- Should show "🎉 Your 14-day free trial is live!" and land you in the app
- For normal testing, log in with your own email (treadwell4674@gmail.com) — you bypass the gate
- If anything errors, screenshot it for Claude before building

## STEP 3 — Build the store file (only after Step 2 works)
```
eas build --platform android --profile production
```
- Produces the final `.aab` (centered icon + trial flow + welcome screen)
- Download the `.aab` from the build page → that's the file for the Google chat

## Then: Google chat
- Upload the `.aab`, store listing, screenshots, data-safety form, submit for review
- Store icon for the listing: use `PetPro Logo.jpg` (paw + text)

## Notes
- App key lives in `lib/appConfig.js` (matches PETPRO_APP_TRIAL_KEY)
- Website domain shown to users: trypetpro.com (text only, never a tappable billing link)

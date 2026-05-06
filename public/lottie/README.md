# Suds Lottie Animations

This folder holds the smooth Lottie animations Suds uses on screen.
They REPLACE the static PNG poses (`/public/suds*.png`) when present.

## File names Suds looks for

| Pose | File path | When it plays |
|---|---|---|
| Idle | `suds-idle.lottie` | Default — neutral, breathing/bobbing |
| Waving | `suds-waving.lottie` | First-open greet + onboarding step 1 |
| Thinking | `suds-thinking.lottie` | While AI is working on a message |
| Celebrate | `suds-celebrate.lottie` | Bookings, milestones, wizard finish |
| Sleeping | `suds-sleeping.lottie` | After 8 PM when chat is closed |
| Talking | `suds-talking.lottie` | While Suds' voice is playing (lip sync) |

## How fallback works

Each pose checks if its `.lottie` file exists. If it does, it plays the
animation. If it doesn't (404 or missing), the existing static PNG is used.
This means we can ship animations one at a time — no big-bang.

## Where to find Lottie files

1. **LottieFiles** (https://lottiefiles.com) — your account is set up
2. Search terms that work for our use cases (otter Lottie is rare):
   - **idle**: "cute character idle", "mascot bobbing", "friendly creature"
   - **waving**: "character waving", "friendly hello wave", "mascot wave"
   - **thinking**: "character thinking", "thinking bubble", "AI thinking"
   - **celebrate**: "celebration jump", "confetti dance", "happy character"
   - **sleeping**: "sleeping z's", "character sleeping", "snoozing"
   - **talking**: "talking head animation", "mouth lip sync", "speaking character"
3. Download as `.lottie` (preferred — smaller/faster) or `.json`
4. Rename to match the table above (e.g. `suds-celebrate.lottie`)
5. Drop the file in this folder and push — Vercel rebuilds, animation goes live

## Format notes

- `.lottie` (dotLottie) — smaller, faster, preferred
- `.json` (raw Lottie) — also works, just rename file extension to `.lottie` won't work,
  in that case keep `.json` and update the path in `AIChatWidget.jsx` LOTTIE_POSES.
- Animations should be **loopable** (start and end frames match)
- Keep file size under 200 KB per animation if possible

## Phase 2 (later)

Once we have real users to delight, add custom-commissioned animations for:
- Idle juggling
- Birthday hat for pet birthdays
- Holiday seasonal outfits
- Singing dance for big revenue days

# PetPro Development Hub

## What is PetPro
AI powered pet grooming, boarding, and daycare SaaS web app. Replaces manual booking software like MoeGo and Gingr. Claude AI acts as the brain preventing dangerous booking mistakes through automatic safety checking. Built by a professional groomer with 15 years experience who knows exactly what shops need.

## Tech Stack
- **Frontend:** React
- **Database:** Supabase
- **AI Brain:** Claude API (Anthropic)
- **SMS/Text:** Twilio
- **Email:** SendGrid
- **Payments:** Stripe subscriptions
- **Voice Commands:** Whisper API + OpenAI TTS
- **Hosting:** Vercel

## Build Order - UPDATED April 15, 2026

### COMPLETED
1. ~~Project setup - React, Supabase, Vercel~~ ✓
2. ~~Authentication - groomer login~~ ✓
3. ~~Client and pet profiles with all safety fields~~ ✓
4. ~~Pricing table UI~~ ✓
5. ~~Basic calendar and appointment booking~~ ✓
6. ~~Claude AI safety checking on bookings~~ ✓
7. ~~Flag and alert system~~ ✓
8. ~~Email approval system via SendGrid~~ ✓
9. ~~Twilio SMS~~ ✓ (code done, needs A2P registration + account upgrade)
10. ~~Voice command with Whisper + OpenAI TTS~~ ✓ (male/female voice picker)
11. ~~AI Chat Widget~~ ✓ (chat bubble on every page, talks to Claude with full database context)

### PHASE 1 — Groomer Side (Nicole testing at work)
12. Hands-free "Hey PetPro" wake word - like Alexa, always listening
13. Claude AI preferences and memory - shop profile + rolling 30-day chat history
14. Claude guardrails - what Claude can/cannot say, no medical advice, no sharing client info, no unauthorized discounts
15. Client import/export - get all existing clients into PetPro fast
16. Boarding management system (see detailed specs below)
17. Daycare management system (see detailed specs below)
18. Tentative hold system for bookings
19. Groomer schedule preferences (block times, leave early, custom availability)
20. Manager mode with role-based permissions
21. Staff management system (see detailed specs below)
22. Checkout checklist system
23. Report cards for boarding and daycare (photos sent to customer portal)
24. UI polish and mobile responsiveness
25. Bug fixing - Nicole using PetPro daily at work for ~1 month

### PHASE 2 — Family and Friends Testing
26. Client self-booking portal
27. Client messaging system ("Talk to PetPro AI" or "Book") - accessibility for deaf/non-verbal users
28. Claude preference for how it messages clients back
29. Twilio SMS activated (clients text Claude to book)
30. AI phone answering system (Twilio ConversationRelay - Claude answers calls, books or takes messages)
31. Sister and family test the full client experience

### PHASE 3 — Real Client Testing
32. Invite real clients to book through PetPro
33. Run PetPro alongside MoeGo for 1-2 months
34. Stop using MoeGo once confident

### PHASE 4 — Go Live
35. Stripe subscription payments (charge clients through PetPro)

### TIER SYSTEM (Future)
- Different tiers get different Claude access levels
- More Claude usage = higher tier pricing
- Voice, chat, auto-booking, SMS, phone answering all tiered

---

## DETAILED FEATURE SPECS

### Boarding Management System
- **Kennel/Run capacity** - shop defines how many runs/kennels they have, what size (small/medium/large)
- **Check-in / Check-out times** - configurable per shop
- **Medications tracking** - what meds, dosage, time of day, who administered, logged
- **Kennel aggression flag** - separate from grooming aggression, some dogs are fine for grooming but NOT for boarding
- **Food tracking** - does the dog eat? Special food? Owner brings food vs kennel food? Daily food charge if kennel provides
- **Auto-alert: Dog not eating** - if a dog hasn't eaten for X meals, alert manager/owner. Dogs can go days without anyone noticing — this is a BIG safety feature
- **Belongings list** - leash, collar, bed, toys, food, medications. Checklist at check-in and check-out so nothing gets lost
- **Grooming after boarding** - option to add a groom before pickup
- **Emergency contact** - separate from owner, in case owner is unreachable
- **Vaccination requirements** - must be current on vaccines to check in (rabies, bordetella, etc.)
- **Pickup authorization** - who is allowed to pick up the dog besides the owner
- **Checkout alert system** - when checking out, prompt the kennel tech: "How did [dog] eat?" "Any behavior issues?" "All belongings returned?" Forces staff to actually check
- **Photos/updates to customer portal** - owners can see photos and updates during boarding stay

### Daycare Management System
- **Temperament test tracking** - passed / needs one / failed. Dogs that fail cannot attend
- **Small dog vs big dog separation** - separate lists/groups, configurable by shop
- **Full day vs half day** - different pricing
- **Bath/grooming after daycare** - option to add services
- **Vet on file required** - must have vet info before attending daycare
- **Accident/incident reports** - document any incidents (fights, injuries, illness) with details, time, staff involved
- **Report cards** - daily report card with photos, behavior notes, sent to customer portal
- **Vaccination requirements** - same as boarding, must be current

### Tentative Hold System
- When a client doesn't respond to a booking offer right away, Claude places a **tentative hold** on that time slot
- Configurable timer (e.g., 2 hours) - if no response, hold expires and slot opens back up
- Claude tells the client they have a 2-hour window to confirm
- Prevents double-booking while waiting for slow responders
- Manager can configure hold duration per shop

### Groomer Schedule Preferences
- Groomers can tell Claude to block off times (lunch break, leave early, personal appointment)
- Claude automatically respects these when booking
- "Don't book me after 3pm on Fridays"
- "Block 12-1 for lunch every day"
- Custom availability that Claude enforces without the groomer having to manually block the calendar

### Manager Mode
- **Password protected** - managers have separate password/PIN to access manager features
- **Role-based permissions** - toggle what each employee role can do (view only, book, edit, delete, etc.)
- **Late clock-in notifications** - if kennel staff clocks in late, manager gets an alert immediately. Configurable: toggle on/off per shop (small shops less strict, bigger shops need this)
- **Configurable strictness** - each shop decides which alerts matter to them

### Staff Management System
- **Employee clock-in / clock-out** - digital time clock
- **Late alerts to manager** - kennel techs coming in 30 min late matters — dogs have been in kennels all day and need to go out
- **Roles** - Groomers, Bathers, Kennel Techs, Receptionists, Managers
- **Role-based scheduling** - who works when, which role
- **Payroll assistance** - Claude helps with payroll tracking (hours worked, overtime, tips)

### Pet Profile Field Protection
- **Grooming preferences** = groomers can edit, BUT Claude validates before saving. Content MUST be grooming-related only
- **Claude validates grooming preferences** — if someone types something non-grooming (like "my boyfriend is Jeff" or "this dog is ugly" or pranks), Claude rejects it with an error: "This field is for grooming notes only." It does NOT save. People WILL prank each other and try to make Claude say/remember dumb stuff — this stops it
- **Allowed examples:** blade lengths, haircut styles, owner preferences, sensitive areas, drying preferences, nail grinding vs clipping, ear plucking, sanitary cuts, face styles
- **Rejected examples:** personal info, jokes, insults, non-grooming commentary, relationship info, complaints about coworkers
- **Everything else** (medical, behavior, allergies, aggression flags, medications, special notes) = **manager-only editing**. Staff can VIEW but cannot change. Prevents pranks and accidental edits to safety-critical info
- Manager can grant edit access per role if they choose (configurable per shop)

### Claude AI Guardrails
- **ALWAYS identify as "PetPro AI"** — NEVER say Sonnet, Claude, Anthropic, or any AI model name. It's PetPro AI, period
- Never give medical/veterinary advice (say "consult your vet")
- Never share one client's information with another client
- Never promise discounts or pricing changes without manager approval
- Never make up information — if Claude doesn't know, it says so
- Each shop can customize additional guardrails through their preferences
- Claude personality is friendly, professional, knowledgeable about grooming

### Claude Memory System
- **Shop profile (permanent)** - each business tells Claude their rules, booking style, preferences. Always loaded
- **Rolling 30-day chat history** - recent conversations saved to database, older ones auto-deleted
- **Important notes** - if something important comes up in chat, Claude can save it permanently to the shop profile
- Claude remembers how EACH business runs THEIR shop — not generic, personalized

### AI Phone Answering (Phase 2)
- Twilio ConversationRelay - Claude answers incoming calls
- Claude can book appointments, answer questions, take messages
- If Claude can't handle something, it takes a message and the groomer calls back
- Professional greeting customized per shop
- Works like a virtual receptionist

---

## Current Status
- **Current Step:** Step 12 - Hands-free "Hey PetPro" wake word
- **Last Updated:** April 15, 2026
- **Phase:** Phase 1 - Groomer Side Testing
- **Step 11 (AI Chat Widget):** COMPLETED

## Important Links
- [[Account Setup Checklist]]
- [[Build Progress Log]]
- [[Session Notes]]

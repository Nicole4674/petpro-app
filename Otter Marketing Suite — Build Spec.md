# 🦦 Otter Marketing Suite — PetPro Build Spec

*Saved from a brainstorm in Cowork. The biggest thing we've planned. Likely a weekend build (per chunk), full suite is multi-week.*

---

## The Vision (the moat)

**Every other marketing tool is generic.** PetPro already knows: every appointment, every pet, every breed, every client history, every service, every product they buy.

Otter (= the Suds mascot doing marketing work) can write:

> *"Bella the goldendoodle is due for her 8-week groom + deshed!"*

Instead of the generic Mailchimp slop:

> *"Book your next appointment 🐾"*

**That context advantage is unreplicable** unless a competitor also runs the booking system. MoeGo could ADD this. Square can't. Mailchimp can't. That's a defensible product moat.

---

## Tier 1 — Easy Wins (ship fast, pure text generation)

### Social media posts
- Groomer uploads a before/after photo
- Otter writes IG / FB / TikTok caption + hashtags + emoji
- Tone matches their brand (set in Shop Settings)

### Review responses
- New Google/Yelp review comes in → Otter drafts a reply
- Professional for bad reviews, warm for good ones
- Groomer approves before posting

### SMS / email re-booking nudges
- "It's been 6 weeks since Bella's last groom!"
- Auto-generated, personalized per pet
- Already partly built — current rebook_followup template

### Seasonal promos
- Otter auto-creates holiday deals (summer shavedowns, holiday bows, spring de-shed)
- Ready-to-send copy
- Pre-built calendar of seasonal triggers

### Pet birthday messages
- Personalized happy birthday text/email
- Optional discount code
- Pulls from pets.dob

### Client welcome sequences
- New client signs up → Otter sends a 3-part intro series:
  1. What to expect at your first groom
  2. Prep tips (no food 2hr before, etc.)
  3. Referral offer

---

## Tier 2 — Medium Effort (needs integrations)

### Google Business Profile posts
- Otter writes and publishes weekly updates/offers directly to Google listing
- HUGE for local SEO (Google Business posts boost ranking)
- Requires Google My Business API integration

### Review request automation
- After each appointment, Otter texts the client asking for a Google review
- Includes the direct link to their Google listing
- **Smart filter**: only asks clients who seem happy (based on no incidents/complaints in notes)

### Referral tracking
- "Share this link with a friend, you both get $10 off"
- Otter manages the codes, tracks referrer → referred mapping
- Auto-applies discounts to both at booking
- (Mostly already planned — Task #86)

### Content calendar
- Otter plans a month of posts in advance based on:
  - Their schedule (slow Tuesdays? push a promo)
  - Seasons (winter coat care, summer shave-downs)
  - What's worked before (engagement tracking)
- Groomer just approves + posts

### Lapsed client win-back
- Client hasn't booked in 90 days?
- Otter sends "we miss Max!" message with a comeback offer
- Personalized per pet, not generic

### Ad copy generator
- Groomer wants to run a Facebook ad
- Otter writes 3 variations + suggests targeting (local, pet owners, X-mile radius)

---

## Tier 3 — Power Moves (biggest builds, biggest value)

### Before/After showcase builder
- Groomer takes 2 photos
- Otter auto-creates side-by-side graphic with their logo / brand colors
- Output: PNG ready to post anywhere
- (Could use canvas-design skill or similar)

### Reputation dashboard
- Otter monitors Google + Yelp + Facebook reviews in one place
- Tracks star rating trends over time
- Instant alerts on bad reviews (so groomer can respond before damage)
- Sentiment analysis

### AI blog writer
- Otter writes SEO blog posts for their website:
  - "5 Signs Your Dog Needs a Deshed"
  - "How Often Should You Groom a Doodle?"
  - "Summer Grooming Tips for Double-Coated Breeds"
- Groomers NEVER do this manually
- Crushes local search (Google loves fresh content)
- Auto-publishes to their site OR exports for them

### Competitor watch
- Otter monitors nearby grooming shops' Google reviews + pricing
- Alerts when a competitor drops in rating ("opportunity")
- Alerts when a competitor raises prices ("you have room")

### Smart upsell suggestions
- Based on pet breed/coat/history
- Otter suggests add-ons to mention at checkout (teeth brushing, nail grinding, deshed treatment)
- Quick text to client BEFORE appointment: "Bella's coat is getting matted — want to add a deshed for $20?"
- Pre-emptive upsell instead of awkward at-the-counter ask

---

## Recommended Build Order

### Phase A — "Otter starts writing" (1 weekend)
Pure text generation. Uses Claude/Suds. No new integrations.
1. Social media post generator
2. Pet birthday messages
3. Lapsed client win-back
4. Review response drafts

### Phase B — "Otter handles the inbox" (1 weekend)
Add review request automation + welcome sequence.
5. Welcome sequence (3-part) for new clients
6. Review request automation post-appointment
7. Content calendar (plan-only, no auto-post)

### Phase C — "Otter publishes" (multi-week, real integrations)
This is the BIG one.
8. Google Business Profile API integration (auto-post)
9. AI blog writer with WYSIWYG editor + export
10. Reputation dashboard (Google Reviews API)

### Phase D — "Otter sees everything" (advanced)
11. Smart upsell suggestions (uses appointment + breed context)
12. Before/After showcase builder (image generation)
13. Competitor watch (Google Places API + scraping)
14. Ad copy generator

---

## Tech Notes / Dependencies

- **Anthropic API**: already integrated (Suds uses Claude). All text gen goes through here.
- **Google Business Profile API**: requires OAuth, business verification. Multi-step setup.
- **Google Places API**: for competitor watch ($).
- **Image gen**: could use existing canvas-design skill for before/after composites, or DALL-E for branded graphics.
- **Approval workflow**: every Otter draft should go through a "Suds suggests this — approve to send?" UX so groomers stay in control.
- **Brand voice settings** in Shop Settings: friendly / professional / playful / luxury. Otter writes in the chosen voice.
- **Per-feature toggles**: groomers opt in to each capability so it doesn't feel overwhelming.

---

## Why This is the Moat (one more time)

A solo groomer in Houston spends ~4 hours/week on marketing they hate.
PetPro's Otter Marketing Suite makes that 4 hours into **30 minutes of approving Otter's drafts**.

Every other tool needs the groomer to:
- Type the post manually
- Know which client hasn't booked
- Remember whose birthday is when
- Write a unique caption for each before/after
- Compose a thoughtful review response

PetPro already has every piece of data needed. **Otter writes everything, groomer just clicks "send."**

## Monetization Model — Credits, not tier upsell

**Decision (Nicole): ship Otter to ALL paid plans. Monetize via the existing credit/token top-up system.**

Every Otter action costs credits:
- Social post draft → ~5 credits
- Review response draft → ~3 credits
- Re-booking nudge → ~2 credits
- AI blog post (full SEO article) → ~50 credits
- Before/after image composite → ~10 credits
- Welcome sequence (3 messages) → ~10 credits

### Why credits beat tiered upsell:
- Zero friction — everyone has access day one
- Light users pay nothing extra (included credits handle 2-3 actions/month)
- Heavy users naturally pay more by topping up
- Self-rationing — they only spend on what they value
- No feature matrix to maintain or gate

### UX implication
**Every Otter action shows credit cost upfront so groomers don't get sticker shock:**

> "📱 Generate social post for Bella — costs 5 credits. You have 247 left. [Generate]"

> "📝 Write SEO blog post — costs 50 credits. You have 247 left. [Write]"

Out-of-credits → standard top-up prompt (already built).

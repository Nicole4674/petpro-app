# 🐾 PetPro AI Vision & Pricing Strategy

## Subscription Tiers

### Tier 1 — Basic (No Claude AI)
- **Price:** ~$80/month
- **Target:** Budget-conscious solo groomers who want the platform without AI
- **Features:**
  - Groomer web dashboard (manual booking)
  - Grooming + boarding calendar management
  - Client database & pet profiles
  - Automated text reminders via Twilio (SMS only, no AI)
  - Client self-booking portal (basic form — pick service, date, time, submit)
  - Kennel card printing
  - Welfare logging (manual entry by kennel techs)
  - Vaccination tracking with expiration alerts
- **Claude AI:** None
- **Client Portal:** Basic form booking only, no chat, no AI

---

### Tier 2 — Little Claude (~$150/month)
- **Price:** ~$150/month
- **Target:** Growing shops that want smart booking protection
- **Features:**
  - Everything in Tier 1
  - Claude AI validates ALL bookings (groomer-side only)
  - AI flags bad bookings automatically:
    - Breed vs time slot mismatches
    - Allergy conflicts with grooming products
    - Medication warnings
    - Boarding capacity & overlap detection
    - Expired or missing vaccinations
  - Flagged Bookings dashboard
  - AI booking suggestions & recommendations
- **Claude AI:** Groomer-side only — flags and validates, clients never interact with Claude
- **Client Portal:** Same basic form booking, but Claude validates behind the scenes

---

### Tier 3 — Full Claude (~$300/month groomer only, ~$350 with client AI)
- **Price:** ~$300/month (groomer AI only) OR ~$350/month (groomer + client AI chat)
- **Target:** Shops that want the full AI experience and competitive edge
- **Features:**
  - Everything in Tier 2

#### At $300 — Full Claude (Groomer Side)
  - Full AI booking brain with voice commands (hands-free mode)
  - Voice booking via "Hey PetPro" wake word
  - Claude handles complex scheduling decisions
  - AI-powered rebooking suggestions
  - Smart capacity optimization

#### At $350 — Full Claude + Client AI Chat
  - Everything above PLUS:
  - **Client-facing AI chat widget** (appears after client sign-in)
  - **Client phone booking via Claude** (Twilio + Whisper voice-to-text)
  - **Real-time pet welfare updates** — clients ask "How's Bella?" and Claude pulls today's welfare logs
  - Clients can book, reschedule, cancel, ask about services/pricing through chat
  - Claude connected to business data via business_id

---

## Enterprise Pricing (Future)
- **Target:** Larger businesses with 3,000+ clients, multi-location
- **Price:** Custom/company-based pricing
- **Features:** Everything in Tier 3 + higher token limits, multi-location support, custom integrations, priority support, dedicated account manager
- **Token limits:** Scaled to business size

---

## Claude AI Client Chat — Technical Design

### How It Works
1. Client creates profile & signs in to their groomer's portal
2. Chat widget appears (small floating bubble, like help desk chats)
3. Client types or calls — message goes to Claude API
4. Claude receives a **system prompt** loaded with:
   - Business name, services, hours, pricing
   - Client's pet profiles (breed, weight, allergies, medications)
   - Past appointment history
   - Current vaccination status
   - Current welfare logs (if pet is boarded)
   - Kennel/boarding availability
5. Claude responds within booking-only guardrails
6. Booking gets created in Supabase, confirmation sent via Twilio SMS

### Connection Method
- Each business has a unique `business_id` in Supabase
- When groomer subscribes to Tier 3 ($350), their `business_id` unlocks client chat
- Every client linked to that business gets the chat widget
- Claude's system prompt auto-populates from the business's Supabase tables

### Phone Booking Flow (Twilio + Whisper)
1. Client calls business number (Twilio)
2. Whisper API transcribes speech to text
3. Text sent to Claude API with same booking system prompt
4. Claude responds with booking info
5. Text-to-speech reads Claude's response back to client
6. Booking confirmed, SMS receipt sent

---

## 🛡️ Token Protection & Guardrails

### The Problem
- AI API calls cost money per token
- 3,000 clients chatting freely = bankruptcy
- Must protect against chit-chat abuse while keeping it useful

### Solutions

#### 1. Token Budget Per Business Per Month
- Tier 3 ($350) gets a set monthly token allowance (e.g., 500,000 tokens)
- A typical booking conversation = ~2,000-3,000 tokens
- That's roughly 150-200 booking conversations/month
- Most clients only book once every few weeks — plenty of budget

#### 2. Per-Conversation Message Limit
- Each chat session: max 8-10 back-and-forth messages
- More than enough to complete a booking
- After limit: "I think we've covered everything! Start a new chat to book another appointment."
- Prevents clients from treating Claude like a chatbot toy

#### 3. Booking-Only Guardrails (System Prompt)
- Claude's system prompt strictly limits conversation to:
  - Booking appointments (grooming, boarding, daycare)
  - Rescheduling or canceling
  - Asking about services, pricing, hours
  - Checking on pet welfare (if boarded)
- If client tries chit-chat, Claude redirects:
  - "That sounds fun! Would you like to book a grooming session?"
- If client persists, Claude stops engaging until booking is mentioned
- This saves tokens AND keeps conversations short

#### 4. Daily Token Cap Per Client
- Individual clients get a small daily token allowance
- Enough for 1-2 booking conversations per day
- Prevents any single client from burning through the business's budget
- Resets daily

#### 5. Usage Dashboard for Groomers
- Show monthly token usage as a visual meter
- Breakdown by: bookings made, welfare checks, general queries
- Alert when approaching monthly limit
- Optional: token top-up add-on for busy months (holiday season, etc.)

---

## 🐾 The Game-Changer: Real-Time Pet Welfare via AI

### Why This Is Huge
- Boarding facilities with cameras charge $200+/night
- PetPro can offer real-time welfare updates WITHOUT cameras
- Kennel techs already log welfare data (feeding, bathroom, behavior, walks)
- Claude reads the welfare logs and gives clients natural language updates

### How It Works
- Client asks: "How's Bella today?"
- Claude checks welfare_logs table for today's entries
- Responds: "Bella ate all her breakfast and lunch, had a good walk at 10am, bowel movements are normal, and the kennel tech noted she's been playful and happy today! She's doing great."
- Cost: ~500 tokens (practically nothing)
- Value: PRICELESS to worried pet parents

### Why Businesses Will Pay For This
- Reduces phone calls from worried owners (saves staff time)
- Clients feel their pets are safe and monitored
- Differentiates from competitors who just have basic booking
- Justifies premium boarding rates
- Builds trust and loyalty — clients keep coming back
- No camera equipment needed — just the data kennel techs already enter

---

## 🏗️ Build Priority & Roadmap

### Phase 1 — Groomer Side (Current — Next 2 Weeks)
- [x] Grooming calendar with day/week/month views
- [x] Appointment detail popup with pet profile & status actions
- [x] Mini calendar widget in sidebar
- [x] Boarding calendar with kennel grid
- [x] Kennel card popup with full pet/health/welfare info
- [x] Welfare logging form (feeding, bathroom, behavior, vomiting)
- [x] Vaccination tracking with expiration warnings
- [x] Printable kennel cards (clipboard + pocket sizes)
- [ ] Client profile page with tabs (past grooming, past boarding, pets, payments, notes)
- [ ] Connect client profile to grooming history
- [ ] Connect client profile to boarding history
- [ ] Welfare history on client profile (toggle per shop — some want clients to see it, some don't)
- [ ] Daycare management on kennel cards
- [ ] Grooming on kennel cards (combo stays)
- [ ] Full testing of all connections

### Phase 2 — Client Portal
- [ ] Client sign-in (sees only their pet profile, NOT the full schedule)
- [ ] Small portal view of what groomer sees
- [ ] Pet profile with vaccination status
- [ ] Upcoming appointments
- [ ] Booking form (Tier 1) or AI chat (Tier 3)
- [ ] Welfare updates (if boarding, toggle per business)

### Phase 3 — Claude AI Integration
- [ ] Tier 2: Claude booking validation (groomer-side flags)
- [ ] Tier 3: Voice booking with "Hey PetPro" wake word
- [ ] Tier 3: Client AI chat widget
- [ ] Tier 3: Phone booking (Twilio + Whisper + Claude)
- [ ] Tier 3: Real-time welfare check via chat ("How's Bella?")
- [ ] Token management system (per-business budgets, per-client daily caps)
- [ ] Usage dashboard for groomers

### Phase 4 — Monetization & Scale
- [ ] Stripe subscription billing (Tier 1 / Tier 2 / Tier 3)
- [ ] Enterprise pricing (custom per company)
- [ ] Token top-up add-on
- [ ] Multi-location support
- [ ] Vercel deployment & production launch

---

## 💡 Key Insight
> "Grooming apps don't have AI for clients. That's the competitive edge. Clients will LOVE talking to Claude about their pets, and businesses want their money. The welfare check feature alone — 'How's Bella today?' — would sell the whole tier. No cameras needed, just the data kennel techs already enter. This is why places with cameras charge $200/night. PetPro does it smarter."

---

*Last updated: April 16, 2026*
*PetPro — AI-Powered Pet Grooming & Boarding SaaS* 🐾

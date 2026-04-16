**

# PetPro Command Center

## How to Start the App

cd C:\Users\tread\PetPro\PetPro

  

npm run dev

  

Then open: [http://localhost:5173](http://localhost:5173)

## Tech Stack

- React — frontend (the app you see)
    
- Supabase — database, user accounts, Edge Functions
    
- Claude API — AI brain (chat, voice, booking, everything smart)
    
- Twilio — two-way SMS + phone calls with clients
    
- Stripe — PetPro subscription sales only (not client payments)
    
- Web Speech API — voice commands (free, built into Chrome)
    
- Picovoice — wake word detection ("Hey PetPro")
    
- Vercel — hosting (so app works from any device)
    

## Important Paths

- App folder: C:\Users\tread\PetPro\PetPro
    
- Source code: C:\Users\tread\PetPro\PetPro\src
    
- Pages: C:\Users\tread\PetPro\PetPro\src\pages
    
- Components: C:\Users\tread\PetPro\PetPro\src\components
    
- CSS: C:\Users\tread\PetPro\PetPro\src\App.css
    
- Edge Functions (Supabase): Deployed via Supabase dashboard
    

## Key Files

- App.css — all styles for the whole app
    
- App.jsx — main app layout, sidebar, routing
    
- Calendar.jsx — schedule/calendar page (src/pages/)
    
- AIChatWidget.jsx — the Claude chat bubble (src/components/)
    
- chat-command — Supabase Edge Function (Claude's brain with tools)
    
- Sidebar.jsx — navigation sidebar (src/components/)
    
- ImportClients.jsx — MoeGo CSV import page
    
- index.css — global base styles (src/)
    

## Supabase Edge Functions

- chat-command — Claude AI with 15 tools (search, book, edit, delete, SALT pricing, etc.)
    
- check-booking — Claude safety check for new appointments
    
- send-flag-email — email notification for flagged bookings
    
- send-flag-sms — SMS notification for flagged bookings
    

## Claude AI Can Do

- Search clients by name or phone
    
- Add, edit, delete clients (requires first name, last name, phone)
    
- Add, edit, delete pets
    
- Mark pets as deceased
    
- Book appointments (with weight-based pricing and time blocks)
    
- Cancel and reschedule appointments
    
- SALT pricing (Same As Last Time)
    
- Mark clients as Do Not Book
    
- Check schedule for any date
    

## Pricing Built Into Claude

### Full Groom (by weight)

- Under 10 lbs: $55 (Yorkies: $50)
    
- 10-15 lbs: $55
    
- 15-20 lbs: $60
    
- 25-35 lbs: $65
    
- 35-45 lbs: $70
    
- 50-60 lbs: $75
    
- 60-70 lbs: $80
    
- 80-95 lbs: $95
    
- 95-100 lbs: $105
    
- 100-110 lbs: $130 (large breed)
    
- 110-120 lbs: $150
    

### Time Blocks

- Under 70 lbs: 1 hour
    
- 70-89 lbs: 1.5 hours
    
- 90+ lbs: 2 hours
    

### Maintenance

- Under 25 lbs: $25
    
- 30-40 lbs: $40
    
- 50-70 lbs: $60
    
- Golden Retrievers (deshed + outline): flat $75
    
- Huskies (deshed): flat $65
    
- Doodle tidies: $45 (over 60 lbs: $55)
    

### Bath Only (30 min)

- Chihuahuas & Boston Terriers: $25
    
- All others: $35
    

### Nails (walk-in)

- Regular: $10
    
- With dremel: $15
    

### Add-Ons (must have bath or groom)

- Dremel: $10
    
- Teeth: $10
    
- Pampered Package (teeth + dremel): $15
    

## Accounts & Logins

- Supabase: dashboard.supabase.com (Edge Functions, database)
    
- Anthropic: console.anthropic.com (Claude API key, $200 credits)
    
- Vercel: vercel.com (hosting - not set up yet)
    
- Twilio: twilio.com (SMS/calls - not set up yet)
    
- Stripe: stripe.com (subscriptions - not set up yet)
    

## What's Built

- Login/signup with Supabase auth
    
- Dashboard
    
- Calendar (week/day/month views, red time indicator)
    
- Client management (579 imported from MoeGo)
    
- Pet profiles with health flags
    
- Claude AI chat with real actions
    
- SALT pricing
    
- Weight-based pricing and time blocks
    
- Sidebar navigation with categories
    
- MoeGo CSV import
    
- Booking safety checks with Claude
    
- Flag notifications (email + SMS)
    
- Timezone set to Central
    

## What's Next to Build

1. Voice mode (hands-free commands while grooming)
    
2. Twilio SMS (two-way texting with clients)
    
3. Boarding management
    
4. Vercel deployment (access from any device)
    
5. Wake word ("Hey PetPro")
    
6. Role-based permissions (groomer, manager, receptionist, kennel tech)
    
7. Client self-booking portal
    
8. Stripe subscription billing
    
9. Phone answering (Claude picks up calls)
    
10. Purple theme across full app
    

## Nicole's Preferences

- Purple theme (loves the sidebar purple)
    
- No matting fees
    
- Pads/sani added to trim = no extra fee
    
- Checkout = just a button (Zelle, Venmo, Cash, Card) not actual processing
    
- SALT pricing is important — don't flag discounted repeat prices
    
- Claude should do EVERYTHING manual UI can do
    
- Go step by step, one file at a time, never assume
    

  
**

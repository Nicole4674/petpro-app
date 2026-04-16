# Account Setup Checklist

Create these accounts in this order. You only need Supabase and Vercel to start building.

## Needed NOW (Steps 1-5)

### 1. Supabase (Database)
- **URL:** https://supabase.com
- **Cost:** Free tier - no credit card needed
- **What it is:** Your database. Stores all client info, pet profiles, appointments, everything.
- **Status:** [x] Created - April 14, 2026

### 2. Vercel (Hosting)
- **URL:** https://vercel.com
- **Cost:** Free tier - no credit card needed
- **What it is:** Where your website lives on the internet. People visit your Vercel URL to use PetPro.
- **Status:** [x] Created - April 14, 2026

## Needed LATER (Steps 6-11)

### 3. Anthropic Console (Claude AI Brain)
- **URL:** https://console.anthropic.com
- **Cost:** Pay as you go - start with $10-20
- **What it is:** The developer dashboard where you get API keys so PetPro can talk to Claude AI. This is SEPARATE from the Claude chat app.
- **Needed at:** Step 6
- **Status:** [x] Account created - payment went through
- **Old key revoked** on April 14, 2026 - will create new key at Step 6
- **Where to create new key:** Console → Manage → API Keys → + Create key

### 4. Twilio (SMS/Text Messages)
- **URL:** https://twilio.com
- **Cost:** Free trial with test credits
- **What it is:** Sends and receives text messages. Clients text to book, Claude responds.
- **Needed at:** Step 9
- **Status:** [ ] Created

### 5. SendGrid or Resend (Email)
- **URL:** https://sendgrid.com or https://resend.com
- **Cost:** Free tier (SendGrid = 100 emails/day free)
- **What it is:** Sends booking confirmations, reminders, flag alerts to groomers.
- **Needed at:** Step 8
- **Status:** [ ] Created

### 6. Stripe (Payments)
- **URL:** https://stripe.com
- **Cost:** Free to set up, has test mode
- **What it is:** Handles monthly subscription payments from grooming shops using PetPro.
- **Needed at:** Step 10
- **Status:** [ ] Created

## API Key Safety Rules
- NEVER paste API keys in chat, email, or shared documents
- NEVER save keys in Obsidian (it may sync)
- Keys go in a `.env` file in your project (I will set this up for you at Step 6)
- If a key is exposed, revoke it immediately and create a new one
- You can always create new keys - no need to memorize them

---

## Business Infrastructure (Set up April 15, 2026)

### 7. Domain - trypetpro.com
- **Registrar:** Namecheap
- **URL:** https://www.namecheap.com
- **Cost:** ~$11.18/year
- **What it is:** Your business domain. Used for email AND will eventually point to your live PetPro web app on Vercel.
- **Status:** [x] Purchased April 15, 2026
- **Login:** PetPro4674 (Namecheap username)
- **Where to manage DNS:** Domain List → Manage → Advanced DNS

### 8. Business Email - nicole@trypetpro.com
- **Provider:** Zoho Mail (Mail Lite plan)
- **Admin URL:** https://mailadmin.zoho.com
- **Webmail URL:** https://mail.zoho.com
- **Cost:** ~$12/year (Mail Lite tier)
- **What it is:** Your professional business email. Required for signing up to platforms like Picovoice that block @gmail.com.
- **Status:** [x] Created and verified April 15, 2026
- **Email:** nicole@trypetpro.com
- **Password:** (saved separately - NOT in Obsidian)

### DNS Records Configured in Namecheap (DO NOT DELETE)
| Type | Host | Value | Priority |
|------|------|-------|----------|
| TXT | @ | zoho-verification=zb54456763.zmverify.zoho.com | - |
| TXT | @ | v=spf1 include:zohomail.com ~all | - |
| TXT | zmail._domainkey | v=DKIM1; k=rsa; p=MIGfMA0G... (DKIM key) | - |
| MX | @ | mx.zoho.com | 10 |
| MX | @ | mx2.zoho.com | 20 |
| MX | @ | mx3.zoho.com | 50 |

**Mail Settings in Namecheap:** Custom MX (NOT Email Forwarding)

### 9. Picovoice (Wake Word "Hey PetPro")
- **URL:** https://console.picovoice.ai
- **Cost:** Free tier for development; ~$0.50/user/month at scale (commercial)
- **What it is:** Wake word engine that lets the app listen for "Hey PetPro" like Alexa. Way better than Web Speech API.
- **Signup email used:** nicole@trypetpro.com
- **Status:** [x] Submitted April 15, 2026 - awaiting commercial approval (usually <24 hrs)
- **Use case submitted:** AI-powered SaaS for pet groomers, hands-free voice booking
- **Next step after approval:** Get AccessKey, swap out Web Speech wake word in VoiceMode.jsx

## Quick Login Reference
- **Namecheap:** namecheap.com → username PetPro4674
- **Zoho Admin:** mailadmin.zoho.com
- **Zoho Webmail:** mail.zoho.com → nicole@trypetpro.com
- **Picovoice Console:** console.picovoice.ai → nicole@trypetpro.com

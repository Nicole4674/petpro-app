# SMS Setup (Last Priority)

> **Status:** Deferred — do this LAST, after everything else launches.
> **Why we paused:** Twilio rejected our A2P 10DLC campaign on first submission.
> The rejection wasn't because of bad legal docs — it was because the booking
> form is behind a client login, so TCR (the SMS gatekeeper) couldn't see the
> consent checkbox without an account.
>
> Email-only is our default position and our marketing angle ("clients hear from
> YOUR business, not a random number"). SMS is OPTIONAL for shops that want it
> later — never the default.

---

## What we already have ✅

- ✅ Privacy.jsx page with full SMS-specific language
  (message frequency, msg/data rates may apply, STOP/HELP, Twilio listed as third party)
- ✅ Terms.jsx page with "SMS Messaging Program" section
  (opt-in at booking, 1-4 msgs/appt, STOP/HELP, mobile carrier disclosure)
- ✅ Twilio account created
- ✅ A2P brand registered (Pamperedlittlepaws)
- ✅ Campaign details filled out (use case, sample messages, message flow)

---

## Why Twilio rejected (Error 30909)

> "Issues verifying the Call to Action (CTA) provided for the campaign"

Translation from Twilio docs:
> *"Your opt-in evidence cannot be verified because the website is private,
> behind a login, incomplete, or missing publicly accessible screenshots of
> the consent flow."*

**Root cause:** Reviewers couldn't see our booking form (it's behind client login),
so they couldn't verify clients actually check a "yes I want SMS" box.

---

## To Do When Ready (in order)

### 1. Add SMS consent checkbox to booking form
- Add a `Send me text reminders` checkbox to the client booking flow
- Default OFF (opt-in, not opt-out)
- Save the consent + timestamp to the clients table:
  - New columns: `sms_consent` (bool), `sms_consent_at` (timestamp)
- Show consent text near checkbox: *"By checking this, I agree to receive
  appointment reminders via SMS. Msg/data rates may apply. Reply STOP to opt out."*
- Link Privacy + Terms pages right next to the checkbox

### 2. Make consent flow PUBLICLY viewable
Pick ONE of these two approaches:
- **A)** Add a public demo booking page at `trypetpro.com/demo-booking` that
  shows the booking flow with the SMS checkbox visible (no login required)
- **B)** Take screenshots of the booking flow showing the SMS consent step,
  host them at `trypetpro.com/sms-consent-screenshots/` (publicly viewable)

### 3. Update website URL in Twilio
- Change from `petpro-app.vercel.app` → `trypetpro.com` (real domain)
- Add the public consent URL from step 2

### 4. Update Twilio campaign Message Flow field
Rewrite to clearly say:
> "End users opt in by checking an SMS consent box at trypetpro.com/booking
> (or trypetpro.com/demo-booking for review). The checkbox is required and
> defaults to OFF. The consent text reads: [paste your final consent text].
> Privacy Policy: trypetpro.com/privacy. Terms: trypetpro.com/terms."

### 5. Resubmit campaign for review
- Click "Fix Campaign" in Twilio
- Paste new message flow + URLs
- Submit
- Wait 2-4 weeks for approval

### 6. Once approved, build the SMS toggle
- Add `sms_enabled` toggle to shop_settings (default: OFF for all shops)
- Build edge function `send-sms-via-twilio` (similar pattern to email)
- Add SMS sends to: appointment reminders, rebook notifications,
  schedule changes — but ONLY if shop has toggle on AND client has consent
- Add per-message log so groomer can see "sent X SMS this month, paid Y"

---

## Cost Notes

- Twilio A2P 10DLC: ~$2/month per phone number + ~$0.0079 per SMS sent
- Twilio brand registration fee: $4 one-time
- Approved campaigns: free per campaign once approved
- Estimated cost for active mobile groomer: $5-15/month additional

We pass this cost through to groomers who toggle SMS on (small surcharge on
their subscription tier, OR they bring their own Twilio account).

---

## Marketing Angle (whether we ever build SMS or not)

The rejection actually validates our email-only stance. Marketing copy:

> *"Why no SMS? Everyone has email. Email gives notifications just like text —
> but unlike text, your clients actually know who's sending it. We chose email
> because the texts our groomers send through other tools just get ignored.
> People say 'I didn't get the message' when they really mean 'I didn't recognize
> the number.' If a client genuinely wants SMS later, we can add it as an opt-in
> per shop — but our default is email because it actually works."*

---

## Decision Log

- **2026-05-01:** Twilio campaign rejected. Decided to defer SMS to last priority.
  Email-only via Resend is the default. Privacy + Terms already updated with SMS
  language so we don't have to rewrite when we revisit.

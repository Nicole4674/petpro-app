# Steps 8-9 Vision Notes (Nicole's Specs)

## Email System (Step 8 - SendGrid)
- Claude auto-sends flagged booking emails to the specific groomer assigned
- Multiple groomers per shop supported - email goes to the RIGHT groomer
- Groomer can click APPROVE or DECLINE directly from the email
- If DECLINE, groomer picks a reason:
  - Needs new time slot (Claude finds client a better slot)
  - Needs longer time block (Claude rebooks with more time)
  - "I'll talk to owner" (Claude moves on, groomer handles it)
  - Groomer can approve/book it themselves manually
- Groomers can opt in or opt out of email notifications
- Groomers will have phone near them, may use website on phone

## Texting System (Step 9 - Twilio)
- Two-way SMS for both groomers and clients
- Client portal: clients can text Claude for booking, report cards, etc.
- Toggle system for groomer preferences

## Groomer Settings Toggles (Per Groomer)
- PetPro AI: ON/OFF (master toggle)
- Text notifications: ON/OFF
- Auto-booking by Claude: ON/OFF
- Email notifications: ON/OFF
- Each groomer picks how much or how little Claude does
- Some shops have receptionists - Claude is just an assistant
- Some solo groomers want Claude doing everything

## Multi-Groomer Support Needed
- Add ability for multiple groomers AND bathers per shop
- Each groomer has their own schedule, clients, preferences
- Flags go to the specific groomer, not broadcast to all
- Commission groomers vs hourly bathers (different roles)

## Key Principle
Every shop is different - the system must be fully customizable per groomer.

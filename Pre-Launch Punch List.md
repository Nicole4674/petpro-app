# Pre-Launch Punch List

**Date added:** April 22, 2026
**Context:** Nicole remembered these after Stripe setup. All three are important and should ship before public launch, not after.

---

## 1. Multiple Contacts Per Client (MUST-HAVE BEFORE LAUNCH)

### The Problem
Right now the client record has ONE phone number. But in real life:
- Wife books the appointment, husband drops the dog off
- Owner is at work, nanny handles grooming day
- Grown kid schedules for aging parent
- Divorced co-parents split pet duty

If we only text the primary contact, the person actually doing the drop-off misses every reminder. That breaks Twilio SMS for real customers.

### Recommended Solution: New `client_contacts` Table

Instead of cramming more phone columns onto the clients table, make a separate table that links back. This is cleaner and scales to any number of contacts.

**Table schema:**
```sql
create table client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  first_name text not null,
  last_name text,
  phone text not null,
  email text,
  relationship text,  -- Owner, Spouse, Partner, Parent, Child, Nanny, Dog Walker, Other
  is_primary boolean default false,
  is_emergency boolean default false,  -- handles #2 below automatically
  can_book_appointments boolean default true,
  can_pickup_pet boolean default true,
  sms_opted_in boolean default true,
  created_at timestamptz default now()
);
```

### Where to Edit Contacts (MY CALL: BOTH SIDES)

**Groomer side (Nicole's dashboard):**
- On Client Detail page, add a "Contacts" section/tab
- Shows all contacts in a list
- "+ Add Contact" button opens a mini form
- Each row has edit + delete
- Nicole needs this because she hears about these people during intake ("my husband will drop him off Tuesday") and can add them on the spot

**Client portal side:**
- On client's own profile page, a "Manage Contacts" section
- Client can self-serve add family members
- When they add someone, that person gets an SMS: "Sarah added you as a contact on her PetPro account for Max the Golden. Reply STOP to opt out."

### Booking Flow Change
When booking an appointment, add a dropdown: "Who's dropping off?" defaulted to the primary contact. Whoever is selected gets the SMS reminders for that specific appointment. Store `drop_off_contact_id` on the appointment row.

### Claude AI Changes Needed
- New tool: `add_client_contact` (name, phone, relationship, permissions)
- New tool: `list_client_contacts`
- Existing `send_client_message` tool needs to accept a contact_id so it texts the right person

---

## 2. Emergency Contact (MUST-HAVE BEFORE LAUNCH)

### The Problem
Dog injured during groom. Owner doesn't answer. Who else can authorize a vet visit? Without an emergency contact on file, you're stuck calling the vet blind.

### My Recommendation: Fold Into Multi-Contacts (ABOVE)

The simplest solution — when building the `client_contacts` table (above), include an `is_emergency` boolean flag. Then the emergency contact IS just one of the regular contacts, marked as emergency.

**Why this is better than a separate "emergency_contact" column on the clients table:**
- One less place to store phone numbers
- Emergency contact can be the spouse, the regular drop-off person, or a separate person — flexible
- Client already entered this person's info as a contact, no duplicate data entry

### UI Treatment
- Flag `is_emergency = true` shows a red "EMERGENCY" badge next to that contact
- On Client Detail page, add a prominent "Emergency Contact" card at the top that pulls from the contact marked `is_emergency = true`
- Printable check-in form for boarding MUST include the emergency contact prominently (already on the boarding print form — just needs to pull from new schema)
- If no contact is marked as emergency, show a red warning banner: "⚠ No emergency contact on file — add one"

### Where to Set Emergency Flag
Both groomer-side AND client-side. Nicole marks it during intake. Client portal allows them to toggle it on one of their contacts.

---

## 3. Staff Profiles Build-Out (BEFORE LAUNCH — GATED TO PRO $129+)

### The Problem
The app has StaffList and StaffDetail pages already wired up, but the staff profile fields are thin. For a real shop with multiple groomers, bathers, and kennel techs, we need richer profiles so Nicole can:
- See who's best at which breeds
- Match clients to groomers they've seen before
- Track certifications and liability-critical info
- Let clients choose their preferred groomer on the booking portal

### Fields to Add to Staff Profile

**Identity:**
- Profile photo (Supabase Storage upload)
- Display name (what clients see)
- Bio (short, for public booking portal display)
- Pronouns (optional)

**Professional:**
- Role: Owner, Groomer, Bather, Kennel Tech, Receptionist, Manager (already on the table if #58 did it, confirm)
- Hire date
- Years grooming experience
- Specialties: multi-select (Doodles, Large Breeds, Show Grooms, Creative Color, Hand Strip, De-Shed, Double-Coated, Cats, Senior Dogs, Anxious Dogs)
- Certifications: text list with expiration dates (NDGAA, IPG, PetTech CPR, Fear Free Certified, etc.)

**Operational:**
- Hourly rate OR commission percentage (for payroll — already exists if payroll phase is done)
- Schedule preferences (preferred days/hours)
- Max bookings per day (personal cap)
- Skill cap (some groomers don't take 100+ lb dogs — auto-filter the calendar)

**Client-facing (for portal):**
- "Meet our team" public bio toggle
- Preferred pronouns public toggle
- Before/after portfolio photos (Supabase Storage)
- Average rating (if we add reviews later)

### Tier Gating (ties back to task #92)
- Basic $70: Single-groomer shop — hide staff page entirely OR show just the owner's profile, no ability to add more
- Pro $129 and up: Full staff management + multi-staff profiles unlocked

### Staff Portal Login (already on list as Task #58)
Once profiles are rich, #58 becomes more valuable — staff log in, see their own schedule, clock in/out, see their paychecks. Don't need to do #58 before launch but it SHOULD follow closely.

---

## Build Order Recommendation

If Nicole wants to knock all three out before launch, best order is:

1. **Client contacts table first** (fixes BOTH multi-contact problem AND emergency contact in one migration)
2. **Groomer-side UI** for adding/editing contacts on Client Detail page
3. **Client-side UI** for self-managing contacts in portal
4. **Update Claude AI** with contact-aware tools
5. **Update booking flow** to pick drop-off contact
6. **Update SMS triggers** to text the right contact per appointment
7. **Staff profile enhancement** (separate track, can run in parallel with the above)

Rough time estimate (with Claude's help, step-by-step):
- Client contacts: 1-2 sessions (~3-5 hours total)
- Staff profiles: 1 session (~2-3 hours)

---

## Can Nicole Still Edit All This?

Yes — this is just a plan. Nothing's built yet. Easy to shift scope:
- Skip the `can_book_appointments` / `can_pickup_pet` permission flags if they feel overbuilt
- Simplify to just name + phone + relationship + is_emergency on contacts
- Defer staff bio/portfolio to post-launch

Nicole picks what ships in v1. This file is the ideas, she's the editor.

---

## Status

- [ ] #97 NEW: Client contacts table + multi-contact support
- [ ] #98 NEW: Emergency contact (handled via client_contacts is_emergency flag)
- [ ] #99 NEW: Staff profile enhancement (photo, specialties, certifications, bio)

To add to task list when resuming.

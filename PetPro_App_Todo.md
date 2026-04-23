# PetPro — App Polish To-Do

**Start date:** 4/23 after work
**Goal:** knock these out, grab the next list, polish, launch.

Work through one at a time. Check off as we finish each.

---

## Current List

- [x] **Calendar quick-jump shortcut** — MoeGo-style 1-14 weeks out grid under the mini calendar in the grooming sidebar. Jumps from today and switches to day view. ~~Boarding calendar~~ skipped (no sidebar to fit it in).
- [x] **Collapsible calendar sidebar** — `‹` / `›` toggle button at top-right of sidebar. Collapses to 28px strip for full-width calendar (great on phone). State saved in localStorage so it sticks.
- [x] **Shop location on client portal detail view** — address shown with 📍 pin in the purple branding banner at the top of the client portal dashboard. Includes a "Get Directions →" link that opens Google Maps (tap-friendly on phones).
- [x] **Edit contact info + emergency contact (both sides)** — groomer side can edit client's contact info, client side can edit their own info and emergency contact. Covers launch-checklist tasks #97 + #98.
  - [x] Part A — DB schema `client_contacts` table (live in Supabase)
  - [x] Part B — Groomer side "📞 Contacts" tab in ClientDetail.jsx (add/edit/delete, emergency + pickup-authorized flags, relationship suggestions)
  - [x] Part C — Client portal "Emergency & Pickup Contacts" card on Overview (clients add/edit/delete their own)
- [ ] **Staffing system with roles** — build out groomers, kennel staff, and managers with role-based permissions. Combines task #58 (staff logins) and #99 (staff profiles). Managers get broader access, groomers see their own clients, kennel staff see kennel-relevant views.
- [x] **Smart Client Signup Match (CRITICAL pre-launch)** — fixed `create_client_on_signup` DB trigger so existing unclaimed clients (groomer-entered, no user_id) get LINKED when they sign up for the portal, instead of creating a duplicate row. Matches by email + groomer_id. SQL: `Smart Client Signup Match v1.sql`.
- [x] **Edit Client button on ClientDetail.jsx** — inline edit on Contact Information card. Edit name (marriage changes), phone, email, address, preferred contact. Warns if client already has portal access that email-change won't change their login.
- [x] **Drag-to-reschedule appointments** — grab an appt block, drag it to a new slot. Works in day AND week view. Confirm modal shows old/new time + groomer (if day-view drop changes groomer). Conflict check blocks moves that would double-book. Cancelled / checked-out appts aren't draggable. Drop target cells highlight purple while dragging. Recurring appts default to "this one only" with a warning.
- [ ] **Color palette choice (bright vs. neutral)** — keep the current colorful palette AND add a neutral/natural option (whites, tans, soft earth tones). Let groomers pick in Shop Settings. Cater to both — some love the bright colors, some want calmer tones.
- [ ] **Revenue stats panel on calendar sidebar** — MoeGo-style "Calendar report" block: Total appts, Total pets, Finished appts, Earned Rev, Expected Rev. Day / Week / Month toggle. Nicole uses this daily at-a-glance view — AI won't replace it.

---

## Notes

- Add more items here tomorrow as they come up.
- When all boxes above are checked, grab the next list and repeat.
- Once there's nothing left to tweak → launch.

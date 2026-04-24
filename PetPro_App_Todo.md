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
- [x] **Color palette choice (bright vs. neutral)** — staff color picker now shows two rows of preset swatches: 8 BRIGHT (purple, blue, cyan, green, amber, orange, red, pink) + 8 NEUTRAL (tan, taupe, cream, sage, dusty rose, stone, slate, charcoal). Custom color picker stays as fallback for anything unusual. Available on both AddStaff form (StaffList.jsx) and Edit Staff (StaffDetail.jsx).
- [x] **Revenue stats panel on calendar sidebar** — fully MoeGo-matched now. Total Pets (unique pet count) + Finished appts added to the sidebar revenue block. Pets are counted across multi-pet bookings via appointment_pets.
- [x] **Client portal: edit first + last name** — added First + Last name fields to Contact Information edit form on the client portal.
- [x] **Inactive / Active client status** — added `is_active` column to clients table (default true). `💤 Mark Inactive` / `♻️ Reactivate` button on ClientDetail header. Inactive clients hidden from Clients list by default; "Show inactive (N)" checkbox reveals them grayed out. INACTIVE badge shows on the client's name + in the list.
- [x] **Search pets OR clients when booking** — both Calendar and BoardingCalendar search by pet name too. Pet matches show as "🐾 [pet name] — [owner]" and auto-add the pet to the booking when selected.
- [x] **Delete messages / delete thread** — × button on each message bubble (hover on desktop / always on mobile). Groomer can delete any message; client can only delete their own. Plus a "🗑️ Delete chat" button in the thread header to wipe the whole conversation.
- [x] **Mass text (day-of cancellation)** — 📣 Mass Text button on Calendar header. Pick a date, modal shows every client with an appt that day (with their phone + appt times), uncheck any to skip, type one message, hit Send. Invokes `send-sms` edge function for each recipient. Shows sent/failed counts after. Clients without phone auto-excluded.

---

## Known Bugs to Fix Before Invites Go Out

- [x] **Client portal confirm-email redirect lands on groomer dashboard** — fixed. App.jsx `/` route was blindly sending any logged-in user to the groomer Dashboard. Added `RootRedirect` component that checks if the user has a `clients` row → routes to `/portal`. Groomers still go to Dashboard.

## Notes

- Add more items here tomorrow as they come up.
- When all boxes above are checked, grab the next list and repeat.
- Once there's nothing left to tweak → launch.

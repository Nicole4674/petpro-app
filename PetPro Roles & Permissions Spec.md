# 🐾 PetPro Roles & Permissions System — Full Spec

> **Purpose:** Define every role, permission, default access level, database schema, and UI behavior for PetPro's multi-staff management system.
> **Reference competitors:** MoeGo (Owner/Admin/Groomer Pro roles, $239/unit Ultimate pricing, sales dashboards) and Gingr (25+ granular permission checkboxes, team color codes, scheduling calendar).
> **PetPro advantage:** Roles set sensible DEFAULTS, but every single permission can be toggled ON/OFF per individual employee by Owner/Manager. No rigid role boxes.

---

## 1. Job Titles (Roles)

These are the **7 default roles** in PetPro. Each role comes with a preset permission template that Owners/Managers can fully customize per employee.

| # | Role | Description | Typical Use |
|---|------|-------------|-------------|
| 1 | **Owner** | Full access to everything. Cannot be restricted. | Business owner (Nicole) |
| 2 | **Manager** | Near-full access. Can manage staff, override bookings, view reports. | Trusted senior employee who runs the shop when owner is away |
| 3 | **Groomer** | Can view/edit their own appointments, access client & pet info, add grooming notes. | Licensed groomer doing haircuts |
| 4 | **Bather** | Can view their own schedule, see pet info & grooming notes, log bath completion. | Bath & brush staff, prep work |
| 5 | **Kennel Tech** | Can view boarding reservations, log welfare checks, print kennel cards. | Boarding/daycare staff |
| 6 | **Front Desk / Receptionist** | Can book appointments, manage clients, handle check-in/out, process payments. | Customer-facing staff |
| 7 | **Trainers** | Can view training schedule, access pet behavior notes, log training sessions. | Dog trainers (future module) |

> 💡 **Custom Roles:** Phase 2 will allow Owners to create entirely new role names (e.g., "Lead Groomer," "Kennel Manager") with custom default permission sets.

---

## 2. Permission Categories & Individual Permissions

Each permission is a **toggle (ON/OFF)** per employee. Roles just set the starting defaults.

### 📅 2A. Calendar & Scheduling

| Permission | Owner | Manager | Groomer | Bather | Kennel Tech | Front Desk | Trainer |
|------------|:-----:|:-------:|:-------:|:------:|:-----------:|:----------:|:-------:|
| View own schedule | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all staff schedules | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Create appointments (own) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Create appointments (others) | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Edit own appointments | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Edit others' appointments | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Cancel/delete appointments | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Override appointment capacity | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Set own working hours | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Set others' working hours | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View mini calendar (all) | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

### 🐕 2B. Clients & Pets

| Permission | Owner | Manager | Groomer | Bather | Kennel Tech | Front Desk | Trainer |
|------------|:-----:|:-------:|:-------:|:------:|:-----------:|:----------:|:-------:|
| View client list | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View client profile/details | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add new clients | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Edit client info | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Delete clients | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Add/edit pet profiles | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| View pet medical info (allergies, meds) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit pet medical info | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Add grooming notes | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Add client notes | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| View grooming/client notes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete notes | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Email clients | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| SMS/text clients | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

### 🏨 2C. Boarding & Daycare

| Permission | Owner | Manager | Groomer | Bather | Kennel Tech | Front Desk | Trainer |
|------------|:-----:|:-------:|:-------:|:------:|:-----------:|:----------:|:-------:|
| View boarding calendar | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Create boarding reservations | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Edit boarding reservations | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Cancel boarding reservations | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Log welfare checks | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| View welfare logs | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Print kennel cards | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Manage kennel/run assignments | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Override boarding capacity | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage daycare check-in/out | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |

### 💉 2D. Vaccinations

| Permission | Owner | Manager | Groomer | Bather | Kennel Tech | Front Desk | Trainer |
|------------|:-----:|:-------:|:-------:|:------:|:-----------:|:----------:|:-------:|
| View vaccination records | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add/edit vaccination records | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Override expired vaccination warnings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage required vaccine list | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 💰 2E. Pricing, Payments & Financial

| Permission | Owner | Manager | Groomer | Bather | Kennel Tech | Front Desk | Trainer |
|------------|:-----:|:-------:|:-------:|:------:|:-----------:|:----------:|:-------:|
| View service prices | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Edit service prices | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Add/edit services | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Process payments / check out | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Issue refunds | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View revenue reports | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View own sales/tips | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| View all staff sales/tips | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Apply discounts/coupons | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Override pricing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Open cash drawer (POS) | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

### 👥 2F. Staff Management

| Permission | Owner | Manager | Groomer | Bather | Kennel Tech | Front Desk | Trainer |
|------------|:-----:|:-------:|:-------:|:------:|:-----------:|:----------:|:-------:|
| View staff list | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Add new staff members | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit staff profiles | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Deactivate/remove staff | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Change staff roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Toggle individual permissions | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View payroll/commission settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit payroll/commission settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Clock in/out (own) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View others' clock in/out | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit time entries | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 🤖 2G. Claude AI & Smart Features

| Permission | Owner | Manager | Groomer | Bather | Kennel Tech | Front Desk | Trainer |
|------------|:-----:|:-------:|:-------:|:------:|:-----------:|:----------:|:-------:|
| Trigger Claude booking validation | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| View Claude AI flags/suggestions | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Override Claude AI warnings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Access AI preferences/settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Use voice booking mode | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |

### ⚙️ 2H. Business Settings & Admin

| Permission | Owner | Manager | Groomer | Bather | Kennel Tech | Front Desk | Trainer |
|------------|:-----:|:-------:|:-------:|:------:|:-----------:|:----------:|:-------:|
| Edit business profile/settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage subscription/billing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Import/export data | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage notification settings (business-wide) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage own notification preferences | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Access client portal settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. How the Toggle System Works

### 3A. Role = Starting Template

When an Owner adds a new staff member and picks "Groomer," PetPro automatically turns ON all the ✅ permissions from the Groomer column above. That's the **default**.

### 3B. Owner/Manager Can Customize

After assigning a role, the Owner (or Manager, if permitted) can go into that employee's profile and **flip any permission ON or OFF individually**. Examples:

- "Sophia is a groomer, but I trust her to also book for others" → Turn ON *Create appointments (others)*
- "Aaron is front desk, but he should NOT issue refunds" → Turn OFF *Issue refunds*
- "My lead groomer also helps with boarding" → Turn ON all boarding permissions

### 3C. Permission Override Display

In the UI, customized permissions show a **yellow indicator dot** next to them so Owners can see at a glance which permissions have been changed from the role default. A "Reset to Role Defaults" button is available to undo all customizations.

### 3D. Role Change Behavior

When changing an employee's role (e.g., promoting Bather → Groomer):
- **Option A (Default):** Apply new role defaults, preserving any custom overrides that exist in both roles
- **Option B:** Full reset to new role defaults (wipe all customizations)
- UI presents both options with a confirmation dialog

---

## 4. Staff Profile Fields

Each staff member has a profile with these fields (inspired by MoeGo + Gingr, improved for PetPro):

### 4A. Basic Info
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Profile photo | Image | No | Shown in schedule, staff list |
| First name | Text | Yes | |
| Last name | Text | Yes | |
| Email | Email | Yes | Used for login invitation |
| Phone | Phone | No | For internal communication |
| Role | Dropdown | Yes | One of the 7 roles |
| Color code | Color picker | Yes | Shown on calendar blocks (like Gingr) |
| Hire date | Date | No | For records |
| Status | Toggle | Yes | Active / Inactive |
| Notes (internal) | Text | No | Only visible to Owner/Manager |

### 4B. Pay & Commission
| Field | Type | Notes |
|-------|------|-------|
| Pay type | Dropdown | Hourly, Commission, Salary, Hourly + Commission |
| Hourly rate | Currency | If applicable |
| Commission % | Percentage | Per service completed |
| Tips handling | Dropdown | Keep all, Pool, Split % |
| Tips % | Percentage | If split |

### 4C. Schedule Settings
| Field | Type | Notes |
|-------|------|-------|
| Working days | Multi-select | Mon–Sun checkboxes |
| Start time | Time | Default shift start |
| End time | Time | Default shift end |
| Break duration | Minutes | Auto-blocked on calendar |
| Max appointments/day | Number | Capacity limiter |
| Services offered | Multi-select | Which services this person can do |

### 4D. Notification Preferences (Per Staff)

Each staff member can configure which notifications they receive (inspired by MoeGo's per-action notification settings):

| Notification Event | Options |
|-------------------|---------|
| Appointment created (own) | Push / Email / SMS / Off |
| Appointment cancelled (own) | Push / Email / SMS / Off |
| Appointment updated (own) | Push / Email / SMS / Off |
| New online booking (own) | Push / Email / SMS / Off |
| Client message received | Push / Email / SMS / Off |
| Boarding check-in reminder | Push / Email / SMS / Off |
| Welfare check due | Push / Email / SMS / Off |
| Claude AI flag/alert | Push / Email / SMS / Off |
| Schedule change | Push / Email / SMS / Off |
| Payroll summary | Email / Off |

> Owners/Managers can also set **business-wide defaults** for these, and individual staff can customize their own (if permitted).

---

## 5. Teams (Phase 2 — Like Gingr)

Group staff into **teams** for easier scheduling and filtering:

| Team Example | Staff | Color |
|-------------|-------|-------|
| Grooming | Nicole, Sophia | Purple |
| Front Desk | Aaron, receptionist | Blue |
| Boarding | Kennel tech 1, tech 2 | Green |
| Training | Trainer 1 | Orange |

Teams enable:
- Filter calendar by team
- Assign boarding zones to teams
- Team-based reports (revenue per team, utilization)
- Color-coded schedule blocks (like Gingr's scheduling view)

---

## 6. Database Schema

### 6A. `staff_members` Table

```sql
CREATE TABLE IF NOT EXISTS staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),  -- Links to Supabase Auth
  
  -- Basic Info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  profile_photo_url TEXT,
  role TEXT NOT NULL DEFAULT 'groomer'
    CHECK (role IN ('owner', 'manager', 'groomer', 'bather', 'kennel_tech', 'front_desk', 'trainer')),
  color_code TEXT DEFAULT '#7c3aed',  -- Calendar color
  hire_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'invited')),
  internal_notes TEXT,
  
  -- Pay & Commission
  pay_type TEXT DEFAULT 'hourly'
    CHECK (pay_type IN ('hourly', 'commission', 'salary', 'hourly_commission')),
  hourly_rate DECIMAL(10,2),
  commission_percent DECIMAL(5,2),
  tips_handling TEXT DEFAULT 'keep_all'
    CHECK (tips_handling IN ('keep_all', 'pool', 'split')),
  tips_percent DECIMAL(5,2),
  
  -- Schedule Defaults
  working_days TEXT[] DEFAULT '{mon,tue,wed,thu,fri}',
  shift_start TIME DEFAULT '09:00',
  shift_end TIME DEFAULT '17:00',
  break_duration_min INT DEFAULT 30,
  max_appointments_per_day INT,
  services_offered UUID[],  -- References services table
  
  -- Metadata
  invitation_sent_at TIMESTAMPTZ,
  invitation_accepted_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_staff_business ON staff_members(business_id);
CREATE INDEX idx_staff_user ON staff_members(user_id);
CREATE INDEX idx_staff_role ON staff_members(role);
CREATE INDEX idx_staff_status ON staff_members(status);
```

### 6B. `staff_permissions` Table

```sql
-- Individual permission overrides per staff member
-- Only rows that DIFFER from role defaults are stored here
CREATE TABLE IF NOT EXISTS staff_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,   -- e.g., 'calendar.view_all', 'clients.delete'
  granted BOOLEAN NOT NULL,       -- true = ON, false = OFF
  set_by UUID REFERENCES staff_members(id),  -- Who changed it
  set_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(staff_id, permission_key)
);

CREATE INDEX idx_perms_staff ON staff_permissions(staff_id);
```

### 6C. `role_defaults` Table (Optional — can also be hardcoded)

```sql
-- Stores the default permission set per role
-- Useful if Owner wants to customize role defaults for their business
CREATE TABLE IF NOT EXISTS role_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT false,
  
  UNIQUE(business_id, role, permission_key)
);
```

### 6D. `staff_notification_prefs` Table

```sql
CREATE TABLE IF NOT EXISTS staff_notification_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,     -- e.g., 'appointment_created', 'welfare_check_due'
  channel TEXT NOT NULL,        -- 'push', 'email', 'sms'
  enabled BOOLEAN DEFAULT true,
  
  UNIQUE(staff_id, event_type, channel)
);
```

### 6E. `teams` Table (Phase 2)

```sql
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_code TEXT DEFAULT '#7c3aed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, staff_id)
);
```

### 6F. `clock_entries` Table

```sql
CREATE TABLE IF NOT EXISTS clock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ,
  break_minutes INT DEFAULT 0,
  notes TEXT,
  edited_by UUID REFERENCES staff_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clock_staff ON clock_entries(staff_id);
CREATE INDEX idx_clock_date ON clock_entries(clock_in);
```

---

## 7. Permission Key Naming Convention

All permission keys follow the pattern: `category.action`

```
calendar.view_own          calendar.view_all
calendar.create_own        calendar.create_others
calendar.edit_own          calendar.edit_others
calendar.delete            calendar.override_capacity
calendar.set_hours_own     calendar.set_hours_others
calendar.view_mini

clients.view_list          clients.view_profile
clients.add                clients.edit
clients.delete             clients.email
clients.sms

pets.add_edit              pets.view_medical
pets.edit_medical

notes.add_grooming         notes.add_client
notes.view                 notes.delete

boarding.view_calendar     boarding.create
boarding.edit              boarding.cancel
boarding.log_welfare       boarding.view_welfare
boarding.print_kennel      boarding.manage_runs
boarding.override_capacity boarding.daycare_checkin

vaccines.view              vaccines.add_edit
vaccines.override_expired  vaccines.manage_required

pricing.view               pricing.edit_prices
pricing.add_edit_services  pricing.process_payment
pricing.refund             pricing.view_revenue
pricing.view_own_sales     pricing.view_all_sales
pricing.apply_discount     pricing.override_price
pricing.cash_drawer

staff.view_list            staff.add
staff.edit_profiles        staff.deactivate
staff.change_roles         staff.toggle_permissions
staff.view_payroll         staff.edit_payroll
staff.clock_own            staff.view_others_clock
staff.edit_time

ai.trigger_validation      ai.view_flags
ai.override_warnings       ai.access_settings
ai.voice_booking

settings.edit_business     settings.manage_billing
settings.import_export     settings.view_audit
settings.notifications_biz settings.notifications_own
settings.client_portal
```

---

## 8. How Permissions Connect to Existing Features

### 8A. Grooming Calendar (`Calendar.jsx`)
- **Before showing calendar:** Check `calendar.view_own` (show only their appointments) vs `calendar.view_all` (show everyone's)
- **"+ New Appointment" button:** Only visible if `calendar.create_own` or `calendar.create_others`
- **Click appointment to edit:** Check `calendar.edit_own` / `calendar.edit_others`
- **View Profile button in popup:** Check `clients.view_profile`
- **Grooming notes in popup:** Check `notes.view`

### 8B. Boarding Calendar (`BoardingCalendar.jsx`)
- **Sidebar & calendar:** Only visible if `boarding.view_calendar`
- **Create reservation:** Check `boarding.create`
- **Welfare check button:** Check `boarding.log_welfare`
- **Print kennel card:** Check `boarding.print_kennel`
- **View Profile in kennel card:** Check `clients.view_profile`

### 8C. Clients Page (`Clients.jsx`)
- **View list:** Check `clients.view_list`
- **"Add Client" button:** Check `clients.add`
- **View Profile button:** Check `clients.view_profile`

### 8D. Client Profile (`ClientDetail.jsx`)
- **Overview tab:** Check `clients.view_profile`
- **Past Grooming / Boarding tabs:** Check `calendar.view_own` or `calendar.view_all` + `boarding.view_calendar`
- **Vaccinations tab:** Check `vaccines.view`
- **Payments tab:** Check `pricing.view_own_sales` or `pricing.view_all_sales`
- **Notes tab:** Check `notes.view`, `notes.add_grooming`, `notes.add_client`
- **Edit button:** Check `clients.edit`

### 8E. Pricing Page (`Pricing.jsx`)
- **View services:** Check `pricing.view`
- **Edit prices:** Check `pricing.edit_prices`
- **Add/remove services:** Check `pricing.add_edit_services`

### 8F. Sidebar Navigation
Entire sidebar sections hide/show based on permissions:
- **Calendar** link: Always shown (but filtered content inside)
- **Boarding** link: Only if `boarding.view_calendar`
- **Clients** link: Only if `clients.view_list`
- **Pricing** link: Only if `pricing.view`
- **Staff** link: Only if `staff.view_list`
- **Settings** link: Only if any settings permission is ON
- **Daycare** link (Coming Soon): Only if daycare permissions exist
- **Training** link (Coming Soon): Only if training permissions exist

---

## 9. Staff Management UI Pages

### 9A. Staff List Page (`/staff`)
- Table with columns: Photo, Name, Role, Color, Status, Last Login
- "Add New Staff" button (purple, with ✨ icon)
- Click row → opens Staff Detail page
- Search/filter by role, status
- Quick action: toggle Active/Inactive

### 9B. Staff Detail Page (`/staff/:id`)
Tabs similar to Client Profile:

**Tab 1: Profile**
- Photo, name, email, phone, role dropdown, color picker, hire date, status toggle, internal notes

**Tab 2: Permissions**
- Full permission grid grouped by category (like Gingr's checkbox matrix)
- Each permission row: permission name, toggle switch, yellow dot if customized
- "Reset to Role Defaults" button at top
- Changes save immediately (auto-save with confirmation toast)

**Tab 3: Schedule**
- Working days checkboxes, shift times, break duration
- Max appointments per day
- Services they can perform (multi-select)
- Calendar preview of their upcoming week

**Tab 4: Pay & Commission**
- Pay type, hourly rate, commission %, tips handling
- Earnings summary (this month, last month)
- Commission breakdown by service

**Tab 5: Time Clock**
- Clock in/out history
- Total hours this week/month
- Edit time entries (if permitted)

**Tab 6: Notifications**
- Per-event notification toggles
- Channel selection (push/email/SMS)

### 9C. Add Staff Flow
1. Enter name + email
2. Pick role (auto-fills default permissions)
3. Pick color code
4. Optionally customize permissions
5. Send invitation email with login link
6. Staff member creates password, logs in with their role's access

---

## 10. Invitation & Login Flow

1. **Owner adds staff** → enters email, picks role
2. **PetPro sends invitation email** → unique link with token
3. **Staff clicks link** → creates password, uploads photo
4. **First login** → sees dashboard filtered to their permissions
5. **Status flow:** Invited → Active → Inactive (can reactivate)

---

## 11. PetPro vs Competitors

| Feature | MoeGo | Gingr | PetPro 🐾 |
|---------|-------|-------|-----------|
| Roles | 3 fixed (Owner, Admin, Groomer Pro) | 4 fixed columns + e-Signature | **7 roles** with full customization |
| Permission granularity | Limited, tied to role | 25+ checkboxes, role-locked | **60+ toggles**, individually customizable per employee |
| Custom role overrides | ❌ No | ❌ No | ✅ **Any permission can be flipped per person** |
| Visual indicator for custom perms | ❌ | ❌ | ✅ **Yellow dot + "Reset to Defaults"** |
| Teams | ❌ | ✅ Basic | ✅ **With calendar filtering & team reports** (Phase 2) |
| Staff color codes | ❌ | ✅ | ✅ |
| Notification per action | ✅ Basic | ❌ | ✅ **Per event × per channel** |
| Clock in/out | ✅ | ❌ | ✅ |
| Commission tracking | ✅ | ❌ | ✅ |
| AI integration in permissions | ❌ | ❌ | ✅ **Claude AI permission controls** |
| Pricing | $239/unit for Ultimate | Per employee pricing | **Included in subscription tier** |

---

## 12. Build Phases

### Phase 1 — Core (Build First)
- [ ] `staff_members` table + seed Owner record
- [ ] Staff List page (view, add, edit)
- [ ] Staff Detail page with Profile tab
- [ ] Role assignment with default permissions
- [ ] Permission toggle UI (Permissions tab)
- [ ] `staff_permissions` table for overrides
- [ ] Sidebar navigation filtering based on permissions
- [ ] Calendar filtering (own vs all staff)
- [ ] Invitation email flow (basic — just email + role)

### Phase 2 — Enhanced
- [ ] Clock in/out system
- [ ] Pay & Commission tab
- [ ] Notification preferences per staff
- [ ] Teams management
- [ ] Calendar color-coding by staff member
- [ ] Staff scheduling (working hours on calendar)
- [ ] Audit log for permission changes

### Phase 3 — Advanced
- [ ] Custom role creation
- [ ] Team-based reporting
- [ ] Staff performance dashboard (like MoeGo's productivity metrics)
- [ ] Multi-location staff sharing
- [ ] Automated schedule conflict detection

---

## 13. Key Design Decisions

1. **Permissions stored as overrides only** — We don't store all 60+ permissions per staff member. Only the ones that differ from the role default. This keeps the database clean and makes role changes easy.

2. **Owner role is untouchable** — The Owner always has all permissions ON. Cannot be restricted. Cannot be deleted. There must always be at least one Owner.

3. **Manager can toggle others but not self-promote** — Managers can customize permissions for non-Owner staff, but cannot grant themselves Owner-level permissions (like billing, deactivating staff, changing roles).

4. **Permissions check happens at component level** — Each React component checks permissions before rendering. A `usePermissions()` hook will return the current user's effective permissions (role defaults + overrides merged).

5. **Graceful degradation** — If a permission check fails or data is missing, default to MORE restrictive (deny access) rather than less restrictive. Safety first.

---

*Last updated: April 2026*
*PetPro — Built by a groomer, for groomers* 🐾✂️

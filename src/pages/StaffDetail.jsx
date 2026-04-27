import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ROLE_DEFAULTS from '../lib/roleDefaults'
import StaffDeductions from '../components/StaffDeductions'
import { formatPhone, formatPhoneOnInput } from '../lib/phone'

// Old ROLE_DEFAULTS block removed — now imported from lib/roleDefaults.js
var _OLD_DEFAULTS = {
  owner: {
    'calendar.view_own': true, 'calendar.view_all': true,
    'calendar.create_own': true, 'calendar.create_others': true,
    'calendar.edit_own': true, 'calendar.edit_others': true,
    'calendar.delete': true, 'calendar.override_capacity': true,
    'calendar.set_hours_own': true, 'calendar.set_hours_others': true,
    'clients.view_list': true, 'clients.view_profile': true,
    'clients.add': true, 'clients.edit': true, 'clients.delete': true,
    'clients.email': true, 'clients.sms': true,
    'pets.add_edit': true, 'pets.view_medical': true, 'pets.edit_medical': true,
    'notes.add_grooming': true, 'notes.add_client': true,
    'notes.view': true, 'notes.delete': true,
    'boarding.view_calendar': true, 'boarding.create': true,
    'boarding.edit': true, 'boarding.cancel': true,
    'boarding.log_welfare': true, 'boarding.view_welfare': true,
    'boarding.print_kennel': true, 'boarding.manage_runs': true,
    'boarding.override_capacity': true, 'boarding.daycare_checkin': true,
    'vaccines.view': true, 'vaccines.add_edit': true,
    'vaccines.override_expired': true, 'vaccines.manage_required': true,
    'pricing.view': true, 'pricing.edit_prices': true,
    'pricing.add_edit_services': true, 'pricing.process_payment': true,
    'pricing.refund': true, 'pricing.view_revenue': true,
    'pricing.view_own_sales': true, 'pricing.view_all_sales': true,
    'pricing.apply_discount': true, 'pricing.override_price': true,
    'pricing.cash_drawer': true,
    'staff.view_list': true, 'staff.add': true,
    'staff.edit_profiles': true, 'staff.deactivate': true,
    'staff.change_roles': true, 'staff.toggle_permissions': true,
    'staff.view_payroll': true, 'staff.edit_payroll': true,
    'staff.clock_own': true, 'staff.view_others_clock': true,
    'staff.edit_time': true,
    'ai.trigger_validation': true, 'ai.view_flags': true,
    'ai.override_warnings': true, 'ai.access_settings': true,
    'ai.voice_booking': true,
    'settings.edit_business': true, 'settings.manage_billing': true,
    'settings.import_export': true, 'settings.view_audit': true,
    'settings.notifications_biz': true, 'settings.notifications_own': true,
    'settings.client_portal': true,
  },
  manager: {
    'calendar.view_own': true, 'calendar.view_all': true,
    'calendar.create_own': true, 'calendar.create_others': true,
    'calendar.edit_own': true, 'calendar.edit_others': true,
    'calendar.delete': true, 'calendar.override_capacity': true,
    'calendar.set_hours_own': true, 'calendar.set_hours_others': true,
    'clients.view_list': true, 'clients.view_profile': true,
    'clients.add': true, 'clients.edit': true, 'clients.delete': true,
    'clients.email': true, 'clients.sms': true,
    'pets.add_edit': true, 'pets.view_medical': true, 'pets.edit_medical': true,
    'notes.add_grooming': true, 'notes.add_client': true,
    'notes.view': true, 'notes.delete': true,
    'boarding.view_calendar': true, 'boarding.create': true,
    'boarding.edit': true, 'boarding.cancel': true,
    'boarding.log_welfare': true, 'boarding.view_welfare': true,
    'boarding.print_kennel': true, 'boarding.manage_runs': true,
    'boarding.override_capacity': true, 'boarding.daycare_checkin': true,
    'vaccines.view': true, 'vaccines.add_edit': true,
    'vaccines.override_expired': true, 'vaccines.manage_required': true,
    'pricing.view': true, 'pricing.edit_prices': true,
    'pricing.add_edit_services': true, 'pricing.process_payment': true,
    'pricing.refund': true, 'pricing.view_revenue': true,
    'pricing.view_own_sales': true, 'pricing.view_all_sales': true,
    'pricing.apply_discount': true, 'pricing.override_price': true,
    'pricing.cash_drawer': true,
    'staff.view_list': true, 'staff.add': true,
    'staff.edit_profiles': true, 'staff.deactivate': false,
    'staff.change_roles': false, 'staff.toggle_permissions': true,
    'staff.view_payroll': true, 'staff.edit_payroll': false,
    'staff.clock_own': true, 'staff.view_others_clock': true,
    'staff.edit_time': true,
    'ai.trigger_validation': true, 'ai.view_flags': true,
    'ai.override_warnings': true, 'ai.access_settings': true,
    'ai.voice_booking': true,
    'settings.edit_business': true, 'settings.manage_billing': false,
    'settings.import_export': true, 'settings.view_audit': true,
    'settings.notifications_biz': true, 'settings.notifications_own': true,
    'settings.client_portal': true,
  },
  groomer: {
    'calendar.view_own': true, 'calendar.view_all': false,
    'calendar.create_own': true, 'calendar.create_others': false,
    'calendar.edit_own': true, 'calendar.edit_others': false,
    'calendar.delete': false, 'calendar.override_capacity': false,
    'calendar.set_hours_own': true, 'calendar.set_hours_others': false,
    'clients.view_list': true, 'clients.view_profile': true,
    'clients.add': false, 'clients.edit': false, 'clients.delete': false,
    'clients.email': false, 'clients.sms': false,
    'pets.add_edit': true, 'pets.view_medical': true, 'pets.edit_medical': true,
    'notes.add_grooming': true, 'notes.add_client': true,
    'notes.view': true, 'notes.delete': false,
    'boarding.view_calendar': false, 'boarding.create': false,
    'boarding.edit': false, 'boarding.cancel': false,
    'boarding.log_welfare': false, 'boarding.view_welfare': false,
    'boarding.print_kennel': false, 'boarding.manage_runs': false,
    'boarding.override_capacity': false, 'boarding.daycare_checkin': false,
    'vaccines.view': true, 'vaccines.add_edit': false,
    'vaccines.override_expired': false, 'vaccines.manage_required': false,
    'pricing.view': true, 'pricing.edit_prices': false,
    'pricing.add_edit_services': false, 'pricing.process_payment': false,
    'pricing.refund': false, 'pricing.view_revenue': false,
    'pricing.view_own_sales': true, 'pricing.view_all_sales': false,
    'pricing.apply_discount': false, 'pricing.override_price': false,
    'pricing.cash_drawer': false,
    'staff.view_list': false, 'staff.add': false,
    'staff.edit_profiles': false, 'staff.deactivate': false,
    'staff.change_roles': false, 'staff.toggle_permissions': false,
    'staff.view_payroll': false, 'staff.edit_payroll': false,
    'staff.clock_own': true, 'staff.view_others_clock': false,
    'staff.edit_time': false,
    'ai.trigger_validation': true, 'ai.view_flags': true,
    'ai.override_warnings': false, 'ai.access_settings': false,
    'ai.voice_booking': true,
    'settings.edit_business': false, 'settings.manage_billing': false,
    'settings.import_export': false, 'settings.view_audit': false,
    'settings.notifications_biz': false, 'settings.notifications_own': true,
    'settings.client_portal': false,
  },
  bather: {
    'calendar.view_own': true, 'calendar.view_all': false,
    'calendar.create_own': false, 'calendar.create_others': false,
    'calendar.edit_own': false, 'calendar.edit_others': false,
    'calendar.delete': false, 'calendar.override_capacity': false,
    'calendar.set_hours_own': true, 'calendar.set_hours_others': false,
    'clients.view_list': true, 'clients.view_profile': true,
    'clients.add': false, 'clients.edit': false, 'clients.delete': false,
    'clients.email': false, 'clients.sms': false,
    'pets.add_edit': false, 'pets.view_medical': true, 'pets.edit_medical': false,
    'notes.add_grooming': true, 'notes.add_client': false,
    'notes.view': true, 'notes.delete': false,
    'boarding.view_calendar': false, 'boarding.create': false,
    'boarding.edit': false, 'boarding.cancel': false,
    'boarding.log_welfare': false, 'boarding.view_welfare': false,
    'boarding.print_kennel': false, 'boarding.manage_runs': false,
    'boarding.override_capacity': false, 'boarding.daycare_checkin': false,
    'vaccines.view': true, 'vaccines.add_edit': false,
    'vaccines.override_expired': false, 'vaccines.manage_required': false,
    'pricing.view': true, 'pricing.edit_prices': false,
    'pricing.add_edit_services': false, 'pricing.process_payment': false,
    'pricing.refund': false, 'pricing.view_revenue': false,
    'pricing.view_own_sales': true, 'pricing.view_all_sales': false,
    'pricing.apply_discount': false, 'pricing.override_price': false,
    'pricing.cash_drawer': false,
    'staff.view_list': false, 'staff.add': false,
    'staff.edit_profiles': false, 'staff.deactivate': false,
    'staff.change_roles': false, 'staff.toggle_permissions': false,
    'staff.view_payroll': false, 'staff.edit_payroll': false,
    'staff.clock_own': true, 'staff.view_others_clock': false,
    'staff.edit_time': false,
    'ai.trigger_validation': false, 'ai.view_flags': false,
    'ai.override_warnings': false, 'ai.access_settings': false,
    'ai.voice_booking': false,
    'settings.edit_business': false, 'settings.manage_billing': false,
    'settings.import_export': false, 'settings.view_audit': false,
    'settings.notifications_biz': false, 'settings.notifications_own': true,
    'settings.client_portal': false,
  },
  kennel_tech: {
    'calendar.view_own': true, 'calendar.view_all': false,
    'calendar.create_own': false, 'calendar.create_others': false,
    'calendar.edit_own': false, 'calendar.edit_others': false,
    'calendar.delete': false, 'calendar.override_capacity': false,
    'calendar.set_hours_own': true, 'calendar.set_hours_others': false,
    'clients.view_list': true, 'clients.view_profile': true,
    'clients.add': false, 'clients.edit': false, 'clients.delete': false,
    'clients.email': false, 'clients.sms': false,
    'pets.add_edit': false, 'pets.view_medical': true, 'pets.edit_medical': false,
    'notes.add_grooming': false, 'notes.add_client': false,
    'notes.view': true, 'notes.delete': false,
    'boarding.view_calendar': true, 'boarding.create': false,
    'boarding.edit': false, 'boarding.cancel': false,
    'boarding.log_welfare': true, 'boarding.view_welfare': true,
    'boarding.print_kennel': true, 'boarding.manage_runs': true,
    'boarding.override_capacity': false, 'boarding.daycare_checkin': true,
    'vaccines.view': true, 'vaccines.add_edit': false,
    'vaccines.override_expired': false, 'vaccines.manage_required': false,
    'pricing.view': false, 'pricing.edit_prices': false,
    'pricing.add_edit_services': false, 'pricing.process_payment': false,
    'pricing.refund': false, 'pricing.view_revenue': false,
    'pricing.view_own_sales': false, 'pricing.view_all_sales': false,
    'pricing.apply_discount': false, 'pricing.override_price': false,
    'pricing.cash_drawer': false,
    'staff.view_list': false, 'staff.add': false,
    'staff.edit_profiles': false, 'staff.deactivate': false,
    'staff.change_roles': false, 'staff.toggle_permissions': false,
    'staff.view_payroll': false, 'staff.edit_payroll': false,
    'staff.clock_own': true, 'staff.view_others_clock': false,
    'staff.edit_time': false,
    'ai.trigger_validation': false, 'ai.view_flags': false,
    'ai.override_warnings': false, 'ai.access_settings': false,
    'ai.voice_booking': false,
    'settings.edit_business': false, 'settings.manage_billing': false,
    'settings.import_export': false, 'settings.view_audit': false,
    'settings.notifications_biz': false, 'settings.notifications_own': true,
    'settings.client_portal': false,
  },
  front_desk: {
    'calendar.view_own': true, 'calendar.view_all': true,
    'calendar.create_own': true, 'calendar.create_others': true,
    'calendar.edit_own': true, 'calendar.edit_others': true,
    'calendar.delete': true, 'calendar.override_capacity': false,
    'calendar.set_hours_own': true, 'calendar.set_hours_others': false,
    'clients.view_list': true, 'clients.view_profile': true,
    'clients.add': true, 'clients.edit': true, 'clients.delete': false,
    'clients.email': true, 'clients.sms': true,
    'pets.add_edit': true, 'pets.view_medical': true, 'pets.edit_medical': true,
    'notes.add_grooming': false, 'notes.add_client': true,
    'notes.view': true, 'notes.delete': false,
    'boarding.view_calendar': true, 'boarding.create': true,
    'boarding.edit': true, 'boarding.cancel': true,
    'boarding.log_welfare': false, 'boarding.view_welfare': true,
    'boarding.print_kennel': true, 'boarding.manage_runs': true,
    'boarding.override_capacity': false, 'boarding.daycare_checkin': true,
    'vaccines.view': true, 'vaccines.add_edit': true,
    'vaccines.override_expired': false, 'vaccines.manage_required': false,
    'pricing.view': true, 'pricing.edit_prices': false,
    'pricing.add_edit_services': false, 'pricing.process_payment': true,
    'pricing.refund': false, 'pricing.view_revenue': false,
    'pricing.view_own_sales': true, 'pricing.view_all_sales': false,
    'pricing.apply_discount': true, 'pricing.override_price': false,
    'pricing.cash_drawer': true,
    'staff.view_list': true, 'staff.add': false,
    'staff.edit_profiles': false, 'staff.deactivate': false,
    'staff.change_roles': false, 'staff.toggle_permissions': false,
    'staff.view_payroll': false, 'staff.edit_payroll': false,
    'staff.clock_own': true, 'staff.view_others_clock': false,
    'staff.edit_time': false,
    'ai.trigger_validation': true, 'ai.view_flags': true,
    'ai.override_warnings': false, 'ai.access_settings': false,
    'ai.voice_booking': true,
    'settings.edit_business': false, 'settings.manage_billing': false,
    'settings.import_export': false, 'settings.view_audit': false,
    'settings.notifications_biz': false, 'settings.notifications_own': true,
    'settings.client_portal': false,
  },
  trainer: {
    'calendar.view_own': true, 'calendar.view_all': false,
    'calendar.create_own': true, 'calendar.create_others': false,
    'calendar.edit_own': true, 'calendar.edit_others': false,
    'calendar.delete': false, 'calendar.override_capacity': false,
    'calendar.set_hours_own': true, 'calendar.set_hours_others': false,
    'clients.view_list': true, 'clients.view_profile': true,
    'clients.add': false, 'clients.edit': false, 'clients.delete': false,
    'clients.email': false, 'clients.sms': false,
    'pets.add_edit': false, 'pets.view_medical': true, 'pets.edit_medical': false,
    'notes.add_grooming': false, 'notes.add_client': false,
    'notes.view': true, 'notes.delete': false,
    'boarding.view_calendar': false, 'boarding.create': false,
    'boarding.edit': false, 'boarding.cancel': false,
    'boarding.log_welfare': false, 'boarding.view_welfare': false,
    'boarding.print_kennel': false, 'boarding.manage_runs': false,
    'boarding.override_capacity': false, 'boarding.daycare_checkin': false,
    'vaccines.view': true, 'vaccines.add_edit': false,
    'vaccines.override_expired': false, 'vaccines.manage_required': false,
    'pricing.view': false, 'pricing.edit_prices': false,
    'pricing.add_edit_services': false, 'pricing.process_payment': false,
    'pricing.refund': false, 'pricing.view_revenue': false,
    'pricing.view_own_sales': false, 'pricing.view_all_sales': false,
    'pricing.apply_discount': false, 'pricing.override_price': false,
    'pricing.cash_drawer': false,
    'staff.view_list': false, 'staff.add': false,
    'staff.edit_profiles': false, 'staff.deactivate': false,
    'staff.change_roles': false, 'staff.toggle_permissions': false,
    'staff.view_payroll': false, 'staff.edit_payroll': false,
    'staff.clock_own': true, 'staff.view_others_clock': false,
    'staff.edit_time': false,
    'ai.trigger_validation': false, 'ai.view_flags': false,
    'ai.override_warnings': false, 'ai.access_settings': false,
    'ai.voice_booking': false,
    'settings.edit_business': false, 'settings.manage_billing': false,
    'settings.import_export': false, 'settings.view_audit': false,
    'settings.notifications_biz': false, 'settings.notifications_own': true,
    'settings.client_portal': false,
  }
}

// Permission categories for the UI
var PERMISSION_CATEGORIES = [
  {
    key: 'calendar',
    label: '📅 Calendar & Scheduling',
    permissions: [
      { key: 'calendar.view_own', label: 'View own schedule' },
      { key: 'calendar.view_all', label: 'View all staff schedules' },
      { key: 'calendar.create_own', label: 'Create own appointments' },
      { key: 'calendar.create_others', label: 'Create appointments for others' },
      { key: 'calendar.edit_own', label: 'Edit own appointments' },
      { key: 'calendar.edit_others', label: 'Edit others\' appointments' },
      { key: 'calendar.delete', label: 'Cancel / delete appointments' },
      { key: 'calendar.override_capacity', label: 'Override appointment capacity' },
      { key: 'calendar.set_hours_own', label: 'Set own working hours' },
      { key: 'calendar.set_hours_others', label: 'Set others\' working hours' },
    ]
  },
  {
    key: 'clients',
    label: '🐕 Clients & Pets',
    permissions: [
      { key: 'clients.view_list', label: 'View client list' },
      { key: 'clients.view_profile', label: 'View client profiles' },
      { key: 'clients.add', label: 'Add new clients' },
      { key: 'clients.edit', label: 'Edit client info' },
      { key: 'clients.delete', label: 'Delete clients' },
      { key: 'clients.email', label: 'Email clients' },
      { key: 'clients.sms', label: 'SMS / text clients' },
      { key: 'pets.add_edit', label: 'Add / edit pet profiles' },
      { key: 'pets.view_medical', label: 'View pet medical info' },
      { key: 'pets.edit_medical', label: 'Edit pet medical info' },
      { key: 'notes.add_grooming', label: 'Add grooming notes' },
      { key: 'notes.add_client', label: 'Add client notes' },
      { key: 'notes.view', label: 'View all notes' },
      { key: 'notes.delete', label: 'Delete notes' },
    ]
  },
  {
    key: 'boarding',
    label: '🏨 Boarding & Daycare',
    permissions: [
      { key: 'boarding.view_calendar', label: 'View boarding calendar' },
      { key: 'boarding.create', label: 'Create boarding reservations' },
      { key: 'boarding.edit', label: 'Edit boarding reservations' },
      { key: 'boarding.cancel', label: 'Cancel boarding reservations' },
      { key: 'boarding.log_welfare', label: 'Log welfare checks' },
      { key: 'boarding.view_welfare', label: 'View welfare logs' },
      { key: 'boarding.print_kennel', label: 'Print kennel cards' },
      { key: 'boarding.manage_runs', label: 'Manage kennel / run assignments' },
      { key: 'boarding.override_capacity', label: 'Override boarding capacity' },
      { key: 'boarding.daycare_checkin', label: 'Manage daycare check-in/out' },
    ]
  },
  {
    key: 'vaccines',
    label: '💉 Vaccinations',
    permissions: [
      { key: 'vaccines.view', label: 'View vaccination records' },
      { key: 'vaccines.add_edit', label: 'Add / edit vaccination records' },
      { key: 'vaccines.override_expired', label: 'Override expired vaccine warnings' },
      { key: 'vaccines.manage_required', label: 'Manage required vaccine list' },
    ]
  },
  {
    key: 'pricing',
    label: '💰 Pricing & Payments',
    permissions: [
      { key: 'pricing.view', label: 'View service prices' },
      { key: 'pricing.edit_prices', label: 'Edit service prices' },
      { key: 'pricing.add_edit_services', label: 'Add / edit services' },
      { key: 'pricing.process_payment', label: 'Process payments / check out' },
      { key: 'pricing.refund', label: 'Issue refunds' },
      { key: 'pricing.view_revenue', label: 'View revenue reports' },
      { key: 'pricing.view_own_sales', label: 'View own sales / tips' },
      { key: 'pricing.view_all_sales', label: 'View all staff sales / tips' },
      { key: 'pricing.apply_discount', label: 'Apply discounts / coupons' },
      { key: 'pricing.override_price', label: 'Override pricing' },
      { key: 'pricing.cash_drawer', label: 'Open cash drawer (POS)' },
    ]
  },
  {
    key: 'staff',
    label: '👥 Staff Management',
    permissions: [
      { key: 'staff.view_list', label: 'View staff list' },
      { key: 'staff.add', label: 'Add new staff members' },
      { key: 'staff.edit_profiles', label: 'Edit staff profiles' },
      { key: 'staff.deactivate', label: 'Deactivate / remove staff' },
      { key: 'staff.change_roles', label: 'Change staff roles' },
      { key: 'staff.toggle_permissions', label: 'Toggle individual permissions' },
      { key: 'staff.view_payroll', label: 'View payroll / commission settings' },
      { key: 'staff.edit_payroll', label: 'Edit payroll / commission settings' },
      { key: 'staff.clock_own', label: 'Clock in / out (own)' },
      { key: 'staff.view_others_clock', label: 'View others\' clock in/out' },
      { key: 'staff.edit_time', label: 'Edit time entries' },
    ]
  },
  {
    key: 'ai',
    label: '🤖 PetPro AI & Smart Features',
    permissions: [
      { key: 'ai.trigger_validation', label: 'Trigger PetPro AI booking validation' },
      { key: 'ai.view_flags', label: 'View PetPro AI flags / suggestions' },
      { key: 'ai.override_warnings', label: 'Override PetPro AI warnings' },
      { key: 'ai.access_settings', label: 'Access AI preferences / settings' },
      { key: 'ai.voice_booking', label: 'Use voice booking mode' },
    ]
  },
  {
    key: 'settings',
    label: '⚙️ Business Settings',
    permissions: [
      { key: 'settings.edit_business', label: 'Edit business profile / settings' },
      { key: 'settings.manage_billing', label: 'Manage subscription / billing' },
      { key: 'settings.import_export', label: 'Import / export data' },
      { key: 'settings.view_audit', label: 'View audit log' },
      { key: 'settings.notifications_biz', label: 'Manage business-wide notifications' },
      { key: 'settings.notifications_own', label: 'Manage own notification preferences' },
      { key: 'settings.client_portal', label: 'Access client portal settings' },
    ]
  }
]

var ROLE_LABELS = {
  owner: 'Owner', manager: 'Manager', groomer: 'Groomer',
  bather: 'Bather', kennel_tech: 'Kennel Tech',
  front_desk: 'Front Desk', trainer: 'Trainer'
}

var ROLE_COLORS = {
  owner: '#7c3aed', manager: '#2563eb', groomer: '#d946ef',
  bather: '#0891b2', kennel_tech: '#16a34a',
  front_desk: '#f59e0b', trainer: '#ea580c'
}

// Preset swatches: BRIGHT (current palette) + NEUTRAL (earth tones)
var BRIGHT_COLORS = [
  { name: 'Purple', hex: '#7c3aed' }, { name: 'Blue', hex: '#2563eb' },
  { name: 'Cyan', hex: '#0891b2' },   { name: 'Green', hex: '#16a34a' },
  { name: 'Amber', hex: '#f59e0b' },  { name: 'Orange', hex: '#ea580c' },
  { name: 'Red', hex: '#dc2626' },    { name: 'Pink', hex: '#d946ef' },
]
var NEUTRAL_COLORS = [
  { name: 'Tan', hex: '#d4a574' },        { name: 'Taupe', hex: '#a8937a' },
  { name: 'Cream', hex: '#e8dfd0' },      { name: 'Sage', hex: '#9caf88' },
  { name: 'Dusty Rose', hex: '#c9a0a0' }, { name: 'Stone', hex: '#9ca3af' },
  { name: 'Slate', hex: '#64748b' },      { name: 'Charcoal', hex: '#334155' },
]

var ROLE_ICONS = {
  owner: '👑', manager: '⭐', groomer: '✂️',
  bather: '🛁', kennel_tech: '🏠',
  front_desk: '🖥️', trainer: '🎓'
}

export default function StaffDetail() {
  var { id } = useParams()
  var navigate = useNavigate()
  var [staffMember, setStaffMember] = useState(null)
  var [loading, setLoading] = useState(true)
  var [activeTab, setActiveTab] = useState('profile')
  var [editing, setEditing] = useState(false)
  var [editData, setEditData] = useState({})
  var [saving, setSaving] = useState(false)
  var [permOverrides, setPermOverrides] = useState({})
  var [openCategories, setOpenCategories] = useState({ calendar: true })
  var [permSaving, setPermSaving] = useState(null)
  var [customCount, setCustomCount] = useState(0)

  // Pay tab edit state
  var [payEditing, setPayEditing] = useState(false)
  var [payEditData, setPayEditData] = useState({})
  var [paySaving, setPaySaving] = useState(false)

  // Schedule state
  var [schedWeekStart, setSchedWeekStart] = useState(getSchedWeekStart(new Date()))
  var [schedShifts, setSchedShifts] = useState([])
  var [schedLoading, setSchedLoading] = useState(false)

  // Personal notepad state
  var [staffNotes, setStaffNotes] = useState([])
  var [newStaffNote, setNewStaffNote] = useState('')
  var [savingStaffNote, setSavingStaffNote] = useState(false)

  useEffect(function() {
    fetchStaffMember()
    fetchPermissions()
  }, [id])

  useEffect(function() {
    if (activeTab === 'schedule') {
      fetchSchedule()
      fetchStaffNotes()
    }
  }, [activeTab, schedWeekStart, id])

  async function fetchStaffMember() {
    var { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .eq('id', id)
      .single()

    if (!error && data) {
      setStaffMember(data)
      setEditData(data)
    }
    setLoading(false)
  }

  async function fetchPermissions() {
    var { data, error } = await supabase
      .from('staff_permissions')
      .select('*')
      .eq('staff_id', id)

    if (!error && data) {
      var overrides = {}
      data.forEach(function(p) {
        overrides[p.permission_key] = p.granted
      })
      setPermOverrides(overrides)
      setCustomCount(data.length)
    }
  }

  function getEffectivePermission(permKey) {
    // Overrides take priority over role defaults
    if (permOverrides.hasOwnProperty(permKey)) {
      return permOverrides[permKey]
    }
    var role = staffMember ? staffMember.role : 'groomer'
    var defaults = ROLE_DEFAULTS[role] || {}
    return defaults[permKey] || false
  }

  function isCustomized(permKey) {
    return permOverrides.hasOwnProperty(permKey)
  }

  async function togglePermission(permKey) {
    var currentValue = getEffectivePermission(permKey)
    var newValue = !currentValue
    var role = staffMember ? staffMember.role : 'groomer'
    var roleDefault = (ROLE_DEFAULTS[role] || {})[permKey] || false

    setPermSaving(permKey)

    if (newValue === roleDefault) {
      // Remove override — matches default
      var { error } = await supabase
        .from('staff_permissions')
        .delete()
        .eq('staff_id', id)
        .eq('permission_key', permKey)

      if (!error) {
        var updated = Object.assign({}, permOverrides)
        delete updated[permKey]
        setPermOverrides(updated)
        setCustomCount(Object.keys(updated).length)
      }
    } else {
      // Upsert override
      var { error } = await supabase
        .from('staff_permissions')
        .upsert({
          staff_id: id,
          permission_key: permKey,
          granted: newValue,
          set_at: new Date().toISOString()
        }, { onConflict: 'staff_id,permission_key' })

      if (!error) {
        var updated = Object.assign({}, permOverrides)
        updated[permKey] = newValue
        setPermOverrides(updated)
        setCustomCount(Object.keys(updated).length)
      }
    }
    setPermSaving(null)
  }

  async function resetToDefaults() {
    if (!window.confirm('Reset ALL permissions to ' + ROLE_LABELS[staffMember.role] + ' defaults? This will remove all custom overrides.')) return

    var { error } = await supabase
      .from('staff_permissions')
      .delete()
      .eq('staff_id', id)

    if (!error) {
      setPermOverrides({})
      setCustomCount(0)
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSaving(true)

    // Validate PIN: must be exactly 4 digits if set
    if (editData.pin_code && !/^\d{4}$/.test(editData.pin_code)) {
      alert('PIN must be exactly 4 digits (0-9).')
      setSaving(false)
      return
    }

    var updates = {
      first_name: editData.first_name,
      last_name: editData.last_name,
      email: editData.email,
      phone: editData.phone || null,
      role: editData.role,
      color_code: editData.color_code,
      hire_date: editData.hire_date || null,
      internal_notes: editData.internal_notes || null,
      pin_code: editData.pin_code || null,
      updated_at: new Date().toISOString()
    }

    var { error } = await supabase
      .from('staff_members')
      .update(updates)
      .eq('id', id)

    if (!error) {
      setStaffMember(Object.assign({}, staffMember, updates))
      setEditing(false)
    } else {
      alert('Error saving: ' + error.message)
    }
    setSaving(false)
  }

  async function handleSavePay(e) {
    if (e) e.preventDefault()
    setPaySaving(true)

    var payUpdates = {
      // pay settings
      pay_type: payEditData.pay_type || 'hourly',
      hourly_rate: payEditData.hourly_rate ? parseFloat(payEditData.hourly_rate) : null,
      commission_percent: payEditData.commission_percent ? parseFloat(payEditData.commission_percent) : null,
      salary_amount: payEditData.salary_amount ? parseFloat(payEditData.salary_amount) : 0,
      pay_period_type: payEditData.pay_period_type || 'bi_weekly',
      overtime_enabled: payEditData.overtime_enabled !== false,
      overtime_rate_multiplier: payEditData.overtime_rate_multiplier ? parseFloat(payEditData.overtime_rate_multiplier) : 1.5,
      tips_handling: payEditData.tips_handling || 'keep_all',
      tips_percent: payEditData.tips_percent ? parseFloat(payEditData.tips_percent) : 100,
      // worker type + tax info
      worker_type: payEditData.worker_type || 'w2',
      tax_filing_status: payEditData.tax_filing_status || 'single',
      federal_allowances: payEditData.federal_allowances ? parseInt(payEditData.federal_allowances, 10) : 0,
      tax_id: payEditData.tax_id ? String(payEditData.tax_id).trim() : null,
      // mailing address
      address_line1: payEditData.address_line1 || null,
      address_line2: payEditData.address_line2 || null,
      city: payEditData.city || null,
      state: payEditData.state ? String(payEditData.state).trim().toUpperCase() : null,
      zip: payEditData.zip || null,
      updated_at: new Date().toISOString()
    }

    var { error } = await supabase
      .from('staff_members')
      .update(payUpdates)
      .eq('id', id)

    if (!error) {
      setStaffMember(Object.assign({}, staffMember, payUpdates))
      setPayEditing(false)
    } else {
      alert('Error saving pay settings: ' + error.message)
    }
    setPaySaving(false)
  }

  function startPayEdit() {
    setPayEditData({
      // pay settings
      pay_type: staffMember.pay_type || 'hourly',
      hourly_rate: staffMember.hourly_rate || '',
      commission_percent: staffMember.commission_percent || '',
      salary_amount: staffMember.salary_amount || '',
      pay_period_type: staffMember.pay_period_type || 'bi_weekly',
      overtime_enabled: staffMember.overtime_enabled !== false,
      overtime_rate_multiplier: staffMember.overtime_rate_multiplier || 1.5,
      tips_handling: staffMember.tips_handling || 'keep_all',
      tips_percent: staffMember.tips_percent || 100,
      // worker type + tax info
      worker_type: staffMember.worker_type || 'w2',
      tax_filing_status: staffMember.tax_filing_status || 'single',
      federal_allowances: staffMember.federal_allowances || 0,
      tax_id: staffMember.tax_id || '',
      // mailing address
      address_line1: staffMember.address_line1 || '',
      address_line2: staffMember.address_line2 || '',
      city: staffMember.city || '',
      state: staffMember.state || '',
      zip: staffMember.zip || ''
    })
    setPayEditing(true)
  }

  function maskTaxId(id) {
    if (!id) return '—'
    var cleaned = String(id).replace(/[^0-9]/g, '')
    if (cleaned.length < 4) return '***'
    return '***-**-' + cleaned.slice(-4)
  }

  function toggleCategory(catKey) {
    setOpenCategories(function(prev) {
      var updated = Object.assign({}, prev)
      updated[catKey] = !updated[catKey]
      return updated
    })
  }

  function expandAll() {
    var all = {}
    PERMISSION_CATEGORIES.forEach(function(c) { all[c.key] = true })
    setOpenCategories(all)
  }

  function collapseAll() {
    setOpenCategories({})
  }

  function formatDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // ===== SCHEDULE HELPERS =====
  var SCHED_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  var SCHED_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  function getSchedWeekStart(date) {
    var d = new Date(date)
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  }

  function getSchedWeekDays() {
    var days = []
    for (var i = 0; i < 7; i++) {
      var d = new Date(schedWeekStart)
      d.setDate(schedWeekStart.getDate() + i)
      days.push(d)
    }
    return days
  }

  function formatSchedDateISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  function formatSchedTime(t) {
    if (!t) return ''
    var parts = t.split(':')
    var h = parseInt(parts[0])
    var m = parts[1]
    var ampm = h >= 12 ? 'PM' : 'AM'
    if (h === 0) h = 12
    else if (h > 12) h = h - 12
    return h + ':' + m + ' ' + ampm
  }

  function getSchedOrdinal(n) {
    if (n > 3 && n < 21) return 'th'
    switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th' }
  }

  function getShiftHours(shift) {
    var start = shift.start_time.split(':')
    var end = shift.end_time.split(':')
    var startMin = parseInt(start[0]) * 60 + parseInt(start[1])
    var endMin = parseInt(end[0]) * 60 + parseInt(end[1])
    return Math.max(0, (endMin - startMin - (shift.break_minutes || 0)) / 60)
  }

  function getSchedDayHours(dateStr) {
    return schedShifts.filter(function(s) { return s.shift_date === dateStr }).reduce(function(sum, s) { return sum + getShiftHours(s) }, 0)
  }

  function getSchedWeekHours() {
    return schedShifts.reduce(function(sum, s) { return sum + getShiftHours(s) }, 0)
  }

  function isSchedToday(d) {
    var today = new Date()
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  }

  async function fetchSchedule() {
    setSchedLoading(true)
    var weekEnd = new Date(schedWeekStart)
    weekEnd.setDate(schedWeekStart.getDate() + 6)

    var { data } = await supabase
      .from('staff_schedules')
      .select('*')
      .eq('staff_id', id)
      .gte('shift_date', formatSchedDateISO(schedWeekStart))
      .lte('shift_date', formatSchedDateISO(weekEnd))

    setSchedShifts(data || [])
    setSchedLoading(false)
  }

  function navigateSchedWeek(dir) {
    var newStart = new Date(schedWeekStart)
    newStart.setDate(schedWeekStart.getDate() + (dir * 7))
    setSchedWeekStart(newStart)
  }

  async function fetchStaffNotes() {
    var { data } = await supabase
      .from('notes')
      .select('*')
      .eq('staff_id', id)
      .eq('note_type', 'staff_personal')
      .order('created_at', { ascending: false })
      .limit(20)

    setStaffNotes(data || [])
  }

  async function handleAddStaffNote() {
    if (!newStaffNote.trim()) return
    setSavingStaffNote(true)

    var { data: { user } } = await supabase.auth.getUser()

    var { error } = await supabase
      .from('notes')
      .insert([{
        staff_id: id,
        groomer_id: user.id,
        note_type: 'staff_personal',
        content: newStaffNote.trim()
      }])

    if (!error) {
      setNewStaffNote('')
      fetchStaffNotes()
    } else {
      alert('Error saving note: ' + error.message)
    }
    setSavingStaffNote(false)
  }

  async function deleteStaffNote(noteId) {
    if (!window.confirm('Delete this note?')) return
    await supabase.from('notes').delete().eq('id', noteId)
    fetchStaffNotes()
  }

  function getInitials(first, last) {
    return ((first || '')[0] || '') + ((last || '')[0] || '')
  }

  if (loading) {
    return (
      <div className="sl-loading">
        <div className="sl-loading-paw">🐾</div>
        <p>Loading staff profile...</p>
      </div>
    )
  }

  if (!staffMember) {
    return (
      <div className="sl-empty">
        <div className="sl-empty-icon">😿</div>
        <h3>Staff member not found</h3>
        <button className="sl-add-btn" onClick={function() { navigate('/staff') }}>← Back to Staff List</button>
      </div>
    )
  }

  var s = staffMember

  return (
    <div className="sd-page">
      {/* Back Button */}
      <button className="sd-back-btn" onClick={function() { navigate('/staff') }}>
        ← Back to Staff List
      </button>

      {/* Profile Header */}
      <div className="sd-header" style={{ borderTopColor: s.color_code || '#7c3aed' }}>
        <div className="sd-header-left">
          <div className="sd-avatar" style={{ backgroundColor: s.color_code || '#7c3aed' }}>
            {s.profile_photo_url ? (
              <img src={s.profile_photo_url} alt={s.first_name} className="sd-avatar-img" />
            ) : (
              <span className="sd-avatar-initials">{getInitials(s.first_name, s.last_name)}</span>
            )}
          </div>
          <div className="sd-header-info">
            <h1 className="sd-name">{s.first_name} {s.last_name}</h1>
            <div className="sd-header-badges">
              <span className="sd-role-badge" style={{ backgroundColor: ROLE_COLORS[s.role] || '#7c3aed' }}>
                {ROLE_ICONS[s.role] || '👤'} {ROLE_LABELS[s.role] || s.role}
              </span>
              <span className={'sd-status-badge ' + (s.status === 'active' ? 'sd-status-active' : s.status === 'invited' ? 'sd-status-invited' : 'sd-status-inactive')}>
                {s.status === 'active' ? '● Active' : s.status === 'invited' ? '● Invited' : '● Inactive'}
              </span>
              {customCount > 0 && (
                <span className="sd-custom-badge">🔧 {customCount} custom permission{customCount !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="sd-header-meta">
              {s.email && <span>📧 {s.email}</span>}
              {s.phone && <span>📱 {formatPhone(s.phone)}</span>}
              {s.hire_date && <span>📅 Hired {formatDate(s.hire_date)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sd-tabs">
        <button
          className={'sd-tab' + (activeTab === 'profile' ? ' sd-tab-active' : '')}
          onClick={function() { setActiveTab('profile') }}
        >
          👤 Profile
        </button>
        <button
          className={'sd-tab' + (activeTab === 'permissions' ? ' sd-tab-active' : '')}
          onClick={function() { setActiveTab('permissions') }}
        >
          🔐 Permissions {customCount > 0 && <span className="sd-tab-badge">{customCount}</span>}
        </button>
        <button
          className={'sd-tab' + (activeTab === 'schedule' ? ' sd-tab-active' : '')}
          onClick={function() { setActiveTab('schedule') }}
        >
          📅 Schedule
        </button>
        <button
          className={'sd-tab' + (activeTab === 'pay' ? ' sd-tab-active' : '')}
          onClick={function() { setActiveTab('pay') }}
        >
          💰 Pay & Commission
        </button>
      </div>

      {/* Tab Content */}
      <div className="sd-content">

        {/* ===== PROFILE TAB ===== */}
        {activeTab === 'profile' && (
          <div className="sd-profile-tab">
            {!editing ? (
              <div className="sd-profile-view">
                <div className="sd-profile-section">
                  <h3 className="sd-section-title">📋 Basic Information</h3>
                  <div className="sd-info-grid">
                    <div className="sd-info-item">
                      <span className="sd-info-label">First Name</span>
                      <span className="sd-info-value">{s.first_name}</span>
                    </div>
                    <div className="sd-info-item">
                      <span className="sd-info-label">Last Name</span>
                      <span className="sd-info-value">{s.last_name}</span>
                    </div>
                    <div className="sd-info-item">
                      <span className="sd-info-label">Email</span>
                      <span className="sd-info-value">{s.email}</span>
                    </div>
                    <div className="sd-info-item">
                      <span className="sd-info-label">Phone</span>
                      <span className="sd-info-value">{formatPhone(s.phone) || '—'}</span>
                    </div>
                    <div className="sd-info-item">
                      <span className="sd-info-label">Role</span>
                      <span className="sd-info-value">
                        <span className="sd-role-badge" style={{ backgroundColor: ROLE_COLORS[s.role] }}>
                          {ROLE_ICONS[s.role]} {ROLE_LABELS[s.role]}
                        </span>
                      </span>
                    </div>
                    <div className="sd-info-item">
                      <span className="sd-info-label">Calendar Color</span>
                      <span className="sd-info-value">
                        <span className="sd-color-swatch" style={{ backgroundColor: s.color_code }}></span>
                        {s.color_code}
                      </span>
                    </div>
                    <div className="sd-info-item">
                      <span className="sd-info-label">Hire Date</span>
                      <span className="sd-info-value">{formatDate(s.hire_date)}</span>
                    </div>
                    <div className="sd-info-item">
                      <span className="sd-info-label">Status</span>
                      <span className="sd-info-value">{s.status}</span>
                    </div>
                  </div>
                </div>

                {s.internal_notes && (
                  <div className="sd-profile-section">
                    <h3 className="sd-section-title">📝 Internal Notes</h3>
                    <div className="sd-notes-box">{s.internal_notes}</div>
                  </div>
                )}

                <button className="sl-add-btn" onClick={function() { setEditing(true); setEditData(s) }}>
                  ✏️ Edit Profile
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveProfile} className="sd-edit-form">
                <div className="sl-form-row">
                  <div className="sl-form-group">
                    <label className="sl-label">First Name *</label>
                    <input type="text" value={editData.first_name || ''} onChange={function(e) { setEditData(Object.assign({}, editData, { first_name: e.target.value })) }} className="sl-input" required />
                  </div>
                  <div className="sl-form-group">
                    <label className="sl-label">Last Name *</label>
                    <input type="text" value={editData.last_name || ''} onChange={function(e) { setEditData(Object.assign({}, editData, { last_name: e.target.value })) }} className="sl-input" required />
                  </div>
                </div>
                <div className="sl-form-row">
                  <div className="sl-form-group">
                    <label className="sl-label">Email *</label>
                    <input type="email" value={editData.email || ''} onChange={function(e) { setEditData(Object.assign({}, editData, { email: e.target.value })) }} className="sl-input" required />
                  </div>
                  <div className="sl-form-group">
                    <label className="sl-label">Phone</label>
                    <input type="tel" value={editData.phone || ''} onChange={function(e) { setEditData(Object.assign({}, editData, { phone: formatPhoneOnInput(e.target.value) })) }} className="sl-input" placeholder="713-098-3746" />
                  </div>
                </div>
                <div className="sl-form-row">
                  <div className="sl-form-group">
                    <label className="sl-label">Role *</label>
                    <select value={editData.role} onChange={function(e) { setEditData(Object.assign({}, editData, { role: e.target.value, color_code: ROLE_COLORS[e.target.value] || editData.color_code })) }} className="sl-input">
                      <option value="owner">👑 Owner</option>
                      <option value="manager">⭐ Manager</option>
                      <option value="groomer">✂️ Groomer</option>
                      <option value="bather">🛁 Bather</option>
                      <option value="kennel_tech">🏠 Kennel Tech</option>
                      <option value="front_desk">🖥️ Front Desk</option>
                      <option value="trainer">🎓 Trainer</option>
                    </select>
                  </div>
                  <div className="sl-form-group">
                    <label className="sl-label">Calendar Color</label>
                    {/* Bright swatches */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      {BRIGHT_COLORS.map(function (c) {
                        var selected = editData.color_code === c.hex
                        return (
                          <button
                            key={c.hex} type="button" title={c.name + ' (bright)'}
                            onClick={function () { setEditData(Object.assign({}, editData, { color_code: c.hex })) }}
                            style={{
                              width: '26px', height: '26px', borderRadius: '50%',
                              border: selected ? '3px solid #111827' : '2px solid #fff',
                              boxShadow: '0 0 0 1px #e5e7eb',
                              background: c.hex, cursor: 'pointer', padding: 0,
                            }}
                          />
                        )
                      })}
                    </div>
                    {/* Neutral swatches */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      {NEUTRAL_COLORS.map(function (c) {
                        var selected = editData.color_code === c.hex
                        return (
                          <button
                            key={c.hex} type="button" title={c.name + ' (neutral)'}
                            onClick={function () { setEditData(Object.assign({}, editData, { color_code: c.hex })) }}
                            style={{
                              width: '26px', height: '26px', borderRadius: '50%',
                              border: selected ? '3px solid #111827' : '2px solid #fff',
                              boxShadow: '0 0 0 1px #e5e7eb',
                              background: c.hex, cursor: 'pointer', padding: 0,
                            }}
                          />
                        )
                      })}
                    </div>
                    <div className="sl-color-picker-row">
                      <input type="color" value={editData.color_code || '#7c3aed'} onChange={function(e) { setEditData(Object.assign({}, editData, { color_code: e.target.value })) }} className="sl-color-input" />
                      <span className="sl-color-preview" style={{ backgroundColor: editData.color_code }}></span>
                      <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '8px' }}>or custom</span>
                    </div>
                  </div>
                </div>
                <div className="sl-form-row">
                  <div className="sl-form-group">
                    <label className="sl-label">Hire Date</label>
                    <input type="date" value={editData.hire_date || ''} onChange={function(e) { setEditData(Object.assign({}, editData, { hire_date: e.target.value })) }} className="sl-input" />
                  </div>
                  <div className="sl-form-group">
                    <label className="sl-label">
                      Kiosk PIN
                      <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '400', marginLeft: '6px' }}>
                        (4 digits — for clock-in kiosk)
                      </span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      pattern="[0-9]{4}"
                      placeholder="e.g. 1234"
                      value={editData.pin_code || ''}
                      onChange={function(e) {
                        const digitsOnly = e.target.value.replace(/[^0-9]/g, '')
                        setEditData(Object.assign({}, editData, { pin_code: digitsOnly }))
                      }}
                      className="sl-input"
                      style={{ fontFamily: 'monospace', letterSpacing: '4px', fontSize: '18px' }}
                    />
                  </div>
                </div>
                <div className="sd-inline-note">
                  💡 Pay Type, rates, and commission are now managed on the <strong>Pay tab</strong>.
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Internal Notes</label>
                  <textarea value={editData.internal_notes || ''} onChange={function(e) { setEditData(Object.assign({}, editData, { internal_notes: e.target.value })) }} className="sl-textarea" rows="3" />
                </div>
                <div className="sl-form-actions">
                  <button type="button" className="sl-cancel-btn" onClick={function() { setEditing(false) }}>Cancel</button>
                  <button type="submit" className="sl-submit-btn" disabled={saving}>{saving ? '🐾 Saving...' : '✅ Save Changes'}</button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ===== PERMISSIONS TAB ===== */}
        {activeTab === 'permissions' && (
          <div className="sd-perms-tab">
            <div className="sd-perms-header">
              <div className="sd-perms-info">
                <h3>🔐 Permission Controls</h3>
                <p>Role defaults for <strong>{ROLE_LABELS[s.role]}</strong> are applied. Toggle any permission to customize.
                  {customCount > 0 && <span className="sd-perms-custom-count"> ({customCount} customized)</span>}
                </p>
              </div>
              <div className="sd-perms-actions">
                <button className="sd-perms-expand" onClick={expandAll}>Expand All</button>
                <button className="sd-perms-expand" onClick={collapseAll}>Collapse All</button>
                {customCount > 0 && (
                  <button className="sd-perms-reset" onClick={resetToDefaults}>
                    🔄 Reset to Defaults
                  </button>
                )}
              </div>
            </div>

            <div className="sd-perms-grid">
              {PERMISSION_CATEGORIES.map(function(cat) {
                var catCustom = cat.permissions.filter(function(p) { return isCustomized(p.key) }).length
                var catOn = cat.permissions.filter(function(p) { return getEffectivePermission(p.key) }).length

                return (
                  <div key={cat.key} className="sd-perm-category">
                    <div className="sd-perm-cat-header" onClick={function() { toggleCategory(cat.key) }}>
                      <span className="sd-perm-cat-title">{cat.label}</span>
                      <div className="sd-perm-cat-meta">
                        <span className="sd-perm-cat-count">{catOn}/{cat.permissions.length} on</span>
                        {catCustom > 0 && <span className="sd-perm-cat-custom">🟡 {catCustom} custom</span>}
                        <span className={'sd-perm-cat-arrow' + (openCategories[cat.key] ? ' sd-perm-cat-arrow-open' : '')}>▸</span>
                      </div>
                    </div>

                    {openCategories[cat.key] && (
                      <div className="sd-perm-list">
                        {cat.permissions.map(function(perm) {
                          var isOn = getEffectivePermission(perm.key)
                          var isCustom = isCustomized(perm.key)
                          var isSaving = permSaving === perm.key

                          return (
                            <div key={perm.key} className={'sd-perm-row' + (isCustom ? ' sd-perm-row-custom' : '')}>
                              <div className="sd-perm-label">
                                {isCustom && <span className="sd-perm-custom-dot" title="Customized from role default">●</span>}
                                <span>{perm.label}</span>
                              </div>
                              <button
                                className={'sd-perm-toggle' + (isOn ? ' sd-perm-toggle-on' : ' sd-perm-toggle-off')}
                                onClick={function() { togglePermission(perm.key) }}
                                disabled={isSaving}
                              >
                                <span className="sd-perm-toggle-slider"></span>
                                <span className="sd-perm-toggle-label">{isSaving ? '...' : isOn ? 'ON' : 'OFF'}</span>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ===== SCHEDULE TAB ===== */}
        {activeTab === 'schedule' && (function() {
          var weekDays = getSchedWeekDays()
          var weekHrs = getSchedWeekHours()
          var weekLabel = SCHED_MONTHS[weekDays[0].getMonth()] + ' ' + weekDays[0].getDate() + ' – ' + SCHED_MONTHS[weekDays[6].getMonth()] + ' ' + weekDays[6].getDate() + ', ' + weekDays[6].getFullYear()

          return (
            <div className="sd-schedule-tab">
              {/* Schedule Nav */}
              <div className="ss-nav" style={{ marginBottom: '16px' }}>
                <div className="ss-week-nav">
                  <button className="ss-nav-arrow" onClick={function() { navigateSchedWeek(-1) }}>◀</button>
                  <span className="ss-week-label">{weekLabel}</span>
                  <button className="ss-nav-arrow" onClick={function() { navigateSchedWeek(1) }}>▶</button>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#7c3aed', fontWeight: '600' }}>{weekHrs.toFixed(1)} hrs this week</span>
                  <button className="ss-today-btn" onClick={function() { setSchedWeekStart(getSchedWeekStart(new Date())) }}>This Week</button>
                  <button className="ss-copy-btn" onClick={function() { window.print() }}>🖨️ Print</button>
                </div>
              </div>

              {schedLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#7c3aed' }}>Loading schedule...</div>
              ) : (
                <div className="sdsc-week-grid">
                  {weekDays.map(function(day) {
                    var dateStr = formatSchedDateISO(day)
                    var dayShifts = schedShifts.filter(function(sh) { return sh.shift_date === dateStr })
                    var dayHrs = getSchedDayHours(dateStr)
                    var today = isSchedToday(day)

                    return (
                      <div key={dateStr} className={'sdsc-day-card' + (today ? ' sdsc-day-today' : '') + (dayShifts.length === 0 ? ' sdsc-day-off' : '')}>
                        <div className="sdsc-day-header">
                          <span className="sdsc-day-name">{SCHED_DAYS[day.getDay()]}</span>
                          <span className="sdsc-day-date">{SCHED_MONTHS[day.getMonth()] + ' ' + day.getDate()}</span>
                          {today && <span className="sdsc-today-badge">Today</span>}
                        </div>
                        <div className="sdsc-day-body">
                          {dayShifts.length === 0 ? (
                            <div className="sdsc-off-label">Day Off</div>
                          ) : (
                            dayShifts.map(function(shift) {
                              return (
                                <div key={shift.id} className="sdsc-shift" style={{ borderLeftColor: s.color || '#7c3aed' }}>
                                  <div className="sdsc-shift-time">{formatSchedTime(shift.start_time)} – {formatSchedTime(shift.end_time)}</div>
                                  {shift.break_minutes > 0 && <div className="sdsc-shift-break">☕ {shift.break_minutes} min break</div>}
                                  {shift.notes && <div className="sdsc-shift-note">📝 {shift.notes}</div>}
                                </div>
                              )
                            })
                          )}
                        </div>
                        {dayHrs > 0 && <div className="sdsc-day-hours">{dayHrs.toFixed(1)} hrs</div>}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Personal Notepad */}
              <div className="sdsc-notepad">
                <h3 className="sdsc-notepad-title">📝 Personal Notes</h3>
                <p className="sdsc-notepad-desc">Reminders, to-dos, and notes for the day</p>
                <div className="sdsc-note-form">
                  <textarea
                    value={newStaffNote}
                    onChange={function(e) { setNewStaffNote(e.target.value) }}
                    placeholder={'Add a note for ' + s.first_name + '...'}
                    className="sdsc-note-input"
                    rows="2"
                  />
                  <button
                    className="sdsc-note-submit"
                    onClick={handleAddStaffNote}
                    disabled={savingStaffNote || !newStaffNote.trim()}
                  >
                    {savingStaffNote ? 'Saving...' : '💾 Save Note'}
                  </button>
                </div>
                {staffNotes.length === 0 ? (
                  <div className="sdsc-note-empty">No notes yet. Add reminders or daily to-dos here!</div>
                ) : (
                  <div className="sdsc-notes-list">
                    {staffNotes.map(function(note) {
                      return (
                        <div key={note.id} className="sdsc-note-card">
                          <div className="sdsc-note-content">{note.content}</div>
                          <div className="sdsc-note-footer">
                            <span className="sdsc-note-date">{new Date(note.created_at).toLocaleDateString()}</span>
                            <button className="sdsc-note-delete" onClick={function() { deleteStaffNote(note.id) }}>🗑️</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ===== PAY TAB ===== */}
        {activeTab === 'pay' && (
          <div className="sd-pay-tab">
            {!payEditing ? (
              /* ---------- DISPLAY MODE ---------- */
              <div className="sd-profile-section">
                <div className="sd-section-header">
                  <h3 className="sd-section-title">💰 Pay Settings</h3>
                  <button className="sl-edit-btn" onClick={startPayEdit}>✏️ Edit Pay</button>
                </div>
                <div className="sd-info-grid">
                  <div className="sd-info-item">
                    <span className="sd-info-label">Pay Type</span>
                    <span className="sd-info-value">
                      {s.pay_type === 'hourly' && '💵 Hourly'}
                      {s.pay_type === 'commission' && '📊 Commission'}
                      {s.pay_type === 'salary' && '💼 Salary'}
                      {s.pay_type === 'hourly_commission' && '💵 Hourly + Commission'}
                      {!s.pay_type && '—'}
                    </span>
                  </div>
                  {(s.pay_type === 'hourly' || s.pay_type === 'hourly_commission') && (
                    <div className="sd-info-item">
                      <span className="sd-info-label">Hourly Rate</span>
                      <span className="sd-info-value sd-info-money">${s.hourly_rate ? parseFloat(s.hourly_rate).toFixed(2) : '0.00'}/hr</span>
                    </div>
                  )}
                  {(s.pay_type === 'commission' || s.pay_type === 'hourly_commission') && (
                    <div className="sd-info-item">
                      <span className="sd-info-label">Commission</span>
                      <span className="sd-info-value sd-info-money">{s.commission_percent || 0}%</span>
                    </div>
                  )}
                  {s.pay_type === 'salary' && (
                    <div className="sd-info-item">
                      <span className="sd-info-label">Salary (per period)</span>
                      <span className="sd-info-value sd-info-money">${s.salary_amount ? parseFloat(s.salary_amount).toFixed(2) : '0.00'}</span>
                    </div>
                  )}
                  <div className="sd-info-item">
                    <span className="sd-info-label">Pay Period</span>
                    <span className="sd-info-value">
                      {s.pay_period_type === 'weekly' && 'Weekly'}
                      {s.pay_period_type === 'bi_weekly' && 'Bi-Weekly'}
                      {s.pay_period_type === 'semi_monthly' && 'Semi-Monthly (1st & 15th)'}
                      {s.pay_period_type === 'monthly' && 'Monthly'}
                      {!s.pay_period_type && 'Bi-Weekly'}
                    </span>
                  </div>
                  <div className="sd-info-item">
                    <span className="sd-info-label">Overtime</span>
                    <span className="sd-info-value">
                      {s.overtime_enabled === false
                        ? 'Not applicable'
                        : (s.overtime_rate_multiplier || 1.5) + 'x after 40 hrs/week'}
                    </span>
                  </div>
                  <div className="sd-info-item">
                    <span className="sd-info-label">Tips</span>
                    <span className="sd-info-value">
                      {s.tips_handling === 'keep_all' && 'Keeps all tips'}
                      {s.tips_handling === 'pool' && 'Tip pool'}
                      {s.tips_handling === 'split' && 'Split ' + (s.tips_percent || 0) + '%'}
                      {!s.tips_handling && 'Keeps all tips'}
                    </span>
                  </div>
                </div>

                {/* Worker & Tax Info (view mode) */}
                <h3 className="sd-section-title" style={{ marginTop: '28px' }}>🧾 Worker &amp; Tax Info</h3>
                <div className="sd-info-grid">
                  <div className="sd-info-item">
                    <span className="sd-info-label">Worker Type</span>
                    <span className="sd-info-value">
                      {s.worker_type === '1099'
                        ? '🧾 1099 Contractor'
                        : '👤 W-2 Employee'}
                    </span>
                  </div>
                  {s.worker_type !== '1099' && (
                    <>
                      <div className="sd-info-item">
                        <span className="sd-info-label">Filing Status</span>
                        <span className="sd-info-value">
                          {s.tax_filing_status === 'single' && 'Single'}
                          {s.tax_filing_status === 'married' && 'Married'}
                          {s.tax_filing_status === 'head_of_household' && 'Head of Household'}
                          {s.tax_filing_status === 'married_separately' && 'Married Filing Separately'}
                          {!s.tax_filing_status && 'Single'}
                        </span>
                      </div>
                      <div className="sd-info-item">
                        <span className="sd-info-label">Federal Allowances</span>
                        <span className="sd-info-value">{s.federal_allowances || 0}</span>
                      </div>
                    </>
                  )}
                  <div className="sd-info-item">
                    <span className="sd-info-label">
                      {s.worker_type === '1099' ? 'EIN (Tax ID)' : 'SSN'}
                    </span>
                    <span className="sd-info-value">{maskTaxId(s.tax_id)}</span>
                  </div>
                </div>

                {/* Mailing Address (view mode) */}
                <h3 className="sd-section-title" style={{ marginTop: '28px' }}>📬 Mailing Address</h3>
                <div className="sd-address-block">
                  {(!s.address_line1 && !s.city && !s.state && !s.zip) ? (
                    <span className="sd-address-empty">No address on file</span>
                  ) : (
                    <>
                      {s.address_line1 && <div>{s.address_line1}</div>}
                      {s.address_line2 && <div>{s.address_line2}</div>}
                      <div>
                        {s.city && s.city + ', '}
                        {s.state && s.state + ' '}
                        {s.zip}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              /* ---------- EDIT MODE ---------- */
              <form className="sd-profile-section" onSubmit={handleSavePay}>
                <h3 className="sd-section-title">💰 Edit Pay Settings</h3>

                {/* Pay Type */}
                <div className="sl-form-group">
                  <label className="sl-label">Pay Type</label>
                  <select
                    value={payEditData.pay_type || 'hourly'}
                    onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { pay_type: e.target.value })) }}
                    className="sl-input"
                  >
                    <option value="hourly">💵 Hourly</option>
                    <option value="commission">📊 Commission only</option>
                    <option value="hourly_commission">💵 Hourly + Commission</option>
                    <option value="salary">💼 Salary</option>
                  </select>
                </div>

                {/* Hourly Rate (shown for hourly or hourly_commission) */}
                {(payEditData.pay_type === 'hourly' || payEditData.pay_type === 'hourly_commission') && (
                  <div className="sl-form-group">
                    <label className="sl-label">Hourly Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={payEditData.hourly_rate || ''}
                      onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { hourly_rate: e.target.value })) }}
                      className="sl-input"
                      placeholder="e.g. 18.50"
                    />
                  </div>
                )}

                {/* Commission % (shown for commission or hourly_commission) */}
                {(payEditData.pay_type === 'commission' || payEditData.pay_type === 'hourly_commission') && (
                  <div className="sl-form-group">
                    <label className="sl-label">Commission Percent (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={payEditData.commission_percent || ''}
                      onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { commission_percent: e.target.value })) }}
                      className="sl-input"
                      placeholder="e.g. 50"
                    />
                    <span className="sd-field-hint">% of service price this staff earns</span>
                  </div>
                )}

                {/* Salary Amount (shown for salary) */}
                {payEditData.pay_type === 'salary' && (
                  <div className="sl-form-group">
                    <label className="sl-label">Salary Amount per Pay Period ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={payEditData.salary_amount || ''}
                      onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { salary_amount: e.target.value })) }}
                      className="sl-input"
                      placeholder="e.g. 1500.00"
                    />
                  </div>
                )}

                {/* Pay Period */}
                <div className="sl-form-group">
                  <label className="sl-label">Pay Period</label>
                  <select
                    value={payEditData.pay_period_type || 'bi_weekly'}
                    onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { pay_period_type: e.target.value })) }}
                    className="sl-input"
                  >
                    <option value="weekly">Weekly (every week)</option>
                    <option value="bi_weekly">Bi-Weekly (every 2 weeks)</option>
                    <option value="semi_monthly">Semi-Monthly (1st &amp; 15th)</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {/* Overtime */}
                <div className="sl-form-row">
                  <div className="sl-form-group">
                    <label className="sl-label">
                      <input
                        type="checkbox"
                        checked={payEditData.overtime_enabled !== false}
                        onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { overtime_enabled: e.target.checked })) }}
                        style={{ marginRight: '8px' }}
                      />
                      Overtime applies after 40 hrs/week
                    </label>
                  </div>
                  {payEditData.overtime_enabled !== false && (
                    <div className="sl-form-group">
                      <label className="sl-label">OT Multiplier</label>
                      <input
                        type="number"
                        step="0.1"
                        min="1"
                        max="3"
                        value={payEditData.overtime_rate_multiplier || 1.5}
                        onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { overtime_rate_multiplier: e.target.value })) }}
                        className="sl-input"
                      />
                      <span className="sd-field-hint">1.5 = time-and-a-half</span>
                    </div>
                  )}
                </div>

                {/* Tips Handling */}
                <div className="sl-form-group">
                  <label className="sl-label">Tips Handling</label>
                  <select
                    value={payEditData.tips_handling || 'keep_all'}
                    onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { tips_handling: e.target.value })) }}
                    className="sl-input"
                  >
                    <option value="keep_all">Keeps all own tips</option>
                    <option value="pool">Tip pool (split evenly with team)</option>
                    <option value="split">Split (this staff gets a set %)</option>
                  </select>
                </div>

                {/* Tips Split % (shown for split) */}
                {payEditData.tips_handling === 'split' && (
                  <div className="sl-form-group">
                    <label className="sl-label">This staff's tip share (%)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={payEditData.tips_percent || ''}
                      onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { tips_percent: e.target.value })) }}
                      className="sl-input"
                      placeholder="e.g. 70"
                    />
                  </div>
                )}

                {/* =============== Worker & Tax Info =============== */}
                <h3 className="sd-section-title" style={{ marginTop: '28px' }}>🧾 Worker &amp; Tax Info</h3>

                <div className="sl-form-group">
                  <label className="sl-label">Worker Type</label>
                  <select
                    value={payEditData.worker_type || 'w2'}
                    onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { worker_type: e.target.value })) }}
                    className="sl-input"
                  >
                    <option value="w2">👤 W-2 Employee (taxes withheld)</option>
                    <option value="1099">🧾 1099 Contractor (no tax withholding)</option>
                  </select>
                  <span className="sd-field-hint">
                    Affects whether tax is estimated on the pay stub. W-2 gets year-end W-2, 1099 gets year-end 1099-NEC.
                  </span>
                </div>

                {payEditData.worker_type !== '1099' && (
                  <div className="sl-form-row">
                    <div className="sl-form-group">
                      <label className="sl-label">Filing Status (W-4)</label>
                      <select
                        value={payEditData.tax_filing_status || 'single'}
                        onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { tax_filing_status: e.target.value })) }}
                        className="sl-input"
                      >
                        <option value="single">Single</option>
                        <option value="married">Married Filing Jointly</option>
                        <option value="married_separately">Married Filing Separately</option>
                        <option value="head_of_household">Head of Household</option>
                      </select>
                    </div>
                    <div className="sl-form-group">
                      <label className="sl-label">Federal Allowances</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={payEditData.federal_allowances || 0}
                        onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { federal_allowances: e.target.value })) }}
                        className="sl-input"
                      />
                      <span className="sd-field-hint">From their W-4 form (usually 0-3)</span>
                    </div>
                  </div>
                )}

                <div className="sl-form-group">
                  <label className="sl-label">
                    {payEditData.worker_type === '1099' ? 'EIN (Tax ID)' : 'SSN (Social Security Number)'}
                  </label>
                  <input
                    type="password"
                    value={payEditData.tax_id || ''}
                    onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { tax_id: e.target.value })) }}
                    className="sl-input"
                    placeholder={payEditData.worker_type === '1099' ? 'XX-XXXXXXX' : 'XXX-XX-XXXX'}
                    autoComplete="off"
                  />
                  <span className="sd-field-hint">
                    🔒 Stored securely. Shown masked (last 4 digits only). Required for year-end forms.
                  </span>
                </div>

                {/* =============== Mailing Address =============== */}
                <h3 className="sd-section-title" style={{ marginTop: '28px' }}>📬 Mailing Address</h3>
                <span className="sd-field-hint" style={{ marginBottom: '12px', display: 'block' }}>
                  Needed on year-end W-2 / 1099 forms.
                </span>

                <div className="sl-form-group">
                  <label className="sl-label">Street Address</label>
                  <input
                    type="text"
                    value={payEditData.address_line1 || ''}
                    onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { address_line1: e.target.value })) }}
                    className="sl-input"
                    placeholder="123 Main St"
                  />
                </div>

                <div className="sl-form-group">
                  <label className="sl-label">Apt / Suite (optional)</label>
                  <input
                    type="text"
                    value={payEditData.address_line2 || ''}
                    onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { address_line2: e.target.value })) }}
                    className="sl-input"
                    placeholder="Apt 4B"
                  />
                </div>

                <div className="sl-form-row">
                  <div className="sl-form-group">
                    <label className="sl-label">City</label>
                    <input
                      type="text"
                      value={payEditData.city || ''}
                      onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { city: e.target.value })) }}
                      className="sl-input"
                      placeholder="Austin"
                    />
                  </div>
                  <div className="sl-form-group">
                    <label className="sl-label">State</label>
                    <input
                      type="text"
                      maxLength="2"
                      value={payEditData.state || ''}
                      onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { state: e.target.value.toUpperCase() })) }}
                      className="sl-input"
                      placeholder="TX"
                    />
                  </div>
                  <div className="sl-form-group">
                    <label className="sl-label">ZIP</label>
                    <input
                      type="text"
                      maxLength="10"
                      value={payEditData.zip || ''}
                      onChange={function(e) { setPayEditData(Object.assign({}, payEditData, { zip: e.target.value })) }}
                      className="sl-input"
                      placeholder="78701"
                    />
                  </div>
                </div>

                {/* Save / Cancel */}
                <div className="sl-form-actions">
                  <button type="button" className="sl-cancel-btn" onClick={function() { setPayEditing(false) }}>Cancel</button>
                  <button type="submit" className="sl-submit-btn" disabled={paySaving}>
                    {paySaving ? '🐾 Saving...' : '✅ Save Pay Settings'}
                  </button>
                </div>
              </form>
            )}

            {/* ===== DEDUCTIONS ===== */}
            {staffMember && (
              <StaffDeductions staffId={id} groomerId={staffMember.groomer_id} />
            )}
          </div>
        )}

      </div>
    </div>
  )
}

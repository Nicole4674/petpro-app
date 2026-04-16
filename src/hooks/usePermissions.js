import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ROLE_DEFAULTS from '../lib/roleDefaults'

// ==========================================
// usePermissions Hook
// ==========================================
// Determines if the current user is an owner or staff,
// loads their role + any permission overrides,
// and returns a canAccess() helper for checking permissions.
//
// Usage in any page:
//   const { role, canAccess, businessOwnerId, loading } = usePermissions()
//   if (loading) return <div>Loading...</div>
//   if (!canAccess('calendar.view_all')) return <div>No access</div>
//   // Use businessOwnerId as groomer_id for all Supabase queries
// ==========================================

export default function usePermissions() {
  var [loading, setLoading] = useState(true)
  var [role, setRole] = useState(null)            // 'owner', 'manager', 'groomer', etc.
  var [staffId, setStaffId] = useState(null)       // staff_members.id if staff
  var [staffRecord, setStaffRecord] = useState(null) // full staff row
  var [businessOwnerId, setBusinessOwnerId] = useState(null) // the groomer_id for queries
  var [businessId, setBusinessId] = useState(null)
  var [permissions, setPermissions] = useState({}) // merged defaults + overrides
  var [error, setError] = useState(null)

  useEffect(function () {
    loadPermissions()
  }, [])

  async function loadPermissions() {
    try {
      setLoading(true)
      setError(null)

      // Step 1: Get current auth user
      var { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      var userId = user.id

      // Step 2: Check if this user owns a business
      var { data: bizData, error: bizErr } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', userId)
        .maybeSingle()

      if (bizData) {
        // This user IS the business owner
        setRole('owner')
        setBusinessOwnerId(userId)
        setBusinessId(bizData.id)
        setPermissions(ROLE_DEFAULTS.owner || {})
        setLoading(false)
        return
      }

      // Step 3: Not an owner — check if they're a staff member
      var { data: staffData, error: staffErr } = await supabase
        .from('staff_members')
        .select('*, businesses!business_id(owner_id)')
        .eq('auth_user_id', userId)
        .maybeSingle()

      if (staffData) {
        // This user is staff
        var staffRole = staffData.role || 'groomer'
        setRole(staffRole)
        setStaffId(staffData.id)
        setStaffRecord(staffData)
        setBusinessId(staffData.business_id)

        // Get the business owner's ID (this is what we use as groomer_id in queries)
        var ownerId = null
        if (staffData.businesses && staffData.businesses.owner_id) {
          ownerId = staffData.businesses.owner_id
        }
        setBusinessOwnerId(ownerId)

        // Start with role defaults
        var mergedPerms = Object.assign({}, ROLE_DEFAULTS[staffRole] || {})

        // Step 4: Load any permission overrides for this specific staff member
        var { data: overrides, error: overErr } = await supabase
          .from('staff_permissions')
          .select('permission_key, allowed')
          .eq('staff_id', staffData.id)

        if (overrides && overrides.length > 0) {
          overrides.forEach(function (ov) {
            mergedPerms[ov.permission_key] = ov.allowed
          })
        }

        setPermissions(mergedPerms)
        setLoading(false)
        return
      }

      // Step 4 fallback: User is neither owner nor linked staff
      // They might be an owner who hasn't created a business yet (legacy accounts)
      // For backwards compatibility, treat them as owner with their own uid as groomer_id
      setRole('owner')
      setBusinessOwnerId(userId)
      setPermissions(ROLE_DEFAULTS.owner || {})
      setLoading(false)

    } catch (err) {
      console.error('usePermissions error:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  // Check a single permission key
  function canAccess(permKey) {
    // Owner always has full access
    if (role === 'owner') return true
    return permissions[permKey] === true
  }

  // Check multiple permission keys (returns true if ALL are allowed)
  function canAccessAll(permKeys) {
    if (role === 'owner') return true
    return permKeys.every(function (key) {
      return permissions[key] === true
    })
  }

  // Check multiple permission keys (returns true if ANY is allowed)
  function canAccessAny(permKeys) {
    if (role === 'owner') return true
    return permKeys.some(function (key) {
      return permissions[key] === true
    })
  }

  return {
    loading: loading,
    error: error,
    role: role,
    staffId: staffId,
    staffRecord: staffRecord,
    businessOwnerId: businessOwnerId,
    businessId: businessId,
    permissions: permissions,
    canAccess: canAccess,
    canAccessAll: canAccessAll,
    canAccessAny: canAccessAny,
    isOwner: role === 'owner',
    isStaff: role !== null && role !== 'owner',
  }
}

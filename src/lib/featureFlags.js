// =============================================================================
// featureFlags.js — Central toggle for in-progress features
// =============================================================================
// Set a flag to true to expose the feature in the UI. Set to false to hide
// it everywhere (sidebar links, pages, buttons, etc.).
//
// Usage:
//   import { FEATURE_FLAGS } from '../lib/featureFlags'
//   if (FEATURE_FLAGS.SUBSCRIPTIONS) { ... }
//
// Why: lets us push half-built features to production without exposing them
// to real users. Flip to true only when fully tested + ready to launch.
// =============================================================================

export const FEATURE_FLAGS = {
  // Custom client subscriptions ("$30/mo unlimited nail trims" etc.)
  // Phase 1 (plan creation) only. Phases 2-4 still TBD.
  // Flip to true ONLY when the entire flow is tested end-to-end:
  //   1. Groomer creates a plan → Stripe Product + Price exist
  //   2. Client subscribes via portal → recurring charge fires
  //   3. Coverage logic at checkout works
  //   4. Cancel/pause flows work both sides
  SUBSCRIPTIONS: true,
}

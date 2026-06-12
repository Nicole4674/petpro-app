// App-wide constants for PetPro mobile.

// Shared secret that authenticates the app to the trial/signup edge functions.
// (Matches the PETPRO_APP_TRIAL_KEY secret in Supabase.) Low-sensitivity: it
// only lets the app start a free trial / create an account, both of which are
// further locked down server-side.
export const APP_TRIAL_KEY = '1a91240498fef0fcdd2b55c29094f4d219ee3626baba4967';

// Customer-facing website (NO tappable in-app links to it for billing —
// Google Play policy. Shown as plain text only.)
export const WEB_DOMAIN = 'trypetpro.com';

// Platform owners always bypass the subscription gate (Nicole's accounts).
export const PLATFORM_OWNER_EMAILS = [
  'treadwell4674@gmail.com',
  'nicole@trypetpro.com',
];

// Plans the app offers for the free trial.
export const PLANS = [
  { slug: 'basic', name: 'Basic', price: 70, tagline: 'Run your shop, your way — SMS, Suds, grooming & boarding.' },
  { slug: 'pro', name: 'Pro', price: 129, tagline: 'Everything in Basic + branded client portal & messaging.' },
  { slug: 'pro_plus', name: 'Pro+', price: 199, tag: 'Most Popular', tagline: 'PetPro AI — chat + voice booking.' },
  { slug: 'growing', name: 'Growing', price: 399, tag: 'Best Value', tagline: 'AI runs the busywork for you.' },
];

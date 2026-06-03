// PetPro mobile design system — the single source of truth for the app's look.
// As we restyle each screen, pull colors/spacing from here so it stays consistent
// and a future tweak updates everywhere at once.
export const colors = {
  primary: '#7c3aed',
  primaryDark: '#5b21b6',
  primaryLight: '#ede9fe',
  bg: '#f5f3ff',
  card: '#ffffff',
  text: '#111827',
  textMute: '#6b7280',
  textFaint: '#9ca3af',
  green: '#16a34a',
  border: '#e5e7eb',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 };
export const radius = { sm: 8, md: 12, lg: 16 };

// Soft drop-shadow for cards — gives the "floating" depth the website has.
// iOS uses shadow*, Android uses elevation; both included so it works everywhere.
export const shadow = {
  shadowColor: '#5b21b6',
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

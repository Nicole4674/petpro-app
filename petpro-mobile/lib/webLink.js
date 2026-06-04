// Links from the app out to the full web version. The app covers the day-to-day
// mobile-groomer workflow; the website has the deeper/rarely-needed settings.
// "Open full version on web" buttons use this so a groomer can jump to the web
// for anything not (yet) in the app.
import { Linking } from 'react-native';

export const WEB_BASE = 'https://petpro-app.vercel.app';

export function openWeb(path = '') {
  const p = path && !path.startsWith('/') ? `/${path}` : path;
  Linking.openURL(`${WEB_BASE}${p}`);
}

export function portalSignupLink(groomerId) {
  return `${WEB_BASE}/portal/signup?g=${groomerId}`;
}

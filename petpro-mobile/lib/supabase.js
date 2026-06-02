// Supabase client for the PetPro mobile app.
// Talks to the SAME backend as the website — same database, same accounts.
// The anon/publishable key is safe to ship in the app; security is enforced
// by row-level security rules on the database, not by hiding this key.
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://egupqwfawgymeqdmngsm.supabase.co'
const supabaseAnonKey = 'sb_publishable_zDcMebmzMwm1-xSEz6m0CQ_935dkGTb'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Keep the groomer logged in between app opens
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Not a web browser, so no URL-based session detection
    detectSessionInUrl: false,
  },
})

// SubscriptionGate — blocks app access unless the groomer's plan/trial is good.
// Mirrors the website's SubscriptionGate.jsx decision matrix.
import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import { PLATFORM_OWNER_EMAILS, WEB_DOMAIN } from '../lib/appConfig';

export default function SubscriptionGate({ session, onSignOut, children }) {
  const [state, setState] = useState({ loading: true, allowed: false });

  const check = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const user = session && session.user;
      if (!user) { setState({ loading: false, allowed: false }); return; }

      const email = (user.email || '').toLowerCase();
      if (email && PLATFORM_OWNER_EMAILS.indexOf(email) >= 0) { setState({ loading: false, allowed: true }); return; }

      // Pet owners (clients) bypass — they don't pay here.
      const { data: clientRow } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle();
      if (clientRow) { setState({ loading: false, allowed: true }); return; }

      // Staff (non-owner) bypass — their owner pays.
      const { data: staffRow } = await supabase.from('staff_members').select('id, role').eq('auth_user_id', user.id).maybeSingle();
      if (staffRow && staffRow.role !== 'owner') { setState({ loading: false, allowed: true }); return; }

      // Owner / groomer — check subscription.
      let { data: g } = await supabase.from('groomers')
        .select('subscription_status, trial_ends_at').eq('id', user.id).maybeSingle();
      if (!g && user.email) {
        const { data: byEmail } = await supabase.from('groomers')
          .select('subscription_status, trial_ends_at').eq('email', user.email).maybeSingle();
        if (byEmail) g = byEmail;
      }
      if (!g) { setState({ loading: false, allowed: false }); return; }

      const status = (g.subscription_status || '').toLowerCase();
      const trialEnds = g.trial_ends_at ? new Date(g.trial_ends_at) : null;
      const now = new Date();

      if (status === 'active') { setState({ loading: false, allowed: true }); return; }
      if (status === 'trialing' && trialEnds && trialEnds > now) { setState({ loading: false, allowed: true }); return; }

      // trial expired, canceled, past_due, unpaid, incomplete, or no status → block
      setState({ loading: false, allowed: false });
    } catch (e) {
      setState({ loading: false, allowed: false, error: e.message });
    }
  }, [session]);

  useEffect(() => { check(); }, [check]);
  // Re-check when the app returns to the foreground (catches just-started trials / renewals).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [check]);

  if (state.loading) {
    return <View style={styles.center}><Text style={styles.loadingPaw}>🐾</Text><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.loadingText}>Checking your account…</Text></View>;
  }

  if (!state.allowed) {
    return (
      <View style={styles.blockWrap}>
        <Text style={styles.blockLogo}>🐾</Text>
        <Text style={styles.blockTitle}>Your free trial has ended</Text>
        <Text style={styles.blockBody}>Keep your shop running at{'\n'}<Text style={styles.blockDomain}>{WEB_DOMAIN}</Text></Text>
        <Pressable style={styles.refreshBtn} onPress={check}>
          <Ionicons name="refresh" size={18} color="#fff" /><Text style={styles.refreshText}>I just subscribed — refresh</Text>
        </Pressable>
        <Pressable style={styles.signoutBtn} onPress={onSignOut}><Text style={styles.signoutText}>Sign out</Text></Pressable>
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingPaw: { fontSize: 40 },
  loadingText: { color: colors.textMute, fontSize: 15 },
  blockWrap: { flex: 1, backgroundColor: '#5b21b6', alignItems: 'center', justifyContent: 'center', padding: 28 },
  blockLogo: { fontSize: 52, marginBottom: 8 },
  blockTitle: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  blockBody: { color: '#ddd6fe', fontSize: 16, textAlign: 'center', marginTop: 12, lineHeight: 24 },
  blockDomain: { color: '#fff', fontWeight: '800' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, marginTop: 28 },
  refreshText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  signoutBtn: { marginTop: 16, paddingVertical: 10 },
  signoutText: { color: '#c4b5fd', fontWeight: '700', fontSize: 14 },
});

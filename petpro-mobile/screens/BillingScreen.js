import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';
import { WEB_BASE } from '../lib/webLink';

// Groomer sign-in page on the web (NOT the landing page).
const WEB_SIGNIN = `${WEB_BASE}/login`;

// Plan name/price lookup for the read-only "current plan" display.
const PLAN_INFO = {
  basic: { name: 'Basic', price: 70 },
  pro: { name: 'Pro', price: 129 },
  pro_plus: { name: 'Pro+', price: 199 },
  growing: { name: 'Growing', price: 399 },
};
const STATUS = {
  trialing: { label: 'Free trial', color: '#b45309', bg: '#fef3c7' },
  active: { label: 'Active', color: '#166534', bg: '#dcfce7' },
  past_due: { label: 'Past due', color: '#b91c1c', bg: '#fee2e2' },
  canceled: { label: 'Canceled', color: '#6b7280', bg: '#f3f4f6' },
};

function fmtDate(s) { if (!s) return ''; return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

export default function BillingScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [groomer, setGroomer] = useState(null);
  const [balance, setBalance] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);
  useEffect(() => { const unsub = navigation.addListener('focus', () => load()); return unsub; }, [navigation]);

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data: g } = await supabase.from('groomers')
        .select('subscription_tier, subscription_status, trial_ends_at, current_period_end')
        .eq('id', session.user.id).maybeSingle();
      setGroomer(g);
      const { data: b } = await supabase.from('groomer_token_balance')
        .select('monthly_tokens_remaining, monthly_tokens_total, topup_tokens_remaining')
        .eq('groomer_id', session.user.id).maybeSingle();
      setBalance(b);
    } catch (e) { setErr(e.message || 'Could not load billing.'); } finally { setLoading(false); }
  }

  const tier = groomer && groomer.subscription_tier;
  const ss = groomer && groomer.subscription_status ? STATUS[groomer.subscription_status] : null;
  const currentPlan = tier ? PLAN_INFO[tier] : null;
  const monthlyTotal = balance ? balance.monthly_tokens_total : null;
  const monthlyRem = balance ? balance.monthly_tokens_remaining : null;
  const topup = balance ? balance.topup_tokens_remaining : 0;
  const pct = monthlyTotal ? Math.max(0, Math.min(1, monthlyRem / monthlyTotal)) : 0;

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Ionicons name="card" size={20} color="#fff" /><Text style={styles.title}>Billing</Text>
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {err ? <Text style={styles.err}>{err}</Text> : null}

          {/* Current plan (read-only) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Current Plan</Text>
            {currentPlan ? (
              <>
                <View style={styles.planTop}>
                  <Text style={styles.planName}>{currentPlan.name}</Text>
                  {ss ? <View style={[styles.badge, { backgroundColor: ss.bg }]}><Text style={[styles.badgeText, { color: ss.color }]}>{ss.label}</Text></View> : null}
                </View>
                <Text style={styles.planPrice}>${currentPlan.price}/month</Text>
                {groomer.subscription_status === 'trialing' && groomer.trial_ends_at ? <Text style={styles.planMeta}>Trial ends {fmtDate(groomer.trial_ends_at)}</Text> : null}
                {groomer.subscription_status === 'active' && groomer.current_period_end ? <Text style={styles.planMeta}>Renews {fmtDate(groomer.current_period_end)}</Text> : null}
              </>
            ) : (
              <Text style={styles.muted}>No active subscription on file.</Text>
            )}
          </View>

          {/* AI tokens (read-only) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Suds AI Tokens</Text>
            {balance ? (
              <>
                <View style={styles.tokRow}><Text style={styles.tokLabel}>This month</Text><Text style={styles.tokVal}>{monthlyRem} / {monthlyTotal}</Text></View>
                <View style={styles.bar}><View style={[styles.barFill, { width: `${pct * 100}%` }]} /></View>
                <View style={styles.tokRow}><Text style={styles.tokLabel}>Top-up balance (never expires)</Text><Text style={styles.tokVal}>{topup}</Text></View>
              </>
            ) : <Text style={styles.muted}>No token balance yet.</Text>}
          </View>

          {/* Manage on the web — plain text only (Google Play policy: no billing link-out) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Manage Your Plan</Text>
            <Text style={styles.muted}>Manage your plan at trypetpro.com.</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 50 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 16, ...shadow },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { fontSize: 22, fontWeight: '800', color: colors.text },
  planPrice: { fontSize: 15, color: colors.textMute, fontWeight: '700', marginTop: 2 },
  planMeta: { fontSize: 13, color: colors.textMute, marginTop: 6 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  muted: { color: colors.textMute, fontSize: 14, lineHeight: 20 },
  tokRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  tokLabel: { fontSize: 14, color: colors.textMute, flex: 1 },
  tokVal: { fontSize: 14, color: colors.text, fontWeight: '800' },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#f3f4f6', marginBottom: 12, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  signinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, marginTop: 14 },
  signinText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
});

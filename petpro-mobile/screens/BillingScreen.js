import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

const STRIPE_PORTAL = 'https://billing.stripe.com/p/login/9B614pdfv1yGcsn6hB7ok00';
const PLANS = [
  { slug: 'basic', name: 'Basic', price: 70, tagline: 'Run your shop manually, your way.', link: 'https://buy.stripe.com/dRm9AV7Vb1yG3VReO77ok02' },
  { slug: 'pro', name: 'Pro', price: 129, tagline: 'Your branded client portal + messaging.', link: 'https://buy.stripe.com/eVq9AV4IZ4KS1NJcFZ7ok03' },
  { slug: 'pro_plus', name: 'Pro+', price: 199, tagline: 'PetPro AI — chat + voice booking.', tag: 'Most Popular', link: 'https://buy.stripe.com/cNi5kF1wN3GO7835dx7ok01' },
  { slug: 'growing', name: 'Growing', price: 399, tagline: 'AI runs the busywork for you.', tag: 'Best Value', link: 'https://buy.stripe.com/9B614pdfv1yGcsn6hB7ok00' },
];
const TOPUPS = [
  { tokens: 250, label: '250 tokens', price: '$24.99', link: 'https://buy.stripe.com/dRm14p5N32CKboj6hB7ok05' },
  { tokens: 500, label: '500 tokens', price: '$44.99', best: true, link: 'https://buy.stripe.com/6oUdRb5N3b9g4ZVbBV7ok06' },
  { tokens: 1000, label: '1,000 tokens', price: '$84.99', link: 'https://buy.stripe.com/00w8wR3EVa5c1NJfSb7ok07' },
];
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

  function openLink(url) { Linking.openURL(`${url}${url.includes('?') ? '&' : '?'}client_reference_id=${session.user.id}`); }

  const tier = groomer && groomer.subscription_tier;
  const ss = groomer && groomer.subscription_status ? STATUS[groomer.subscription_status] : null;
  const currentPlan = PLANS.find((p) => p.slug === tier);
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

          {/* Current plan */}
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
                <Pressable style={styles.manageBtn} onPress={() => Linking.openURL(STRIPE_PORTAL)}>
                  <Ionicons name="settings-outline" size={16} color={colors.primaryDark} /><Text style={styles.manageText}>Manage subscription</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.muted}>No active subscription yet. Choose a plan below to start your free trial.</Text>
            )}
          </View>

          {/* AI tokens */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Suds AI Tokens</Text>
            {balance ? (
              <>
                <View style={styles.tokRow}><Text style={styles.tokLabel}>This month</Text><Text style={styles.tokVal}>{monthlyRem} / {monthlyTotal}</Text></View>
                <View style={styles.bar}><View style={[styles.barFill, { width: `${pct * 100}%` }]} /></View>
                <View style={styles.tokRow}><Text style={styles.tokLabel}>Top-up balance (never expires)</Text><Text style={styles.tokVal}>{topup}</Text></View>
              </>
            ) : <Text style={styles.muted}>No token balance yet.</Text>}
            <Text style={[styles.label, { marginTop: 14 }]}>Buy more tokens</Text>
            {TOPUPS.map((t) => (
              <Pressable key={t.tokens} style={styles.topupRow} onPress={() => openLink(t.link)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.topupName}>{t.label}{t.best ? '  ⭐ best value' : ''}</Text>
                </View>
                <Text style={styles.topupPrice}>{t.price}</Text>
                <Ionicons name="open-outline" size={16} color={colors.primary} style={{ marginLeft: 8 }} />
              </Pressable>
            ))}
          </View>

          {/* Plans */}
          <Text style={styles.sectionHeading}>{currentPlan ? 'Change plan' : 'Choose a plan'}</Text>
          {PLANS.map((p) => {
            const isCurrent = p.slug === tier;
            return (
              <Pressable key={p.slug} style={[styles.planCard, isCurrent && styles.planCardCurrent]} onPress={() => !isCurrent && openLink(p.link)} disabled={isCurrent}>
                <View style={{ flex: 1 }}>
                  <View style={styles.planRow}>
                    <Text style={styles.planCardName}>{p.name}</Text>
                    {p.tag ? <View style={styles.planTag}><Text style={styles.planTagText}>{p.tag}</Text></View> : null}
                    {isCurrent ? <View style={styles.currentTag}><Text style={styles.currentTagText}>Current</Text></View> : null}
                  </View>
                  <Text style={styles.planCardTagline}>{p.tagline}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.planCardPrice}>${p.price}</Text>
                  <Text style={styles.planCardMo}>/mo</Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable style={styles.enterprise} onPress={() => Linking.openURL('mailto:nicole@trypetpro.com?subject=Enterprise plan inquiry')}>
            <Text style={styles.enterpriseText}>Need Enterprise (multi-groomer / boarding facility)? Contact us ›</Text>
          </Pressable>

          <Text style={styles.hint}>Plan changes and purchases open securely in Stripe. Your account updates automatically once payment is confirmed.</Text>
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
  manageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 12, marginTop: 14 },
  manageText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  muted: { color: colors.textMute, fontSize: 14, lineHeight: 20 },
  tokRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  tokLabel: { fontSize: 14, color: colors.textMute, flex: 1 },
  tokVal: { fontSize: 14, color: colors.text, fontWeight: '800' },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#f3f4f6', marginBottom: 12, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  label: { fontSize: 13, fontWeight: '800', color: colors.textMute, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  topupRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  topupName: { fontSize: 15, fontWeight: '700', color: colors.text },
  topupPrice: { fontSize: 15, fontWeight: '800', color: colors.green },
  sectionHeading: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10 },
  planCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.border, ...shadow },
  planCardCurrent: { borderColor: colors.primary, borderWidth: 2 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planCardName: { fontSize: 17, fontWeight: '800', color: colors.text },
  planTag: { backgroundColor: colors.primaryLight, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  planTagText: { fontSize: 10, fontWeight: '800', color: colors.primaryDark },
  currentTag: { backgroundColor: '#dcfce7', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  currentTagText: { fontSize: 10, fontWeight: '800', color: '#166534' },
  planCardTagline: { fontSize: 13, color: colors.textMute, marginTop: 3 },
  planCardPrice: { fontSize: 20, fontWeight: '800', color: colors.text },
  planCardMo: { fontSize: 12, color: colors.textMute },
  enterprise: { paddingVertical: 14, alignItems: 'center' },
  enterpriseText: { color: colors.primary, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  hint: { fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: 8, lineHeight: 17 },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
});

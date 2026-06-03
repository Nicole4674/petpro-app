import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

export default function SettingsScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState(null);
  const [allowPay, setAllowPay] = useState(true);
  const [savingPay, setSavingPay] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('shop_settings')
        .select('shop_name, address, phone, email, allow_portal_payments')
        .eq('groomer_id', session.user.id)
        .maybeSingle();
      if (error) throw error;
      setShop(data);
      setAllowPay(data ? data.allow_portal_payments !== false : true);
    } catch (e) {
      setErr(e.message || 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }

  async function togglePay(next) {
    setAllowPay(next);
    setSavingPay(true);
    try {
      const { error } = await supabase
        .from('shop_settings')
        .update({ allow_portal_payments: next })
        .eq('groomer_id', session.user.id);
      if (error) throw error;
    } catch (e) {
      setAllowPay(!next);
      setErr(e.message || 'Could not save that setting.');
    } finally {
      setSavingPay(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Ionicons name="settings" size={22} color="#fff" />
          <Text style={styles.title}>Settings</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {err ? <Text style={styles.err}>{err}</Text> : null}

          {/* Shop info */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Shop</Text>
            <View style={styles.line}><Ionicons name="storefront-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{shop?.shop_name || '—'}</Text></View>
            {shop?.phone ? <View style={styles.line}><Ionicons name="call-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{shop.phone}</Text></View> : null}
            {shop?.email ? <View style={styles.line}><Ionicons name="mail-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{shop.email}</Text></View> : null}
            {shop?.address ? <View style={styles.line}><Ionicons name="location-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{shop.address}</Text></View> : null}
          </View>

          {/* Portal payments toggle */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payments</Text>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.toggleLabel}>Let clients pay through the portal</Text>
                <Text style={styles.toggleHint}>When on, clients can pay their balances from their portal with a saved card.</Text>
              </View>
              <Switch
                value={allowPay}
                onValueChange={togglePay}
                disabled={savingPay}
                trackColor={{ true: colors.primary, false: '#d1d5db' }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* Account */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account</Text>
            <View style={styles.line}><Ionicons name="person-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{session?.user?.email}</Text></View>
          </View>

          <Text style={styles.note}>More settings are available on the website.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lineText: { fontSize: 15, color: colors.text, flexShrink: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  toggleHint: { fontSize: 12, color: colors.textMute, marginTop: 3, lineHeight: 17 },
  note: { textAlign: 'center', color: colors.textFaint, fontSize: 13, marginTop: 4 },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
});

import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Switch } from 'react-native';
import { supabase } from '../lib/supabase';

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
    setAllowPay(next); // optimistic
    setSavingPay(true);
    try {
      const { error } = await supabase
        .from('shop_settings')
        .update({ allow_portal_payments: next })
        .eq('groomer_id', session.user.id);
      if (error) throw error;
    } catch (e) {
      setAllowPay(!next); // revert on failure
      setErr(e.message || 'Could not save that setting.');
    } finally {
      setSavingPay(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ More</Text>
        </Pressable>
        <Text style={styles.title}>⚙️ Settings</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {err ? <Text style={styles.err}>{err}</Text> : null}

          {/* Shop info */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Shop</Text>
            <Text style={styles.line}>🏪 {shop?.shop_name || '—'}</Text>
            {shop?.phone ? <Text style={styles.line}>📞 {shop.phone}</Text> : null}
            {shop?.email ? <Text style={styles.line}>✉️ {shop.email}</Text> : null}
            {shop?.address ? <Text style={styles.line}>🏠 {shop.address}</Text> : null}
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
                trackColor={{ true: '#7c3aed', false: '#d1d5db' }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* Account */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account</Text>
            <Text style={styles.line}>{session?.user?.email}</Text>
          </View>

          <Text style={styles.note}>More settings are available on the website.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f5f3ff' },
  header: { backgroundColor: '#5b21b6', paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  line: { fontSize: 15, color: '#1f2937', marginBottom: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  toggleHint: { fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 17 },
  note: { textAlign: 'center', color: '#9ca3af', fontSize: 13, marginTop: 4 },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
});

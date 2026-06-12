import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Switch, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';
import { openWeb, portalSignupLink } from '../lib/webLink';
import { APP_TRIAL_KEY } from '../lib/appConfig';

export default function SettingsScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState(null);
  const [allowPay, setAllowPay] = useState(true);
  const [savingPay, setSavingPay] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markedCount, setMarkedCount] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your PetPro account and shop data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          Alert.alert(
            'Are you absolutely sure?',
            'Your account, clients, pets, appointments and all shop data will be permanently removed.',
            [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Yes, delete everything', style: 'destructive', onPress: deleteAccount },
            ]
          );
        } },
      ]
    );
  }

  async function deleteAccount() {
    setDeleting(true); setErr('');
    try {
      const { error } = await supabase.functions.invoke('delete-groomer-account', {
        body: {},
        headers: { 'x-petpro-app-key': APP_TRIAL_KEY },
      });
      if (error) throw error;
      await supabase.auth.signOut();
    } catch (e) {
      setErr(e.message || 'Could not delete your account. Please try again or email nicole@trypetpro.com.');
      setDeleting(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase.from('shop_settings')
        .select('shop_name, address, phone, email, allow_portal_payments')
        .eq('groomer_id', session.user.id).maybeSingle();
      if (error) throw error;
      setShop(data);
      setAllowPay(data ? data.allow_portal_payments !== false : true);
    } catch (e) { setErr(e.message || 'Could not load settings.'); } finally { setLoading(false); }
  }

  async function togglePay(next) {
    setAllowPay(next); setSavingPay(true);
    try {
      const { error } = await supabase.from('shop_settings').update({ allow_portal_payments: next }).eq('groomer_id', session.user.id);
      if (error) throw error;
    } catch (e) { setAllowPay(!next); setErr(e.message || 'Could not save that setting.'); } finally { setSavingPay(false); }
  }

  function sharePortalLink() {
    const link = portalSignupLink(session.user.id);
    Share.share({ message: `Sign up for ${shop && shop.shop_name ? shop.shop_name : 'our'} client portal: ${link}` });
  }

  function markExisting() {
    Alert.alert(
      'Mark all clients as existing?',
      'Removes the "New Client" badge from everyone already in your system. Anyone added after this is still flagged new. Do this before handing out portal logins.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark all existing',
          onPress: async () => {
            setMarking(true); setMarkedCount(null); setErr('');
            try {
              const { data, error } = await supabase.from('clients')
                .update({ is_first_time: false })
                .eq('groomer_id', session.user.id).eq('is_first_time', true).select('id');
              if (error) throw error;
              setMarkedCount((data || []).length);
            } catch (e) { setErr(e.message || 'Could not update clients.'); } finally { setMarking(false); }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleWrap}><Ionicons name="settings" size={22} color="#fff" /><Text style={styles.title}>Settings</Text></View>
      </GradientHeader>

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

          {/* Client portal signup link */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Client Portal Signup Link</Text>
            <Text style={styles.hint}>Share this with new clients so they create their own portal account linked to you.</Text>
            <Pressable style={styles.shareBtn} onPress={sharePortalLink}>
              <Ionicons name="share-outline" size={16} color="#fff" /><Text style={styles.shareText}>Share signup link</Text>
            </Pressable>
          </View>

          {/* Client migration */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Client Migration</Text>
            <Text style={styles.hint}>Switching from another system? Mark everyone currently in PetPro as existing so they don't show as new. Do this before handing out portal logins.</Text>
            <Pressable style={[styles.migrateBtn, marking && { opacity: 0.6 }]} onPress={markExisting} disabled={marking}>
              {marking ? <ActivityIndicator color="#fff" /> : <Text style={styles.migrateText}>Mark all current clients as existing</Text>}
            </Pressable>
            {markedCount != null ? <Text style={styles.markOk}>✓ Updated {markedCount} client{markedCount === 1 ? '' : 's'}.</Text> : null}
          </View>

          {/* Portal payments toggle */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payments</Text>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.toggleLabel}>Let clients pay through the portal</Text>
                <Text style={styles.toggleHint}>When on, clients can pay balances from their portal with a saved card.</Text>
              </View>
              <Switch value={allowPay} onValueChange={togglePay} disabled={savingPay} trackColor={{ true: colors.primary, false: '#d1d5db' }} thumbColor="#fff" />
            </View>
          </View>

          {/* More settings links */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>More</Text>
            <Pressable style={styles.linkRow} onPress={() => navigation.navigate('ChatSettings')}>
              <Ionicons name="sparkles-outline" size={18} color={colors.primary} /><Text style={styles.linkText}>Chat / Suds settings & reminders</Text><Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
            <Pressable style={styles.linkRow} onPress={() => navigation.navigate('Billing')}>
              <Ionicons name="card-outline" size={18} color={colors.primary} /><Text style={styles.linkText}>Billing & plan</Text><Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          </View>

          {/* Notifications note */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notifications</Text>
            <Text style={styles.hint}>Push notifications (new bookings, messages, flags) arrive when the app launches on the App Store.</Text>
          </View>

          {/* Account */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account</Text>
            <View style={styles.line}><Ionicons name="person-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{session?.user?.email}</Text></View>
          </View>

          {/* Legal */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Legal</Text>
            <Pressable style={styles.linkRow} onPress={() => openWeb('/privacy')}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} /><Text style={styles.linkText}>Privacy Policy</Text><Ionicons name="open-outline" size={18} color={colors.textFaint} />
            </Pressable>
            <Pressable style={styles.linkRow} onPress={() => openWeb('/terms')}>
              <Ionicons name="document-text-outline" size={18} color={colors.primary} /><Text style={styles.linkText}>Terms of Service</Text><Ionicons name="open-outline" size={18} color={colors.textFaint} />
            </Pressable>
          </View>

          {/* Open on web */}
          <Pressable style={styles.webBtn} onPress={() => openWeb('/settings/shop')}>
            <Ionicons name="open-outline" size={16} color={colors.primaryDark} />
            <Text style={styles.webText}>Open full settings on web</Text>
          </Pressable>
          <Text style={styles.note}>The website has more settings (hours, advanced options) than the app.</Text>

          {/* Danger zone — account deletion (Google Play requirement) */}
          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>Delete Account</Text>
            <Text style={styles.dangerHint}>Permanently delete your PetPro account and all shop data. This cannot be undone.</Text>
            <Pressable style={[styles.deleteBtn, deleting && { opacity: 0.6 }]} onPress={confirmDeleteAccount} disabled={deleting}>
              {deleting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="trash-outline" size={16} color="#fff" /><Text style={styles.deleteText}>Delete my account</Text></>}
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 14, ...shadow },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lineText: { fontSize: 15, color: colors.text, flexShrink: 1 },
  hint: { fontSize: 13, color: colors.textMute, lineHeight: 19, marginBottom: 12 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12 },
  shareText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  migrateBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  migrateText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  markOk: { color: colors.green, fontWeight: '700', fontSize: 13, marginTop: 10, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  toggleHint: { fontSize: 12, color: colors.textMute, marginTop: 3, lineHeight: 17 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  linkText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  webBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primaryLight, borderRadius: 12, paddingVertical: 14, marginTop: 4 },
  webText: { color: colors.primaryDark, fontWeight: '800', fontSize: 15 },
  note: { textAlign: 'center', color: colors.textFaint, fontSize: 12, marginTop: 10, lineHeight: 17 },
  dangerCard: { backgroundColor: '#fef2f2', borderRadius: 16, padding: 16, marginTop: 20, borderWidth: 1, borderColor: '#fecaca' },
  dangerTitle: { fontSize: 13, fontWeight: '800', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  dangerHint: { fontSize: 13, color: '#7f1d1d', lineHeight: 19, marginBottom: 12 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 13 },
  deleteText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
});

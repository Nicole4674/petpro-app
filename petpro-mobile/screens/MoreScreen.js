import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';
import { openWeb } from '../lib/webLink';

export default function MoreScreen({ session, onSignOut, navigation }) {
  const items = [
    { label: 'Ask Suds', icon: 'sparkles-outline', screen: 'Suds' },
    { label: 'Analytics', icon: 'bar-chart-outline', screen: 'Analytics' },
    { label: 'Flagged Bookings', icon: 'flag-outline', screen: 'FlaggedBookings' },
    { label: 'Balances', icon: 'cash-outline', screen: 'Balances' },
    { label: 'Waitlist', icon: 'list-outline', screen: 'Waitlist' },
    { label: 'Boarding', icon: 'bed-outline', screen: 'Boarding' },
    { label: 'Retail', icon: 'cart-outline', screen: 'Retail' },
    { label: 'Punch Cards', icon: 'ticket-outline', screen: 'PunchCards' },
    { label: 'Promos', icon: 'gift-outline', screen: 'Promos' },
    { label: 'Service Zones', icon: 'map-outline', screen: 'Zones' },
    { label: 'Staff', icon: 'people-outline', screen: 'Staff' },
    { label: 'Payroll', icon: 'cash-outline', screen: 'Payroll' },
    { label: 'Expenses', icon: 'wallet-outline', screen: 'Expenses' },
    { label: 'Import / Export Clients', icon: 'swap-horizontal-outline', url: '/import' },
    { label: 'Agreements', icon: 'document-text-outline', screen: 'Agreements' },
    { label: 'Chat / Suds Settings', icon: 'sparkles-outline', screen: 'ChatSettings' },
    { label: 'Billing & Plan', icon: 'card-outline', screen: 'Billing' },
    { label: 'Settings', icon: 'settings-outline', screen: 'Settings' },
  ];

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Text style={styles.title}>More</Text>
      </GradientHeader>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {items.map((it) => (
          <Pressable
            key={it.label}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
            onPress={() => (it.url ? openWeb(it.url) : navigation.navigate(it.screen))}
          >
            <View style={styles.iconWrap}><Ionicons name={it.icon} size={20} color={colors.primary} /></View>
            <Text style={styles.itemText}>{it.label}</Text>
            <Ionicons name={it.url ? 'open-outline' : 'chevron-forward'} size={20} color={colors.textFaint} />
          </Pressable>
        ))}

        <View style={styles.account}>
          <Text style={styles.accountLabel}>Signed in as</Text>
          <Text style={styles.accountEmail}>{session?.user?.email}</Text>
          <Pressable style={({ pressed }) => [styles.signout, pressed && { opacity: 0.7 }]} onPress={onSignOut}>
            <Ionicons name="log-out-outline" size={18} color="#dc2626" />
            <Text style={styles.signoutText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 64, paddingBottom: 20, paddingHorizontal: 24 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  body: { padding: 20, paddingBottom: 40 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  iconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  account: { marginTop: 24 },
  accountLabel: { fontSize: 13, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  accountEmail: { fontSize: 16, color: colors.text, fontWeight: '700', marginTop: 4 },
  signout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: colors.border },
  signoutText: { color: '#dc2626', fontWeight: '700', fontSize: 15 },
});

import { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet, Text, View, TextInput, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from './lib/supabase';
import HomeScreen from './screens/HomeScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import ClientsScreen from './screens/ClientsScreen';
import ClientDetailScreen from './screens/ClientDetailScreen';
import AddClientScreen from './screens/AddClientScreen';
import PetDetailScreen from './screens/PetDetailScreen';
import AddPetScreen from './screens/AddPetScreen';
import AppointmentDetailScreen from './screens/AppointmentDetailScreen';
import AddAppointmentScreen from './screens/AddAppointmentScreen';
import MoreScreen from './screens/MoreScreen';
import BoardingScreen from './screens/BoardingScreen';
import StaffScreen from './screens/StaffScreen';
import RetailScreen from './screens/RetailScreen';
import SettingsScreen from './screens/SettingsScreen';
import MessagesScreen from './screens/MessagesScreen';
import ThreadScreen from './screens/ThreadScreen';

const Tab = createBottomTabNavigator();
const HomeStackNav = createNativeStackNavigator();
const ScheduleStackNav = createNativeStackNavigator();
const ClientsStackNav = createNativeStackNavigator();
const MessagesStackNav = createNativeStackNavigator();
const MoreStackNav = createNativeStackNavigator();

// Messages tab: conversation list → tap → texting thread.
function MessagesStack({ session }) {
  return (
    <MessagesStackNav.Navigator screenOptions={{ headerShown: false }}>
      <MessagesStackNav.Screen name="Conversations">
        {(props) => <MessagesScreen {...props} session={session} />}
      </MessagesStackNav.Screen>
      <MessagesStackNav.Screen name="Thread">
        {(props) => <ThreadScreen {...props} session={session} />}
      </MessagesStackNav.Screen>
    </MessagesStackNav.Navigator>
  );
}

// More tab is a stack: menu → Boarding (and future screens).
function MoreStack({ session, onSignOut }) {
  return (
    <MoreStackNav.Navigator screenOptions={{ headerShown: false }}>
      <MoreStackNav.Screen name="MoreMenu">
        {(props) => <MoreScreen {...props} session={session} onSignOut={onSignOut} />}
      </MoreStackNav.Screen>
      <MoreStackNav.Screen name="Boarding">
        {(props) => <BoardingScreen {...props} session={session} />}
      </MoreStackNav.Screen>
      <MoreStackNav.Screen name="Staff">
        {(props) => <StaffScreen {...props} session={session} />}
      </MoreStackNav.Screen>
      <MoreStackNav.Screen name="Retail">
        {(props) => <RetailScreen {...props} session={session} />}
      </MoreStackNav.Screen>
      <MoreStackNav.Screen name="Settings">
        {(props) => <SettingsScreen {...props} session={session} />}
      </MoreStackNav.Screen>
    </MoreStackNav.Navigator>
  );
}

// Home tab is a stack: today's list → tap appointment → appointment detail.
function HomeStack({ session }) {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeMain">
        {(props) => <HomeScreen {...props} session={session} />}
      </HomeStackNav.Screen>
      <HomeStackNav.Screen name="AppointmentDetail">
        {(props) => <AppointmentDetailScreen {...props} session={session} />}
      </HomeStackNav.Screen>
    </HomeStackNav.Navigator>
  );
}

// Schedule tab is a stack: day view → tap appointment → appointment detail.
function ScheduleStack({ session }) {
  return (
    <ScheduleStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ScheduleStackNav.Screen name="ScheduleMain">
        {(props) => <ScheduleScreen {...props} session={session} />}
      </ScheduleStackNav.Screen>
      <ScheduleStackNav.Screen name="AppointmentDetail">
        {(props) => <AppointmentDetailScreen {...props} session={session} />}
      </ScheduleStackNav.Screen>
      <ScheduleStackNav.Screen name="AddAppointment">
        {(props) => <AddAppointmentScreen {...props} session={session} />}
      </ScheduleStackNav.Screen>
    </ScheduleStackNav.Navigator>
  );
}

// Clients tab is a stack: list of clients → tap → client detail.
function ClientsStack({ session }) {
  return (
    <ClientsStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ClientsStackNav.Screen name="ClientsList">
        {(props) => <ClientsScreen {...props} session={session} />}
      </ClientsStackNav.Screen>
      <ClientsStackNav.Screen name="ClientDetail">
        {(props) => <ClientDetailScreen {...props} session={session} />}
      </ClientsStackNav.Screen>
      <ClientsStackNav.Screen name="AddClient">
        {(props) => <AddClientScreen {...props} session={session} />}
      </ClientsStackNav.Screen>
      <ClientsStackNav.Screen name="PetDetail">
        {(props) => <PetDetailScreen {...props} session={session} />}
      </ClientsStackNav.Screen>
      <ClientsStackNav.Screen name="AddPet">
        {(props) => <AddPetScreen {...props} session={session} />}
      </ClientsStackNav.Screen>
      <ClientsStackNav.Screen name="AppointmentDetail">
        {(props) => <AppointmentDetailScreen {...props} session={session} />}
      </ClientsStackNav.Screen>
      <ClientsStackNav.Screen name="AddAppointment">
        {(props) => <AddAppointmentScreen {...props} session={session} />}
      </ClientsStackNav.Screen>
    </ClientsStackNav.Navigator>
  );
}

// Crisp vector tab icons (auto-tints active/inactive via `color`).
function makeTabIcon(active, inactive) {
  return ({ focused, color, size }) => (
    <Ionicons name={focused ? active : inactive} size={size ?? 24} color={color} />
  );
}

// The tab bar. Uses safe-area insets so it floats ABOVE the phone's
// system buttons (back/home/recents) instead of sitting on top of them.
function MainTabs({ session, onSignOut }) {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#7c3aed',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Home" options={{ tabBarIcon: makeTabIcon('home', 'home-outline') }}>
        {() => <HomeStack session={session} />}
      </Tab.Screen>
      <Tab.Screen name="Schedule" options={{ tabBarIcon: makeTabIcon('calendar', 'calendar-outline') }}>
        {() => <ScheduleStack session={session} />}
      </Tab.Screen>
      <Tab.Screen name="Clients" options={{ tabBarIcon: makeTabIcon('paw', 'paw-outline') }}>
        {() => <ClientsStack session={session} />}
      </Tab.Screen>
      <Tab.Screen name="Messages" options={{ tabBarIcon: makeTabIcon('chatbubble', 'chatbubble-outline') }}>
        {() => <MessagesStack session={session} />}
      </Tab.Screen>
      <Tab.Screen name="More" options={{ tabBarIcon: makeTabIcon('ellipsis-horizontal', 'ellipsis-horizontal-outline') }}>
        {() => <MoreStack session={session} onSignOut={onSignOut} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    setError('');
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) setError(error.message);
  }

  async function signOut() { await supabase.auth.signOut(); }

  return (
    <SafeAreaProvider>
      {checking ? (
        <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>
      ) : session ? (
        <NavigationContainer>
          <MainTabs session={session} onSignOut={signOut} />
          <StatusBar style="light" />
        </NavigationContainer>
      ) : (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={styles.logo}>🐾</Text>
          <Text style={styles.title}>PetPro</Text>
          <Text style={styles.tagline}>Sign in to your shop</Text>

          <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#a78bfa"
            autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#a78bfa"
            secureTextEntry value={password} onChangeText={setPassword} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.button, loading && { opacity: 0.6 }]} onPress={signIn} disabled={loading}>
            {loading ? <ActivityIndicator color="#5b21b6" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </Pressable>
          <StatusBar style="light" />
        </KeyboardAvoidingView>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#5b21b6', alignItems: 'center', justifyContent: 'center', padding: 24 },
  center: { flex: 1, backgroundColor: '#5b21b6', alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { fontSize: 56, marginBottom: 4 },
  title: { fontSize: 36, fontWeight: '800', color: '#fff' },
  tagline: { fontSize: 15, color: '#ddd6fe', marginTop: 6, marginBottom: 28, textAlign: 'center' },
  input: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, color: '#1f2937', marginBottom: 12 },
  button: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#5b21b6', fontSize: 16, fontWeight: '800' },
  error: { color: '#fecaca', fontSize: 14, marginBottom: 8, textAlign: 'center' },
});

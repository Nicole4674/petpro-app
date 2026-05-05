import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import AddClient from './pages/AddClient'
import ClientDetail from './pages/ClientDetail'
import AddPet from './pages/AddPet'
import Pricing from './pages/Pricing'
import Agreements from './pages/Agreements'
import Plans from './pages/Plans'
import Calendar from './pages/Calendar'
import FlaggedBookings from './pages/FlaggedBookings'
import VoiceMode from './pages/VoiceMode'
import ImportClients from './pages/ImportClients'
import BoardingSetup from './pages/BoardingSetup'
import Kennels from './pages/Kennels'
import BoardingCalendar from './pages/BoardingCalendar'
import StaffList from './pages/StaffList'
import StaffDetail from './pages/StaffDetail'
import Waitlist from './pages/Waitlist'
import PetDetail from './pages/PetDetail'
import StaffSchedule from './pages/StaffSchedule'
import TimeClock from './pages/TimeClock'
import PayrollDashboard from './pages/PayrollDashboard'
import PayPeriods from './pages/PayPeriods'
import RunPayroll from './pages/RunPayroll'
import PaycheckDetail from './pages/PaycheckDetail'
import TaxSettings from './pages/TaxSettings'
import PayrollReports from './pages/PayrollReports'
import YearEndForms from './pages/YearEndForms'
import ChatSettings from './pages/ChatSettings'
import BookingRules from './pages/BookingRules'
import Messages from './pages/Messages'
import ShopSettings from './pages/ShopSettings'
import Account from './pages/Account'
import Roadmap from './pages/Roadmap'
import Help from './pages/Help'
import ResetPassword from './pages/ResetPassword'
import Balances from './pages/Balances'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import Contact from './pages/Contact'
import ClientSignup from './pages/ClientSignup'
import ClientLogin from './pages/ClientLogin'
import EmailConfirmed from './pages/EmailConfirmed'
import Kiosk from './pages/Kiosk'
import StaffLogin from './pages/StaffLogin'
import StaffMe from './pages/StaffMe'
import Route2 from './pages/Route'  // imported as Route2 to avoid clash with react-router-dom Route
import PetProAI from './pages/PetProAI'
import Expenses from './pages/Expenses'
import Onboarding from './pages/Onboarding'

// ─────────────────────────────────────────────────────────────────
// RootRedirect — smart routing at "/" based on user type.
// Without this, any logged-in user landed on the groomer Dashboard.
// Now: no session → /login. Client → /portal. Staff → /staff/me.
// Groomer (owner) → Dashboard.
// ─────────────────────────────────────────────────────────────────
function RootRedirect({ session }) {
    const [userType, setUserType] = useState(null) // 'client' | 'staff' | 'groomer'
    const [checking, setChecking] = useState(true)
    useEffect(() => {
        if (!session) { setChecking(false); return }
        let cancelled = false
        // Check both clients AND staff_members in parallel; whichever hits wins.
        Promise.all([
            supabase.from('clients').select('id').eq('user_id', session.user.id).maybeSingle(),
            supabase.from('staff_members').select('id, role').eq('auth_user_id', session.user.id).maybeSingle(),
        ]).then(([clientRes, staffRes]) => {
            if (cancelled) return
            if (clientRes.data) setUserType('client')
            else if (staffRes.data) {
                // Owner role still acts as groomer (they own the shop)
                if (staffRes.data.role === 'owner') setUserType('groomer')
                else setUserType('staff')
            }
            else setUserType('groomer')
            setChecking(false)
        })
        return () => { cancelled = true }
    }, [session])

    if (checking) return <div className="loading">Loading PetPro...</div>
    if (!session) return <Navigate to="/login" replace />
    if (userType === 'client') return <Navigate to="/portal" replace />
    if (userType === 'staff') return <Navigate to="/staff/me" replace />
    // Owner / groomer — must have a paid subscription. SubscriptionGate
    // sends them to /plans if their tier is empty.
    return <SubscriptionGate><Dashboard /></SubscriptionGate>
}
import ClientPortalDashboard from './pages/ClientPortalDashboard'
import PortalAgreements from './pages/PortalAgreements'
import ClientPortalMessages from './pages/ClientPortalMessages'
import ClientPortalThread from './pages/ClientPortalThread'
import ClientPortalCards from './pages/ClientPortalCards'
import AIChatWidget from './components/AIChatWidget'
import ClientChatWidget from './components/ClientChatWidget'
import Sidebar from './components/Sidebar'
import SubscriptionGate from './components/SubscriptionGate'
import './App.css'

// Helper — every groomer-side route runs through this. Three checks in order:
//   1. No session → /login
//   2. Has session but no paid subscription_tier → /plans (handled by SubscriptionGate)
//   3. All good → render the page
function gate(session, element) {
    if (!session) return <Navigate to="/login" />
    return <SubscriptionGate>{element}</SubscriptionGate>
}

function AppLayout({ children }) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const location = useLocation()

    // Don't show sidebar on login/signup or public legal pages
    var isAuthPage = location.pathname === '/login' || location.pathname === '/signup'
    var isPublicPage = location.pathname === '/privacy' || location.pathname === '/terms' || location.pathname === '/portal/signup' || location.pathname === '/portal/login' || location.pathname === '/portal/confirmed' || location.pathname === '/plans' || location.pathname === '/kiosk' || location.pathname === '/staff/login' || location.pathname === '/staff/me'
    var isPortalPage = location.pathname.indexOf('/portal') === 0
    if (isAuthPage || isPublicPage) {
        return <>{children}</>
    }
    if (isPortalPage) {
        return (
            <>
                {children}
                <ClientChatWidget />
            </>
        )
    }

    return (
        <div className="app-layout">
            <Sidebar onToggle={function (isCollapsed) { setSidebarCollapsed(isCollapsed) }} />
            <div className={'app-main' + (sidebarCollapsed ? ' app-main-expanded' : '')}>
                {children}
            </div>
            <AIChatWidget />
        </div>
    )
}

function App() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setLoading(false)
            // Smart Nudges — generate proactive AI insights for the groomer.
            // Lazy-imported so client/staff users don't pull the rules code.
            // Only fires for groomer accounts (rule queries naturally return
            // empty for clients since they don't own appointments).
            if (session && session.user) {
                import('./lib/insights').then(function (m) {
                    m.runInsights(session.user.id).catch(function (err) {
                        console.warn('[insights] runner failed:', err)
                    })
                })
            }
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session)
            }
        )

        return () => subscription.unsubscribe()
    }, [])

    if (loading) {
        return <div className="loading">Loading PetPro...</div>
    }

    return (
        <BrowserRouter>
            <AppLayout>
                <Routes>
                    <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
                    <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/plans" element={<Plans />} />
                    <Route path="/portal/signup" element={<ClientSignup />} />
                    <Route path="/portal/login" element={<ClientLogin />} />
                    <Route path="/portal/confirmed" element={<EmailConfirmed />} />
                    <Route path="/portal" element={session ? <ClientPortalDashboard /> : <Navigate to="/portal/login" />} />
                    <Route path="/portal/agreements" element={session ? <PortalAgreements /> : <Navigate to="/portal/login" />} />
                    <Route path="/portal/messages" element={session ? <ClientPortalMessages /> : <Navigate to="/portal/login" />} />
                    <Route path="/portal/messages/:threadId" element={session ? <ClientPortalThread /> : <Navigate to="/portal/login" />} />
                    <Route path="/portal/cards" element={session ? <ClientPortalCards /> : <Navigate to="/portal/login" />} />
                    <Route path="/" element={<RootRedirect session={session} />} />
                    <Route path="/onboarding" element={gate(session, <Onboarding />)} />
                    <Route path="/clients" element={gate(session, <Clients />)} />
                    <Route path="/clients/new" element={gate(session, <AddClient />)} />
                    <Route path="/clients/:id" element={gate(session, <ClientDetail />)} />
                    <Route path="/clients/:clientId/pets/new" element={gate(session, <AddPet />)} />
                    <Route path="/pets/:id" element={gate(session, <PetDetail />)} />
                    <Route path="/pricing" element={gate(session, <Pricing />)} />
                    <Route path="/agreements" element={gate(session, <Agreements />)} />
                    <Route path="/calendar" element={gate(session, <Calendar />)} />
                    {/* Today's Route — mobile groomer feature (Phase 2) */}
                    <Route path="/route" element={gate(session, <Route2 />)} />
                    {/* PetPro AI — full conversational chat with lifted guardrails */}
                    <Route path="/petpro-ai" element={gate(session, <PetProAI />)} />
                    {/* Expenses — track tax-deductible business expenses */}
                    <Route path="/expenses" element={gate(session, <Expenses />)} />
                    <Route path="/flagged" element={gate(session, <FlaggedBookings />)} />
                    <Route path="/voice" element={gate(session, <VoiceMode />)} />
                    <Route path="/import" element={gate(session, <ImportClients />)} />
                    <Route path="/contact" element={gate(session, <Contact />)} />
                    <Route path="/boarding/setup" element={gate(session, <BoardingSetup />)} />
                    <Route path="/boarding/kennels" element={gate(session, <Kennels />)} />
                    <Route path="/boarding/calendar" element={gate(session, <BoardingCalendar />)} />
                    <Route path="/staff" element={gate(session, <StaffList />)} />
                    {/* Lobby Kiosk — leave open on a tablet; staff type PIN to clock in/out */}
                    <Route path="/kiosk" element={session ? <Kiosk /> : <Navigate to="/login" />} />
                    {/* Staff personal portal — email/password login + read-only schedule view */}
                    <Route path="/staff/login" element={<StaffLogin />} />
                    <Route path="/staff/me" element={session ? <StaffMe /> : <Navigate to="/staff/login" />} />
                    <Route path="/staff/:id" element={gate(session, <StaffDetail />)} />
                    <Route path="/waitlist" element={gate(session, <Waitlist />)} />
                    <Route path="/staff/schedule" element={gate(session, <StaffSchedule />)} />
                    <Route path="/staff/timeclock" element={gate(session, <TimeClock />)} />
                    <Route path="/payroll" element={gate(session, <PayrollDashboard />)} />
                    <Route path="/payroll/run" element={gate(session, <RunPayroll />)} />
                    <Route path="/payroll/paycheck/:id" element={gate(session, <PaycheckDetail />)} />
                    <Route path="/payroll/pay-periods" element={gate(session, <PayPeriods />)} />
                    <Route path="/payroll/tax-settings" element={gate(session, <TaxSettings />)} />
                    <Route path="/payroll/reports" element={gate(session, <PayrollReports />)} />
                    <Route path="/payroll/year-end" element={gate(session, <YearEndForms />)} />
                    <Route path="/ai/chat-settings" element={gate(session, <ChatSettings />)} />
                    <Route path="/ai/booking-rules" element={gate(session, <BookingRules />)} />
                    <Route path="/settings/shop" element={gate(session, <ShopSettings />)} />
                    <Route path="/account" element={session ? <Account /> : <Navigate to="/login" />} />
                    <Route path="/roadmap" element={gate(session, <Roadmap />)} />
                    <Route path="/help" element={gate(session, <Help />)} />
                    <Route path="/balances" element={gate(session, <Balances />)} />
                    <Route path="/messages" element={gate(session, <Messages />)} />
                </Routes>
            </AppLayout>
        </BrowserRouter>
    )
}

export default App

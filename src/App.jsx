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
import Balances from './pages/Balances'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import Contact from './pages/Contact'
import ClientSignup from './pages/ClientSignup'
import ClientLogin from './pages/ClientLogin'
import ClientPortalDashboard from './pages/ClientPortalDashboard'
import ClientPortalMessages from './pages/ClientPortalMessages'
import ClientPortalThread from './pages/ClientPortalThread'
import AIChatWidget from './components/AIChatWidget'
import ClientChatWidget from './components/ClientChatWidget'
import Sidebar from './components/Sidebar'
import './App.css'

function AppLayout({ children }) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const location = useLocation()

    // Don't show sidebar on login/signup or public legal pages
    var isAuthPage = location.pathname === '/login' || location.pathname === '/signup'
    var isPublicPage = location.pathname === '/privacy' || location.pathname === '/terms' || location.pathname === '/portal/signup' || location.pathname === '/portal/login'
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
                    <Route path="/portal/signup" element={<ClientSignup />} />
                    <Route path="/portal/login" element={<ClientLogin />} />
                    <Route path="/portal" element={session ? <ClientPortalDashboard /> : <Navigate to="/portal/login" />} />
                    <Route path="/portal/messages" element={session ? <ClientPortalMessages /> : <Navigate to="/portal/login" />} />
                    <Route path="/portal/messages/:threadId" element={session ? <ClientPortalThread /> : <Navigate to="/portal/login" />} />
                    <Route path="/" element={session ? <Dashboard /> : <Navigate to="/login" />} />
                    <Route path="/clients" element={session ? <Clients /> : <Navigate to="/login" />} />
                    <Route path="/clients/new" element={session ? <AddClient /> : <Navigate to="/login" />} />
                    <Route path="/clients/:id" element={session ? <ClientDetail /> : <Navigate to="/login" />} />
                    <Route path="/clients/:clientId/pets/new" element={session ? <AddPet /> : <Navigate to="/login" />} />
                    <Route path="/pets/:id" element={session ? <PetDetail /> : <Navigate to="/login" />} />
                    <Route path="/pricing" element={session ? <Pricing /> : <Navigate to="/login" />} />
                    <Route path="/calendar" element={session ? <Calendar /> : <Navigate to="/login" />} />
                    <Route path="/flagged" element={session ? <FlaggedBookings /> : <Navigate to="/login" />} />
                    <Route path="/voice" element={session ? <VoiceMode /> : <Navigate to="/login" />} />
                    <Route path="/import" element={session ? <ImportClients /> : <Navigate to="/login" />} />
                    <Route path="/contact" element={session ? <Contact /> : <Navigate to="/login" />} />
                    <Route path="/boarding/setup" element={session ? <BoardingSetup /> : <Navigate to="/login" />} />
                    <Route path="/boarding/kennels" element={session ? <Kennels /> : <Navigate to="/login" />} />
                    <Route path="/boarding/calendar" element={session ? <BoardingCalendar /> : <Navigate to="/login" />} />
                    <Route path="/staff" element={session ? <StaffList /> : <Navigate to="/login" />} />
                    <Route path="/staff/:id" element={session ? <StaffDetail /> : <Navigate to="/login" />} />
                    <Route path="/waitlist" element={session ? <Waitlist /> : <Navigate to="/login" />} />
                    <Route path="/staff/schedule" element={session ? <StaffSchedule /> : <Navigate to="/login" />} />
                    <Route path="/staff/timeclock" element={session ? <TimeClock /> : <Navigate to="/login" />} />
                    <Route path="/payroll" element={session ? <PayrollDashboard /> : <Navigate to="/login" />} />
                    <Route path="/payroll/run" element={session ? <RunPayroll /> : <Navigate to="/login" />} />
                    <Route path="/payroll/paycheck/:id" element={session ? <PaycheckDetail /> : <Navigate to="/login" />} />
                    <Route path="/payroll/pay-periods" element={session ? <PayPeriods /> : <Navigate to="/login" />} />
                    <Route path="/payroll/tax-settings" element={session ? <TaxSettings /> : <Navigate to="/login" />} />
                    <Route path="/payroll/reports" element={session ? <PayrollReports /> : <Navigate to="/login" />} />
                    <Route path="/payroll/year-end" element={session ? <YearEndForms /> : <Navigate to="/login" />} />
                    <Route path="/ai/chat-settings" element={session ? <ChatSettings /> : <Navigate to="/login" />} />
                    <Route path="/ai/booking-rules" element={session ? <BookingRules /> : <Navigate to="/login" />} />
                    <Route path="/settings/shop" element={session ? <ShopSettings /> : <Navigate to="/login" />} />
                    <Route path="/balances" element={session ? <Balances /> : <Navigate to="/login" />} />
                    <Route path="/messages" element={session ? <Messages /> : <Navigate to="/login" />} />
                </Routes>
            </AppLayout>
        </BrowserRouter>
    )
}

export default App

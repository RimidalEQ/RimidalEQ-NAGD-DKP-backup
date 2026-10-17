import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { nextAuthGate } from './lib/authGate'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Raids from './pages/Raids'
import RaidDetail from './pages/RaidDetail'
import DKP from './pages/DKP'
import LootSearch from './pages/LootSearch'
import MobLoot from './pages/MobLoot'
import Accounts from './pages/Accounts'
import AccountDetail from './pages/AccountDetail'
import ItemPage from './pages/ItemPage'
import CharacterPage from './pages/CharacterPage'
import LootRecipients from './pages/LootRecipients'
import Officer from './pages/Officer'
import DkpChangelog from './pages/DkpChangelog'
import OfficerClaimCooldowns from './pages/OfficerClaimCooldowns'
import OfficerWhoParser from './pages/OfficerWhoParser'
import OfficerRaiderActivity from './pages/OfficerRaiderActivity'
import DiscordSchedule from './pages/DiscordSchedule'
import Profile from './pages/Profile'
import AuthCallback from './pages/AuthCallback'

function RequireAuth({ session, children }) {
  if (!session) {
    const path = typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''
    const redirect = path ? encodeURIComponent(path) : ''
    return <Navigate to={redirect ? `/login?redirect=${redirect}` : '/login'} replace />
  }
  return children
}

function RedirectPreserve({ to }) {
  const { search, hash } = useLocation()
  return <Navigate to={`${to}${search}${hash}`} replace />
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const location = useLocation()
  const navigate = useNavigate()
  const hasRestoredRef = useRef(false)
  const profileUserIdRef = useRef(null)
  const profileRequestRef = useRef(null)

  // Persist current route so returning to the tab (or reopening the app) keeps you on the same page
  useEffect(() => {
    const path = location.pathname + location.search
    if (path && location.pathname !== '/login' && location.pathname !== '/auth/callback') {
      try {
        sessionStorage.setItem('dkp-last-path', path)
      } catch (_) { /* ignore */ }
    }
  }, [location.pathname, location.search])

  // Restore last page only once when app loads at / (so we don't redirect when user clicks Home)
  useEffect(() => {
    if (loading || !session) return
    if (location.pathname !== '/') return
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true
    try {
      const saved = sessionStorage.getItem('dkp-last-path')
      if (saved && saved.startsWith('/') && saved !== '/' && !saved.startsWith('/login') && !saved.startsWith('/auth/callback')) {
        navigate(saved, { replace: true })
      }
    } catch (_) { /* ignore */ }
  }, [loading, session, location.pathname, navigate])

  useEffect(() => {
    let cancelled = false

    function applyAuth(event, session) {
      if (cancelled) return
      const decision = nextAuthGate({
        event,
        session,
        loadedUserId: profileUserIdRef.current,
        pendingUserId: profileRequestRef.current,
      })
      if (decision.action === 'ignore') return
      if (decision.action === 'sign-out') {
        profileUserIdRef.current = null
        profileRequestRef.current = null
        setSession(null)
        setProfile(null)
        setLoading(false)
        return
      }
      // Hold the loading gate until this user's role is known. Officer pages
      // redirect home when isOfficer is still false. A tab return emits
      // SIGNED_IN for the same user and must not reach this branch.
      profileRequestRef.current = decision.userId
      setSession(session)
      if (profileUserIdRef.current !== decision.userId) setLoading(true)
      const userId = decision.userId
      // The auth client awaits this callback while it holds its session lock.
      // A Supabase query here deadlocks that lock when the tab becomes visible.
      setTimeout(() => {
        if (!cancelled) fetchProfile(userId)
      }, 0)
    }

    supabase.auth.getSession().then(({ data: { session } }) => applyAuth('GET_SESSION', session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      applyAuth(event, session)
    })
    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId) {
    if (profileRequestRef.current && profileRequestRef.current !== userId) return
    profileRequestRef.current = userId
    let failed = false
    try {
      const { data, error } = await supabase.from('profiles').select('role, account_id, unclaim_cooldown_until, display_name, ui_preferences').eq('id', userId).single()
      if (profileRequestRef.current !== userId) return
      if (error) throw error
      setProfile(data)
      profileUserIdRef.current = userId
    } catch {
      failed = true
      // Allow a later auth event to try again. Leaving the request marked
      // in flight would ignore every future SIGNED_IN for this user.
      if (profileRequestRef.current === userId) profileRequestRef.current = null
    } finally {
      if (failed || profileRequestRef.current === userId || profileUserIdRef.current === userId) setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: '2rem', textAlign: 'center' }}>
        Loading…
      </div>
    )
  }

  const isOfficer = profile?.role === 'officer' || profile?.role === 'siteadmin'
  const isSiteAdmin = profile?.role === 'siteadmin'
  const roleLabel = profile?.role === 'siteadmin' ? 'Site Admin' : profile?.role === 'officer' ? 'Officer' : 'Player'

  return (
    <>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/dkp">DKP</Link>
        <Link to="/accounts">Game Accounts</Link>
        <Link to="/raids">Raids</Link>
        <Link to="/mobs">Raid Items</Link>
        <Link to="/loot">Item History</Link>
        <Link to="/loot-recipients">Character History</Link>
        {session ? (
          <>
            <Link to="/profile">My Site Profile</Link>
            {isOfficer && (
              <span className="nav-admin-group">
                <Link to="/officer/RaidAdmin">Raid Admin</Link>
                <Link to="/officer/SiteAdmin">Site Admin</Link>
              </span>
            )}
            <span className="role">{roleLabel}</span>
            <button
              className="btn btn-ghost"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login">Sign in</Link>
        )}
      </nav>
      <Routes>
        <Route path="/login" element={<Login session={session} />} />
        <Route path="/auth/callback" element={<AuthCallback session={session} />} />
        <Route path="/" element={<RequireAuth session={session}><Dashboard isOfficer={isOfficer} profile={profile} /></RequireAuth>} />
        <Route path="/raids" element={<RequireAuth session={session}><Raids isOfficer={isOfficer} /></RequireAuth>} />
        <Route path="/raids/:raidId" element={<RequireAuth session={session}><RaidDetail isOfficer={isOfficer} profile={profile} /></RequireAuth>} />
        <Route path="/dkp" element={<RequireAuth session={session}><DKP isOfficer={isOfficer} profile={profile} /></RequireAuth>} />
        <Route path="/officer" element={<RedirectPreserve to="/officer/RaidAdmin" />} />
        <Route path="/officer/RaidAdmin" element={<RequireAuth session={session}><Officer isOfficer={isOfficer} profile={profile} /></RequireAuth>} />
        <Route path="/officer/dkp-changelog" element={<RequireAuth session={session}><DkpChangelog isOfficer={isOfficer} /></RequireAuth>} />
        <Route path="/officer/who-parser" element={<RequireAuth session={session}><OfficerWhoParser isOfficer={isOfficer} /></RequireAuth>} />
        <Route path="/officer/claim-cooldowns" element={<RedirectPreserve to="/officer/SiteAdmin" />} />
        <Route path="/officer/SiteAdmin" element={<RequireAuth session={session}><OfficerClaimCooldowns isOfficer={isOfficer} isSiteAdmin={isSiteAdmin} profile={profile} /></RequireAuth>} />
        <Route path="/officer/raider-activity" element={<RequireAuth session={session}><OfficerRaiderActivity isOfficer={isOfficer} /></RequireAuth>} />
        <Route path="/tools/discord-schedule" element={<RequireAuth session={session}><DiscordSchedule /></RequireAuth>} />
        <Route path="/loot" element={<RequireAuth session={session}><LootSearch /></RequireAuth>} />
        <Route path="/loot-recipients" element={<RequireAuth session={session}><LootRecipients /></RequireAuth>} />
        <Route path="/mobs" element={<RequireAuth session={session}><MobLoot /></RequireAuth>} />
        <Route path="/accounts" element={<RequireAuth session={session}><Accounts /></RequireAuth>} />
        <Route path="/accounts/:accountId" element={<RequireAuth session={session}><AccountDetail isOfficer={isOfficer} profile={profile} session={session} onProfileUpdate={() => session?.user?.id && fetchProfile(session.user.id)} /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth session={session}><Profile profile={profile} onProfileUpdate={() => session?.user?.id && fetchProfile(session.user.id)} /></RequireAuth>} />
        <Route path="/items/:itemNameEncoded" element={<RequireAuth session={session}><ItemPage isOfficer={isOfficer} /></RequireAuth>} />
        <Route path="/characters/:charKey" element={<RequireAuth session={session}><CharacterPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Analytics />
    </>
  )
}

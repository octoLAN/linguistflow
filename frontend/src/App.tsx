import { useState, useEffect, useRef } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import {
    LayoutDashboard, PenTool, Clock, Users, Sun, Moon, Zap, ChevronRight, Sparkles, Lock
} from 'lucide-react'
import { LinguistFlowAPI } from './lib/api'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Schedule from './pages/Schedule'
import Onboarding from './pages/Onboarding'

const NAV = [
    { to: '/', label: 'Freigabe Center', Icon: LayoutDashboard },
    { to: '/editor', label: 'Editor', Icon: PenTool },
    { to: '/schedule', label: 'Zeitplan', Icon: Clock },
    { to: '/onboarding', label: 'Kunden-Setup', Icon: Users },
]

export type SiteTemplate = 'authority' | 'immersive' | 'datahub' | 'editorial' | 'magazine' | 'minimal'

export interface ConnectedSite {
    id: string
    url: string
    tone: string
    username?: string
    appPassword?: string
    templateId?: SiteTemplate
    designContext?: {
        primaryColor: string
        brandColor: string
        accentColor: string
        keywords: string
        analysisMethod: 'ai' | 'manual'
    }
}

export interface SiteScheduleConfig {
    enabled: boolean
    postsPerWeek: number
    daysInAdvance: number
    selectedSlots: string[]
}

export const DEFAULT_SCHEDULE: SiteScheduleConfig = {
    enabled: true,
    postsPerWeek: 3,
    daysInAdvance: 7,
    selectedSlots: ['09:00', '15:00'],
}

interface AgentStatus {
    is_busy: boolean
    phase: string
    current_topic: string
    drafts_done: number
    drafts_total: number
    site_url: string
    log_steps: string[]
    open_slots: number
    started_at: string | null
    current_step: number
    total_steps: number
}

function load<T>(key: string, fallback: T): T {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback }
    catch { return fallback }
}

// ── AgentBanner ───────────────────────────────────────────────────────────────
function AgentBanner({ status }: { status: AgentStatus | null }) {
    const [visible, setVisible] = useState(false)
    const [smoothPct, setSmoothPct] = useState(0)
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (status?.is_busy) setVisible(true)
        else {
            const t = setTimeout(() => { setVisible(false); setSmoothPct(0) }, 2000)
            return () => clearTimeout(t)
        }
    }, [status?.is_busy])

    const totalSteps = status?.total_steps || 8
    const currentStep = status?.current_step || 0
    const targetPct = currentStep > 0 ? Math.round((currentStep / totalSteps) * 100) : 0

    useEffect(() => {
        if (!status?.is_busy) return
        if (tickRef.current) clearInterval(tickRef.current)
        tickRef.current = setInterval(() => {
            setSmoothPct(prev => {
                if (prev < targetPct) return Math.min(prev + 0.4, targetPct)
                const maxDrift = Math.min(targetPct + 10, 99)
                return prev < maxDrift ? prev + 0.06 : prev
            })
        }, 200)
        return () => { if (tickRef.current) clearInterval(tickRef.current) }
    }, [status?.is_busy, targetPct])

    if (!visible || !status) return null
    const isActive = status.is_busy
    const displayPct = Math.round(smoothPct)

    return (
        <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-[520px] max-w-[calc(100vw-2rem)]
                        rounded-2xl overflow-hidden transition-all duration-400
                        ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}
            style={{
                zIndex: 9999,
                background: '#2563eb',
                boxShadow: '0 8px 32px rgba(37,99,235,0.4)',
                border: '1px solid rgba(255,255,255,0.12)',
            }}
        >
            {/* Shimmer rail */}
            {isActive && (
                <div className="h-0.5 w-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
                    <div className="absolute inset-y-0 w-1/3 animate-shimmer"
                        style={{ background: 'rgba(255,255,255,0.5)', borderRadius: 999 }} />
                </div>
            )}

            <div className="flex items-center gap-3 px-5 pt-4 pb-2">
                <div className="relative flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.15)' }}>
                    <Sparkles style={{ width: 14, height: 14, color: 'white' }} />
                    {isActive && <span className="absolute inset-0 rounded-lg animate-ping"
                        style={{ background: 'rgba(255,255,255,0.2)' }} />}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5"
                        style={{ color: 'rgba(255,255,255,0.55)' }}>
                        KI-Agent · Schritt {currentStep}/{totalSteps}
                    </p>
                    <p className="text-[13px] font-semibold text-white truncate">
                        {status.phase || 'KI generiert Artikel…'}
                    </p>
                </div>

                <p className="text-2xl font-black text-white flex-shrink-0 tabular"
                    style={{ letterSpacing: '-0.04em' }}>
                    {displayPct}%
                </p>
            </div>

            <div className="px-5 pb-4 pt-1">
                <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
                    <div className="h-full rounded-full"
                        style={{ width: `${smoothPct}%`, background: 'rgba(255,255,255,0.9)', transition: 'width 0.2s linear' }} />
                </div>
                {status.log_steps.length > 0 && (
                    <p className="mt-1.5 text-[11px] font-mono truncate"
                        style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {status.log_steps[status.log_steps.length - 1].replace(/^\[\d{2}:\d{2}:\d{2}\] /, '')}
                    </p>
                )}
            </div>
        </div>
    )
}

// ── LockScreen ───────────────────────────────────────────────────────────────
function LockScreen({ onUnlock, isDark }: { onUnlock: () => void, isDark: boolean }) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState(false)
    const [loading, setLoading] = useState(false)

    // Check silently on mount if no password (server config empty)
    useEffect(() => {
        LinguistFlowAPI.verifyAppPassword('').then(valid => {
            if (valid) onUnlock()
        }).catch(() => { })
    }, [onUnlock])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(false)
        try {
            const valid = await LinguistFlowAPI.verifyAppPassword(password)
            if (valid) {
                onUnlock()
            } else {
                setError(true)
                setPassword('')
            }
        } catch {
            setError(true)
        }
        setLoading(false)
    }

    return (
        <div className={`fixed inset-0 z-[10000] flex flex-col items-center justify-center ${isDark ? 'dark bg-[#141414]' : 'bg-[#f7f7f8]'}`}>
            <div className="w-full max-w-sm px-6">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#2563eb' }}>
                        <Lock style={{ width: 24, height: 24, paddingBottom: 2, color: 'white' }} />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: isDark ? '#fff' : '#000' }}>LinguistFlow</h1>
                    <p className="text-sm mt-1" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}>Bitte Passwort eingeben.</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    <input
                        type="password"
                        autoFocus
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="App-Passwort…"
                        className={`w-full h-12 px-4 rounded-xl border outline-none transition-all ${isDark ? 'bg-[#0d0d0d] border-[#333] text-white focus:border-blue-500' : 'bg-white border-gray-200 text-black focus:border-blue-500'}`}
                        style={error ? { borderColor: '#ef4444' } : {}}
                    />
                    <button
                        type="submit"
                        disabled={!password || loading}
                        className="w-full h-12 rounded-xl text-white font-medium flex items-center justify-center transition-all disabled:opacity-50"
                        style={{ background: '#2563eb' }}
                    >
                        {loading ? 'Prüfe...' : 'Entsperren'}
                    </button>
                </form>
            </div>
        </div>
    )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
    const [connectedSites, setConnectedSites] = useState<ConnectedSite[]>(() =>
        load('linguistflow_sites', [])
    )
    const [siteSchedules, setSiteSchedules] = useState<Record<string, SiteScheduleConfig>>(() =>
        load('linguistflow_schedules', {})
    )
    const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)

    const [isDark, setIsDark] = useState<boolean>(() =>
        localStorage.getItem('lf_theme') !== 'light'
    )

    // Auth State
    const [isUnlocked, setIsUnlocked] = useState<boolean>(() =>
        load('lf_unlocked', false)
    )

    useEffect(() => {
        const html = document.documentElement
        isDark ? html.classList.add('dark') : html.classList.remove('dark')
        localStorage.setItem('lf_theme', isDark ? 'dark' : 'light')
    }, [isDark])

    useEffect(() => {
        const es = new EventSource('http://localhost:8000/api/agent/stream')
        es.onmessage = (e) => {
            try { const d = JSON.parse(e.data); if (d && typeof d === 'object') setAgentStatus(d as AgentStatus) }
            catch { }
        }
        es.onerror = () => { }
        return () => es.close()
    }, [])

    useEffect(() => { localStorage.setItem('linguistflow_sites', JSON.stringify(connectedSites)) }, [connectedSites])
    useEffect(() => { localStorage.setItem('linguistflow_schedules', JSON.stringify(siteSchedules)) }, [siteSchedules])

    useEffect(() => {
        connectedSites.forEach(site => {
            const cfg = siteSchedules[site.id]
            if (!cfg) return
            const autoSources = site.designContext?.keywords
                ? [{ source_type: 'keyword', keyword: site.designContext.keywords, is_active: true }]
                : []
            LinguistFlowAPI.pushScheduleConfig({
                site_id: site.id, site_url: site.url, enabled: cfg.enabled,
                postsPerWeek: cfg.postsPerWeek, daysInAdvance: cfg.daysInAdvance,
                selectedSlots: cfg.selectedSlots, sources: autoSources as any,
            }).catch(() => { })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const agentBusy = agentStatus?.is_busy

    if (!isUnlocked) {
        return <LockScreen isDark={isDark} onUnlock={() => {
            setIsUnlocked(true)
            localStorage.setItem('lf_unlocked', 'true') // Persist session
        }} />
    }

    return (
        <div className={`flex min-h-screen ${isDark ? 'dark' : ''}`}
            style={{ background: isDark ? '#141414' : '#f7f7f8' }}>

            {/* ── Sidebar ─────────────────────────────────────────────── */}
            <aside className="w-60 flex-shrink-0 flex flex-col py-6 px-3"
                style={{ background: isDark ? '#0d0d0d' : '#ececee' }}>

                {/* Logo */}
                <div className="flex items-center gap-2.5 px-2 mb-7">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: '#2563eb' }}>
                        <Zap style={{ width: 16, height: 16, color: 'white', fill: 'white' }} />
                    </div>
                    <div>
                        <p className="font-bold text-sm" style={{ letterSpacing: '-0.02em', color: isDark ? '#f0f0f0' : '#0a0a0a' }}>
                            LinguistFlow
                        </p>
                        <p className="text-[10px]" style={{ color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)' }}>
                            KI-Content-Autopilot
                        </p>
                    </div>
                </div>

                {/* Live agent pill */}
                {agentBusy && (
                    <div className="mx-1 mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
                        style={{ background: 'rgba(37,99,235,0.15)' }}>
                        <div className="relative">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            <span className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-60" />
                        </div>
                        <p className="text-[11px] font-semibold" style={{ color: '#2563eb' }}>KI generiert…</p>
                    </div>
                )}

                {/* Nav section label */}
                <p className="text-[9px] font-bold uppercase tracking-widest px-2 mb-1"
                    style={{ color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)' }}>
                    Navigation
                </p>

                {/* Nav items */}
                <nav className="flex flex-col gap-0.5 flex-1">
                    {NAV.map(({ to, label, Icon }) => (
                        <NavLink
                            key={to} to={to} end={to === '/'}
                            className={({ isActive }) => `lf-nav-item ${isActive ? 'active' : ''}`}
                            style={({ isActive }) => ({
                                color: isActive ? '#2563eb' : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)'),
                                background: isActive ? 'rgba(37,99,235,0.1)' : 'transparent',
                                fontWeight: isActive ? 600 : 500,
                            })}
                        >
                            <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
                            <span className="flex-1 text-sm">{label}</span>
                            <ChevronRight style={{ width: 11, height: 11, opacity: 0.25 }} />
                        </NavLink>
                    ))}
                </nav>

                {/* Footer */}
                <div className="px-1 mt-5 space-y-2">
                    {/* Theme toggle */}
                    <button
                        onClick={() => setIsDark(d => !d)}
                        className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl transition-all"
                        style={{ color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)' }}
                    >
                        <div className="relative w-8 h-4 rounded-full flex-shrink-0 transition-colors"
                            style={{ background: isDark ? '#2563eb' : 'rgba(0,0,0,0.15)' }}>
                            <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
                                style={{ transform: isDark ? 'translateX(17px)' : 'translateX(2px)' }} />
                        </div>
                        <span className="text-xs flex-1">{isDark ? 'Dark Mode' : 'Light Mode'}</span>
                        {isDark ? <Moon style={{ width: 12, height: 12 }} /> : <Sun style={{ width: 12, height: 12 }} />}
                    </button>

                    {/* DSGVO */}
                    <div className="flex items-center gap-1.5 px-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                        <p className="text-[9px]" style={{ color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)' }}>
                            DSGVO-konform · EU KI-VO § 52
                        </p>
                    </div>
                </div>
            </aside>

            {/* ── Main content ─────────────────────────────────────────── */}
            <main className="flex-1 overflow-auto" style={{ background: isDark ? '#141414' : '#f7f7f8' }}>
                <div className="max-w-6xl mx-auto px-8 py-10">
                    <Routes>
                        <Route path="/" element={<Dashboard connectedSites={connectedSites} siteSchedules={siteSchedules} />} />
                        <Route path="/editor" element={<Editor />} />
                        <Route path="/schedule" element={<Schedule connectedSites={connectedSites} siteSchedules={siteSchedules} setSiteSchedules={setSiteSchedules} />} />
                        <Route path="/onboarding" element={<Onboarding connectedSites={connectedSites} setConnectedSites={setConnectedSites} />} />
                    </Routes>
                </div>
            </main>

            <AgentBanner status={agentStatus} />
        </div>
    )
}

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Check, ChevronRight, ThumbsUp, Trash2, Info, AlertCircle,
    Brain, Search, PenLine, Sparkles, Eye, Clock, Send, ChevronDown,
    AlertTriangle, Layers, X, ArrowRight, Cpu, Globe2, FileText, Zap,
    Activity, CheckCircle, XCircle,
} from 'lucide-react'
import { LoadingBar } from '../components/LoadingScreen'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { LinguistFlowAPI, Draft } from '../lib/api'
import { ArticlePreviewRender, VisualBuilderShell } from './Editor'
import type { VisualOptions } from '../lib/api'
import type { SiteScheduleConfig, ConnectedSite } from '../App'

import type { Block } from './Editor'


// ── AI Generation Phases ──────────────────────────────────────────────────────
const AI_PHASES = [
    { icon: Brain, label: 'KI analysiert das Thema...', duration: 6000 },
    { icon: Search, label: 'Recherchiert SEO-Keywords...', duration: 8000 },
    { icon: PenLine, label: 'Schreibt den Artikel...', duration: 14000 },
    { icon: Sparkles, label: 'Optimiert Stil & Lesbarkeit...', duration: 99999 },
]

// ── Countdown helper ──────────────────────────────────────────────────────────
function formatCountdown(ms: number): string {
    if (ms <= 0) return 'jetzt'
    const totalMins = Math.round(ms / 60000)
    const totalHours = Math.round(ms / 3600000)
    const days = Math.floor(ms / 86400000)
    const hours = Math.round((ms % 86400000) / 3600000)
    if (days >= 1) return `in ${days}T ${hours}h`
    if (totalHours >= 1) return `in ${totalHours}h`
    return `in ${totalMins} Min.`
}

// Derive next scheduled publish for a draft given postsPerWeek + slots
function getNextPublishMs(draft: Draft, postsPerWeek: number, slots: string[]): number {
    const created = new Date(draft.created_at).getTime()
    const now = Date.now()
    // Article must be available at least 7 days before publishing
    const earliest = created + 7 * 24 * 3600 * 1000
    const interval = (7 / postsPerWeek) * 24 * 3600 * 1000
    // First eligible slot is earliest from now; step forward by interval steps
    let t = Math.max(now, earliest)
    // Snap to next interval boundary & preferred hour
    const slotHours = slots.length > 0
        ? slots.map(s => parseInt(s.split(':')[0]))
        : [9]
    // Round up to next whole-hour slot
    const d = new Date(t)
    d.setMinutes(0, 0, 0)
    const h = slotHours.find(h => h > d.getHours()) ?? slotHours[0]
    if (h <= d.getHours()) d.setDate(d.getDate() + 1)
    d.setHours(h)
    return d.getTime() - now
}

// ── Article Preview Modal ─────────────────────────────────────────────────────
function ArticlePreviewModal({
    draft, onClose, onApprove, onDismiss,
}: {
    draft: Draft; onClose: () => void; onApprove: () => void; onDismiss: () => void
}) {
    const navigate = useNavigate()
    const [saved, setSaved] = useState(false)

    // Seed ghost from persisted ghost_data
    const ghost: Record<string, string> = {
        h1_hero: (draft.ghost_data?.h1_hero as string) || draft.title,
        intro_block: (draft.ghost_data?.intro_block as string) || draft.excerpt,
        ai_text_block: (draft.ghost_data?.ai_text_block as string) || draft.content || '',
        quote_block: (draft.ghost_data?.quote_block as string) || '',
        author_name: (draft.ghost_data?.author_name as string) || '',
        reviewer_name: (draft.ghost_data?.reviewer_name as string) || '',
        hero_image: (draft.ghost_data?.hero_image as string) || 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=800',
    }
    const visualOpts = (draft.visual_opts as VisualOptions) ?? {}

    // "Bearbeiten" → navigate to the full Editor page with draft preloaded
    const handleEdit = () => {
        onClose()
        navigate(`/editor?draft=${draft.id}`, {
            state: {
                draftData: {
                    id: draft.id,
                    ghost_data: ghost,
                    visual_opts: visualOpts,
                    title: draft.title,
                    ai_meta: draft.ai_meta,
                },
            },
        })
    }

    const actionBar = (
        <div className="fixed bottom-0 left-0 right-0 z-[200] lf-card px-8 py-4 flex items-center gap-4">
            <div className="flex items-start gap-2 flex-1 text-sm text-black/40 dark:text-white/40">
                <Info className="w-4 h-4 flex-shrink-0 text-primary mt-0.5" />
                <span>Mit Freigeben wird der Artikel mit Sticky TOC &amp; Animationen auf WordPress veröffentlicht.</span>
            </div>
            <button onClick={() => { onDismiss(); onClose() }} className="flex items-center gap-2 px-5 py-3 rounded-full font-medium text-black/55 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none whitespace-nowrap">
                <Trash2 className="w-4 h-4" /> Verwerfen
            </button>
            <PrimaryButton onClick={() => { onApprove(); onClose() }} icon={<ThumbsUp className="w-5 h-5" />}>
                Freigeben &amp; Veröffentlichen
            </PrimaryButton>
        </div>
    )

    return (
        <>
            <ArticlePreviewRender
                ghost={ghost}
                visualOpts={visualOpts}
                onEditClick={handleEdit}
                showEditButton
                onClose={onClose}
                saved={saved}
            />
            {actionBar}
        </>
    )
}


// ── Warn-Modal for direct publish ────────────────────────────────────────────
function DirectPublishWarn({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
            <div className="bg-white dark:bg-[#1c1c1c] rounded-3xl  p-8 max-w-md w-full" onClick={e => e.stopPropagation()}>
                <div className="w-12 h-12 rounded-3xl bg-amber-500/15 flex items-center justify-center mb-5">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold mb-2">Direkt publizieren — nicht empfohlen</h3>
                <p className="text-sm text-black/55 dark:text-white/40 mb-6 leading-relaxed">
                    Dieser Artikel überspringt den automatischen Zeitplan. Das kann SEO-Signale beeinflussen und Backlink-Muster unnatürlich wirken lassen. Trotzdem fortfahren?
                </p>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="flex-1 py-3 rounded-3xl font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus:outline-none">
                        Abbrechen
                    </button>
                    <button onClick={onConfirm} className="flex-1 py-3 rounded-3xl font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors focus:outline-none">
                        Trotzdem publizieren
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Stack expand drawer ───────────────────────────────────────────────────────
function StackDrawer({ title, color, drafts, onClose, onCardClick }: {
    title: string; color: string; drafts: Draft[]; onClose: () => void
    onCardClick: (d: Draft) => void
}) {
    return (
        <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-[#1c1c1c] rounded-3xl  w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-5">
                    <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                        <h3 className="font-bold text-lg">{title}</h3>
                        <span className="ml-2 text-sm font-bold px-2 py-0.5 rounded-2xl bg-black/5 dark:bg-white/5">{drafts.length}</span>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-3xl flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 p-4 space-y-3">
                    {drafts.length === 0 && (
                        <div className="py-12 text-center text-black/35 dark:text-white/40 text-sm">Keine Artikel in diesem Stapel.</div>
                    )}
                    {drafts.map(d => (
                        <button key={d.id} onClick={() => { onCardClick(d); onClose() }} className="w-full text-left p-4 rounded-3xl bg-black/3 dark:bg-white/3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none">
                            <p className="font-semibold text-sm mb-1 line-clamp-2">{d.title}</p>
                            <p className="text-xs text-black/40 dark:text-white/40 line-clamp-1">{d.excerpt}</p>
                            <p className="text-[10px] text-black/25 dark:text-white/40 mt-2">{new Date(d.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ── Dashboard Props ───────────────────────────────────────────────────────────
interface DashboardProps {
    connectedSites: ConnectedSite[]
    siteSchedules: Record<string, SiteScheduleConfig>
}

const DEF_SCHEDULE: SiteScheduleConfig = { enabled: true, postsPerWeek: 3, daysInAdvance: 7, selectedSlots: ['09:00', '15:00'] }

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard({ connectedSites, siteSchedules }: DashboardProps) {
    const navigate = useNavigate()
    const [allDrafts, setAllDrafts] = useState<Draft[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // ── localStorage-backed Kanban state ────────────────────────────────────
    // Persists across tab switches and page navigations.
    const loadSet = (key: string): Set<string> => {
        try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return new Set() }
    }
    const saveSet = (key: string, s: Set<string>) => {
        try { localStorage.setItem(key, JSON.stringify([...s])) } catch { /* quota */ }
    }

    const [approvedIds, _setApprovedIds] = useState<Set<string>>(() => loadSet('lf_approved'))
    const [publishedIds, _setPublishedIds] = useState<Set<string>>(() => loadSet('lf_published'))
    const [dismissedIds, _setDismissedIds] = useState<Set<string>>(() => loadSet('lf_dismissed'))

    const setApprovedIds = (fn: (prev: Set<string>) => Set<string>) => {
        _setApprovedIds(prev => { const next = fn(prev); saveSet('lf_approved', next); return next })
    }
    const setPublishedIds = (fn: (prev: Set<string>) => Set<string>) => {
        _setPublishedIds(prev => { const next = fn(prev); saveSet('lf_published', next); return next })
    }
    const setDismissedIds = (fn: (prev: Set<string>) => Set<string>) => {
        _setDismissedIds(prev => { const next = fn(prev); saveSet('lf_dismissed', next); return next })
    }

    // Publish status banner (replaces browser alerts)
    const [publishStatus, setPublishStatus] = useState<{ type: 'success' | 'error', msg: string, url?: string } | null>(null)
    const showStatus = (type: 'success' | 'error', msg: string, url?: string) => {
        setPublishStatus({ type, msg, url })
        setTimeout(() => setPublishStatus(null), 7000)
    }

    // Modals
    const [previewDraft, setPreviewDraft] = useState<Draft | null>(null)
    const [warnDraft, setWarnDraft] = useState<Draft | null>(null)  // direct-publish warning
    const [drawerStack, setDrawerStack] = useState<null | 'pending' | 'approved' | 'published'>(null)

    // Draft generation
    const [newTopic, setNewTopic] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [genPhase, setGenPhase] = useState(0)
    const [genProgress, setGenProgress] = useState(0)
    const genTimers = useRef<ReturnType<typeof setTimeout>[]>([])
    const [genMode, setGenMode] = useState<'auto' | 'manual'>('auto')
    const [autoCount, setAutoCount] = useState(1)

    // ── SSE: Live activity log ────────────────────────────────────────────
    const [agentLog, setAgentLog] = useState<string[]>([])
    const [agentPhase, setAgentPhase] = useState('Bereit')
    const [agentBusy, setAgentBusy] = useState(false)

    useEffect(() => {
        const es = new EventSource('http://localhost:8000/api/agent/stream')
        es.onmessage = (e) => {
            try {
                const d = JSON.parse(e.data)
                if (d.phase) setAgentPhase(d.phase)
                if (typeof d.is_running === 'boolean') setAgentBusy(d.is_running)
                if (Array.isArray(d.log_steps)) setAgentLog(d.log_steps.slice(-10).reverse())
            } catch { }
        }
        return () => es.close()
    }, [])

    // Countdown ticker
    const [tick, setTick] = useState(0)
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 30000) // refresh every 30s
        return () => clearInterval(id)
    }, [])

    // Use the first connected site's schedule for countdown calculations (fallback to defaults)
    const firstSiteId = connectedSites[0]?.id
    const siteCfg = (firstSiteId ? siteSchedules[firstSiteId] : undefined) || DEF_SCHEDULE
    const postsPerWeek = siteCfg.postsPerWeek
    const selectedSlots = siteCfg.selectedSlots

    const fetchDrafts = useCallback(async () => {
        try { setAllDrafts(await LinguistFlowAPI.getDrafts()) }
        catch (err: any) { setError(err.message || 'Fehler beim Laden') }
        finally { setLoading(false) }
    }, [])

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchDrafts() }, [])

    // ── Draft filtering (all drafts, no week limit) ───────────────────────────
    // Previously filtered to current week only — removed so no drafts get hidden.
    const pendingDrafts = allDrafts.filter(d => !dismissedIds.has(d.id) && !approvedIds.has(d.id) && !publishedIds.has(d.id))
    const approvedDrafts = allDrafts.filter(d => approvedIds.has(d.id) && !publishedIds.has(d.id))
    const publishedDrafts = allDrafts.filter(d => publishedIds.has(d.id))

    // Reset all persisted Kanban state (e.g. so dismissed content reappears)
    const resetKanban = () => {
        _setDismissedIds(new Set()); localStorage.removeItem('lf_dismissed')
        _setApprovedIds(new Set()); localStorage.removeItem('lf_approved')
        _setPublishedIds(new Set()); localStorage.removeItem('lf_published')
    }


    // ── Actions ───────────────────────────────────────────────────────────────
    const handleApprove = (draft: Draft) => {
        setApprovedIds(s => new Set([...s, draft.id]))
    }

    const handlePublishDirect = (draft: Draft) => {
        setWarnDraft(draft)
    }

    const confirmPublish = async () => {
        if (!warnDraft) return
        const site = connectedSites[0]
        if (!site?.url) {
            setWarnDraft(null)
            showStatus('error', 'Keine WordPress-URL konfiguriert. Bitte zuerst eine Website im Setup verbinden.')
            return
        }
        if (!site?.appPassword) {
            setWarnDraft(null)
            showStatus('error', 'Kein Anwendungspasswort gesetzt. Bitte im Kunden-Setup unter "Verbundene Websites" eintragen.')
            return
        }
        const latestDraft = allDrafts.find(d => d.id === warnDraft.id) || warnDraft
        setWarnDraft(null)
        showStatus('success', 'Artikel wird publiziert …')
        try {
            // Pass editor-edited ghost content + visual opts so WordPress gets the correct version
            const ghostData = latestDraft.ghost_data as Record<string, unknown> | undefined
            const visualOpts = (latestDraft.visual_opts ?? latestDraft.visual_options) as import('../lib/api').VisualOptions | undefined
            const result = await LinguistFlowAPI.approveAndPublish(
                latestDraft.id,
                { url: site.url, username: site.username || 'admin', appPassword: site.appPassword },
                undefined,
                visualOpts,
                ghostData,
            )
            setPublishedIds(s => new Set([...s, latestDraft.id]))
            showStatus('success', 'Artikel erfolgreich publiziert!', result.wp_post_url)
        } catch (err: any) {
            showStatus('error', `Fehler beim Publizieren: ${err.message} — Bitte URL, Benutzername und App-Passwort prüfen.`)
        }
    }


    const handleDraftUpdate = (updated: Draft) => {
        setAllDrafts(q => q.map(d => d.id === updated.id ? updated : d))
        setPreviewDraft(updated)
    }

    // ── Generation ────────────────────────────────────────────────────────────
    const startGenAnimation = () => {
        setGenPhase(0); setGenProgress(0)
        genTimers.current.forEach(clearTimeout); genTimers.current = []
        let elapsed = 0
        const total = AI_PHASES.slice(0, -1).reduce((s, p) => s + p.duration, 0)
        AI_PHASES.slice(0, -1).forEach((phase, idx) => {
            const t = setTimeout(() => { setGenPhase(idx + 1); setGenProgress(Math.round(((elapsed + phase.duration) / total) * 88)) }, elapsed + phase.duration)
            elapsed += phase.duration; genTimers.current.push(t)
        })
        const interval = setInterval(() => setGenProgress(p => Math.min(p + 1, 92)), 600)
        genTimers.current.push(interval as any)
    }
    const stopGenAnimation = () => { genTimers.current.forEach(clearTimeout); genTimers.current = []; setGenProgress(100) }

    const handleAutoGenerate = async () => {
        if (!connectedSites.length) return
        setIsGenerating(true); startGenAnimation()
        try {
            const site = connectedSites[0]
            const autoSources = site.designContext?.keywords
                ? [{ source_type: 'keyword', keyword: site.designContext.keywords, is_active: true }]
                : []
            await LinguistFlowAPI.autoGenerateDrafts(site.url, autoSources as any, autoCount)
            stopGenAnimation(); await fetchDrafts()
        } catch (err: any) { stopGenAnimation(); alert(`Fehler: ${err.message}`) }
        finally { setIsGenerating(false); setTimeout(() => { setGenPhase(0); setGenProgress(0) }, 800) }
    }

    const handleGenerate = async () => {
        if (!newTopic.trim()) return
        if (!connectedSites.length) { alert('Bitte richten Sie zuerst eine Kunden-Website ein.'); return }
        setIsGenerating(true); startGenAnimation()
        try {
            await LinguistFlowAPI.generateDraft(newTopic, connectedSites[0].url || 'default')
            stopGenAnimation(); setNewTopic(''); await fetchDrafts()
        } catch (err: any) { stopGenAnimation(); alert(`Fehler: ${err.message}`) }
        finally { setIsGenerating(false); setTimeout(() => { setGenPhase(0); setGenProgress(0) }, 800) }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    const getDrawerDrafts = () => {
        if (drawerStack === 'pending') return pendingDrafts
        if (drawerStack === 'approved') return approvedDrafts
        if (drawerStack === 'published') return publishedDrafts
        return []
    }

    const getDrawerTitle = () => {
        if (drawerStack === 'pending') return 'Ausstehend'
        if (drawerStack === 'approved') return 'Freigegeben'
        if (drawerStack === 'published') return 'Publiziert'
        return ''
    }

    // ── Render ────────────────────────────────────────────────────────────────
    const activeSites = connectedSites.filter(s => siteSchedules[s.id]?.enabled)
    const nextPublishMs = pendingDrafts.length > 0 ? getNextPublishMs(pendingDrafts[0], postsPerWeek, selectedSlots) : null

    return (
        <>
            {previewDraft && (
                <ArticlePreviewModal
                    draft={previewDraft}
                    onClose={() => setPreviewDraft(null)}
                    onApprove={() => handleApprove(previewDraft)}
                    onDismiss={() => {
                        LinguistFlowAPI.deleteDraft(previewDraft.id).catch(() => { })
                        setDismissedIds(s => new Set([...s, previewDraft.id]))
                    }}
                />
            )}

            {warnDraft && (
                <DirectPublishWarn onConfirm={confirmPublish} onCancel={() => setWarnDraft(null)} />
            )}

            {drawerStack && (
                <StackDrawer
                    title={getDrawerTitle()}
                    color={drawerStack === 'pending' ? 'bg-amber-400' : drawerStack === 'approved' ? 'bg-primary' : 'bg-emerald-400'}
                    drafts={getDrawerDrafts()}
                    onClose={() => setDrawerStack(null)}
                    onCardClick={setPreviewDraft}
                />
            )}

            <div className="pb-24 space-y-8">

                {/* ── Header ──────────────────────────────────────────────── */}
                <header className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight mb-1">Command Center</h1>
                        <p className="text-black/40 dark:text-white/40 text-sm">Übersicht · Aktivität · Freigabe</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate('/schedule')}
                            className="lf-btn-primary"
                        >
                            <Clock className="w-4 h-4" />
                            Zeitplan anpassen
                        </button>

                    </div>
                </header>

                {/* ── Publish Status Banner ───────────────────────────────── */}
                {publishStatus && (
                    <div className={`flex items-start gap-3 px-5 py-4 rounded-2xl text-sm font-medium ${publishStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'
                        }`}>
                        {publishStatus.type === 'success'
                            ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                        <div className="flex-1">
                            <p>{publishStatus.msg}</p>
                            {publishStatus.url && (
                                <a href={publishStatus.url} target="_blank" rel="noreferrer" className="underline mt-1 inline-block opacity-80 hover:opacity-100">{publishStatus.url}</a>
                            )}
                        </div>
                        <button onClick={() => setPublishStatus(null)} className="opacity-50 hover:opacity-100 text-lg">×</button>
                    </div>
                )}


                {/* ── Metric tiles ───────────────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">

                    {/* Total articles */}
                    <div className="lf-metric hover-lift">
                        <div className="lf-metric-label flex items-center gap-1.5">
                            <FileText className="w-3 h-3 text-primary/60" /> Artikel gesamt
                        </div>
                        <div className="lf-metric-value tabular">{allDrafts.length}</div>
                        <div className="lf-metric-sub">
                            <span className="text-warning">{pendingDrafts.length} ausstehend</span>
                            {' · '}
                            <span className="text-success">{publishedDrafts.length} live</span>
                        </div>
                    </div>

                    {/* Active sites */}
                    <div className="lf-metric hover-lift">
                        <div className="lf-metric-label flex items-center gap-1.5">
                            <Globe2 className="w-3 h-3 text-primary/60" /> Aktive Seiten
                        </div>
                        <div className="lf-metric-value tabular">
                            {activeSites.length}
                            <span className="text-xl font-normal text-black/15 dark:text-white/40">/{connectedSites.length}</span>
                        </div>
                        <div className="lf-metric-sub">
                            {connectedSites.length === 0 ? 'Keine Seite verbunden' : `${connectedSites.length - activeSites.length} pausiert`}
                        </div>
                    </div>

                    {/* Next publish */}
                    <div className="lf-metric hover-lift">
                        <div className="lf-metric-label flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-primary/60" /> Nächste Veröffentl.
                        </div>
                        <div className="lf-metric-value tabular text-2xl">
                            {nextPublishMs != null ? formatCountdown(nextPublishMs) : '—'}
                        </div>
                        <div className="lf-metric-sub">{postsPerWeek}× pro Woche geplant</div>
                    </div>

                    {/* Agent status */}
                    <div className={`lf-metric hover-lift ${agentBusy ? 'bg-blue-600/10 dark:bg-blue-600/15' : ''}`}>
                        <div className="lf-metric-label flex items-center gap-1.5">
                            <Cpu className="w-3 h-3 text-primary/60" /> Agent
                        </div>
                        <div className={`text-sm font-bold flex items-center gap-2 mt-1 ${agentBusy ? 'text-primary' : 'text-black/35 dark:text-white/40'}`}>
                            {agentBusy && <span className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />}
                            {agentBusy ? agentPhase : 'Bereit'}
                        </div>
                        <div className="lf-metric-sub">
                            {agentBusy ? 'Läuft gerade…' : 'Wartet auf nächsten Zeitplan'}
                        </div>
                    </div>

                </div>

                {/* ── Kanban Freigabe-Center ──────────────────────────────── */}
                <div>
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="lf-section-title">Freigabe-Center</h2>
                            <p className="lf-section-sub">{allDrafts.length} Artikel · {pendingDrafts.length} warten auf Freigabe</p>
                        </div>
                    </div>
                    {loading ? (
                        <LoadingBar label="KI-Entwürfe werden geladen..." />
                    ) : error ? (
                        <div className="flex flex-col items-center py-20 text-red-500">
                            <AlertCircle className="w-12 h-12 mb-4 opacity-80" />
                            <h3 className="text-xl font-bold mb-2">Backend Connection Error</h3>
                            <p className="max-w-md text-red-500/80 text-center">{error}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-5">
                            <KanbanColumn title="Ausstehend" subtitle="zur Freigabe" dotColor="bg-amber-400" headerColor="text-amber-500" emptyLabel="Keine ausstehenden Artikel" drafts={pendingDrafts} onStackClick={() => setDrawerStack('pending')} renderCard={(draft) => (<PendingCard key={draft.id} draft={draft} postsPerWeek={postsPerWeek} selectedSlots={selectedSlots} onPreview={() => setPreviewDraft(draft)} onApprove={() => handleApprove(draft)} onDismiss={() => {
                                LinguistFlowAPI.deleteDraft(draft.id).catch(() => { })
                                setDismissedIds(s => new Set([...s, draft.id]))
                            }} />)} />
                            <KanbanColumn title="Freigegeben" subtitle="bereit zum Publizieren" dotColor="bg-primary" headerColor="text-primary" emptyLabel="Noch keine freigegebenen Artikel" drafts={approvedDrafts} onStackClick={() => setDrawerStack('approved')} renderCard={(draft) => (<ApprovedCard key={draft.id} draft={draft} postsPerWeek={postsPerWeek} selectedSlots={selectedSlots} onPreview={() => setPreviewDraft(draft)} onPublishNow={() => handlePublishDirect(draft)} />)} />
                            <KanbanColumn title="Publiziert" subtitle="live auf WordPress" dotColor="bg-emerald-400" headerColor="text-emerald-500" emptyLabel="Noch nichts publiziert" drafts={publishedDrafts} onStackClick={() => setDrawerStack('published')} renderCard={(draft) => (<PublishedCard key={draft.id} draft={draft} onPreview={() => setPreviewDraft(draft)} />)} />
                        </div>
                    )}
                </div>

                {/* ── Middle row: Activity Feed + Sites ──────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                    {/* Activity Feed */}
                    <div className="lf-panel p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Activity className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <h2 className="text-sm font-bold">Live-Aktivität</h2>
                        </div>
                        {agentLog.length === 0 ? (
                            <p className="text-xs text-black/20 dark:text-white/40 py-8 text-center">
                                Noch keine Aktivität — Agent wartet auf den nächsten Zeitplan.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {agentLog.map((entry, i) => (
                                    <div key={i} className={`flex gap-3 text-xs ${i === 0 ? 'text-[#0a0a0a] dark:text-[#f0f0f0] font-medium' : 'text-black/30 dark:text-white/40'}`}>
                                        <span className="shrink-0 mt-0.5">{i === 0 ? <span className="text-primary">›</span> : <span className="opacity-30">·</span>}</span>
                                        <span className="leading-relaxed">{entry}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Sites Strip */}
                    <div className="lf-panel p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Globe2 className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <h2 className="text-sm font-bold">Verbundene Seiten</h2>
                        </div>
                        {connectedSites.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-xs text-black/20 dark:text-white/40 mb-3">Noch keine Website verbunden.</p>
                                <button onClick={() => navigate('/onboarding')} className="lf-btn-primary text-xs px-5 py-2">Jetzt verbinden</button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {connectedSites.map(site => {
                                    const cfg = siteSchedules[site.id]
                                    const isActive = cfg?.enabled
                                    const kws = site.designContext?.keywords?.split(',').map(k => k.trim()).filter(Boolean) || []
                                    return (
                                        <div key={site.id} className="rounded-2xl bg-black/3 dark:bg-white/4 p-3.5 flex flex-col gap-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-semibold truncate">{site.url.replace(/^https?:\/\//, '')}</span>
                                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full tabular ${isActive ? 'bg-success/10 text-success' : 'bg-black/5 dark:bg-white/5 text-black/25 dark:text-white/40'
                                                    }`}>
                                                    {isActive ? '● Aktiv' : '○ Pausiert'}
                                                </span>
                                            </div>
                                            {cfg && (
                                                <p className="text-[11px] text-black/30 dark:text-white/40">
                                                    {cfg.postsPerWeek}× / Woche · {cfg.selectedSlots.join(', ')} Uhr
                                                </p>
                                            )}
                                            {kws.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {kws.slice(0, 4).map((k, i) => (
                                                        <span key={i} className="lf-badge lf-badge-blue text-[10px] px-2 py-0.5">{k}</span>
                                                    ))}
                                                    {kws.length > 4 && <span className="text-[10px] text-black/20 dark:text-white/40 self-center">+{kws.length - 4}</span>}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                </div>


            </div>

        </>
    )
}


// ── Column wrapper ────────────────────────────────────────────────────────────
function KanbanColumn({ title, subtitle, dotColor, headerColor, emptyLabel, drafts, onStackClick, renderCard }: {
    title: string; subtitle: string; dotColor: string; headerColor: string
    emptyLabel: string; drafts: Draft[]; onStackClick: () => void
    renderCard: (d: Draft) => React.ReactNode
}) {
    const preview = drafts.slice(0, 2)
    const rest = drafts.length - preview.length

    return (
        <div className="bg-white dark:bg-[#1c1c1c] rounded-[1.75rem] p-5 flex flex-col min-h-[360px]">
            {/* Column header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                    <div>
                        <h2 className={`font-bold text-sm ${headerColor}`}>{title}</h2>
                        <p className="text-[10px] text-black/35 dark:text-white/40 uppercase tracking-widest">{subtitle}</p>
                    </div>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-2xl bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40">
                    {drafts.length}
                </span>
            </div>

            {/* Cards */}
            <div className="flex-1 flex flex-col gap-3">
                {drafts.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-10 text-center rounded-3xl ">
                        <p className="text-xs text-black/25 dark:text-white/40">{emptyLabel}</p>
                    </div>
                ) : (
                    <>
                        {preview.map(d => renderCard(d))}
                        {rest > 0 && (
                            <button
                                onClick={onStackClick}
                                className="flex items-center justify-center gap-2 px-4 py-3 rounded-3xl bg-black/4 dark:bg-white/4 hover:bg-black/8 dark:hover:bg-white/8 text-xs font-semibold text-black/40 dark:text-white/40 transition-colors focus:outline-none"
                            >
                                <Layers className="w-3.5 h-3.5" />
                                +{rest} weitere anzeigen
                            </button>
                        )}
                    </>
                )}
            </div>


        </div>
    )
}

// ── Pending Card ──────────────────────────────────────────────────────────────
function PendingCard({ draft, postsPerWeek, selectedSlots, onPreview, onApprove, onDismiss }: {
    draft: Draft; postsPerWeek: number; selectedSlots: string[]
    onPreview: () => void; onApprove: () => void; onDismiss: () => void
}) {
    const msUntil = getNextPublishMs(draft, postsPerWeek, selectedSlots)
    const countdown = formatCountdown(msUntil)
    const ageMs = Date.now() - new Date(draft.created_at).getTime()
    const tooNew = ageMs < 0  // 7-day rule already baked into getNextPublishMs

    return (
        <div className="bg-white dark:bg-[#1c1c1c] rounded-3xl  p-4 flex flex-col gap-3">
            <p className="font-semibold text-sm line-clamp-2 leading-snug">{draft.title}</p>
            <p className="text-xs text-black/40 dark:text-white/40 line-clamp-2 leading-relaxed">{draft.excerpt}</p>

            {/* Countdown */}
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-500 bg-amber-500/8 px-2.5 py-1.5 rounded-lg">
                <Clock className="w-3 h-3 flex-shrink-0" />
                Auto-Publish {countdown}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
                <button onClick={onDismiss} className="p-1.5 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 text-black/25 dark:text-white/40 hover:text-red-400 transition-colors focus:outline-none">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={onPreview} className="flex items-center gap-1 text-xs font-medium text-black/40 dark:text-white/40 hover:text-primary transition-colors focus:outline-none">
                    <Eye className="w-3.5 h-3.5" /> Vorschau
                </button>
                <button onClick={onApprove} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-3xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors focus:outline-none ">
                    <ThumbsUp className="w-3 h-3" /> Freigeben <ArrowRight className="w-3 h-3" />
                </button>
            </div>
        </div>
    )
}

// ── Approved Card ─────────────────────────────────────────────────────────────
function ApprovedCard({ draft, postsPerWeek, selectedSlots, onPreview, onPublishNow }: {
    draft: Draft; postsPerWeek: number; selectedSlots: string[]
    onPreview: () => void; onPublishNow: () => void
}) {
    const msUntil = getNextPublishMs(draft, postsPerWeek, selectedSlots)
    const countdown = formatCountdown(msUntil)

    return (
        <div className="bg-white dark:bg-[#1c1c1c] rounded-3xl   p-4 flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Freigegeben</span>
            </div>
            <p className="font-semibold text-sm line-clamp-2 leading-snug">{draft.title}</p>

            {/* Countdown */}
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary bg-blue-600/10 px-2.5 py-1.5 rounded-lg">
                <Clock className="w-3 h-3 flex-shrink-0" />
                Auto-Publish {countdown}
            </div>

            <div className="flex items-center gap-2 pt-1">
                <button onClick={onPreview} className="flex items-center gap-1 text-xs font-medium text-black/40 dark:text-white/40 hover:text-primary transition-colors focus:outline-none">
                    <Eye className="w-3.5 h-3.5" /> Vorschau
                </button>
                <button onClick={onPublishNow} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-3xl text-xs font-semibold bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors focus:outline-none">
                    <Send className="w-3 h-3" /> Jetzt publizieren
                </button>
            </div>
        </div>
    )
}

// ── Published Card ────────────────────────────────────────────────────────────
function PublishedCard({ draft, onPreview }: { draft: Draft; onPreview: () => void }) {
    return (
        <div className="bg-white dark:bg-[#1c1c1c] rounded-3xl   p-4 flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Live</span>
            </div>
            <p className="font-semibold text-sm line-clamp-2 leading-snug">{draft.title}</p>
            <div className="flex items-center gap-2 pt-1">
                <button onClick={onPreview} className="flex items-center gap-1 text-xs font-medium text-black/40 dark:text-white/40 hover:text-primary transition-colors focus:outline-none">
                    <Eye className="w-3.5 h-3.5" /> Ansehen
                </button>
                <span className="ml-auto text-[10px] text-black/25 dark:text-white/40">
                    {new Date(draft.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                </span>
            </div>
        </div>
    )
}

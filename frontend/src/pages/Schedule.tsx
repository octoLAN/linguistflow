import { useState, useCallback } from 'react'
import { Clock, Info, ChevronDown, Globe, Zap, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import type { ConnectedSite, SiteScheduleConfig } from '../App'
import { LinguistFlowAPI } from '../lib/api'

const TIME_OPTIONS = [
    '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
    '19:00', '20:00', '21:00',
]

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function stripProtocol(url: string) { return url.replace(/^https?:\/\//, '') }

function buildScheduledDays(postsPerWeek: number, monthYear: { year: number; month: number }): Set<number> {
    const days = new Set<number>()
    const daysInMonth = new Date(monthYear.year, monthYear.month + 1, 0).getDate()
    const interval = 7 / postsPerWeek
    let cursor = 1
    while (cursor <= daysInMonth) {
        days.add(Math.round(cursor))
        cursor += interval
    }
    return days
}

// Default exported from App but imported inline here to avoid circular dep
const DEF: SiteScheduleConfig = {
    enabled: true,
    postsPerWeek: 3,
    daysInAdvance: 7,
    selectedSlots: ['09:00', '15:00'],
}

interface ScheduleProps {
    connectedSites: ConnectedSite[]
    siteSchedules: Record<string, SiteScheduleConfig>
    setSiteSchedules: React.Dispatch<React.SetStateAction<Record<string, SiteScheduleConfig>>>
}

export default function Schedule({ connectedSites, siteSchedules, setSiteSchedules }: ScheduleProps) {
    const [selectedSiteId, setSelectedSiteId] = useState<string>(connectedSites[0]?.id || '__none__')
    const [dropdownOpen, setDropdownOpen] = useState(false)

    const today = new Date()
    const [calMonth, setCalMonth] = useState(today.getMonth())
    const [calYear, setCalYear] = useState(today.getFullYear())


    const cfg: SiteScheduleConfig = siteSchedules[selectedSiteId] || DEF

    const update = useCallback((patch: Partial<SiteScheduleConfig>) => {
        setSiteSchedules(prev => {
            const next = { ...prev, [selectedSiteId]: { ...(prev[selectedSiteId] || DEF), ...patch } }
            const updatedCfg = next[selectedSiteId]
            const site = connectedSites.find(s => s.id === selectedSiteId)
            if (site) {
                const siteId = selectedSiteId
                const siteUrl = site.url
                const autoSources = site.designContext?.keywords
                    ? [{ source_type: 'keyword', keyword: site.designContext.keywords, is_active: true }]
                    : []
                LinguistFlowAPI.pushScheduleConfig({
                    site_id: siteId,
                    site_url: siteUrl,
                    enabled: updatedCfg.enabled,
                    postsPerWeek: updatedCfg.postsPerWeek,
                    daysInAdvance: updatedCfg.daysInAdvance,
                    selectedSlots: updatedCfg.selectedSlots,
                    sources: autoSources as any,
                }).catch(() => { /* silent */ })
            }
            return next
        })
    }, [selectedSiteId, setSiteSchedules, connectedSites])

    const toggleSlot = (slot: string) => {
        const next = cfg.selectedSlots.includes(slot)
            ? cfg.selectedSlots.filter(t => t !== slot)
            : [...cfg.selectedSlots, slot]
        update({ selectedSlots: next })
    }

    // Calendar
    const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay()
    const firstWeekday = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const scheduledDays = buildScheduledDays(cfg.postsPerWeek, { year: calYear, month: calMonth })

    const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }
    const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }

    const selectedSite = connectedSites.find(s => s.id === selectedSiteId)
    const noSites = connectedSites.length === 0

    return (
        <div className="pb-20 relative" onClick={() => setDropdownOpen(false)}>

            {/* Header */}
            <header className="mb-10">
                <h1 className="text-4xl font-extrabold tracking-tight mb-2">Zeitplan &amp; Automatisierung</h1>
                <p className="text-black/55 dark:text-white/40 max-w-xl">
                    Lege die Kadenz fest und plane KI-Entwürfe für jede Kunden-Website separat.
                </p>
            </header>

            {/* Customer Dropdown */}
            <div className="mb-10 relative z-50" onClick={e => e.stopPropagation()}>
                <label className="block text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/40 mb-2">Kunden-Website</label>
                {noSites ? (
                    <div className="flex items-center gap-3 px-5 py-4 rounded-3xl bg-amber-500/8  text-amber-600 dark:text-amber-400 text-sm">
                        <Globe className="w-5 h-5 flex-shrink-0" />
                        Füge zuerst eine Website unter <strong className="ml-1">Kunden-Setup</strong> hinzu.
                    </div>
                ) : (
                    <button
                        onClick={() => setDropdownOpen(o => !o)}
                        className="w-full md:w-96 flex items-center gap-3 px-5 py-4 rounded-3xl bg-white dark:bg-[#1c1c1c]   dark:border-white/5 hover:border-primary/30 transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                        <div className={`w-8 h-8 rounded-3xl flex items-center justify-center flex-shrink-0 ${cfg.enabled ? 'bg-primary/15 text-primary' : 'bg-black/5 dark:bg-white/5 text-black/35'}`}>
                            <Globe className="w-4 h-4" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                            <div className="font-bold text-sm truncate">{selectedSite ? stripProtocol(selectedSite.url) : 'Kunden auswählen…'}</div>
                            <div className="text-xs text-black/40 dark:text-white/40">{cfg.enabled ? `${cfg.postsPerWeek}× / Woche · ${cfg.daysInAdvance} Tage im Voraus` : 'Autopilot pausiert'}</div>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-black/35 dark:text-white/40 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                )}

                {dropdownOpen && !noSites && (
                    <div className="absolute top-full mt-2 left-0 w-full md:w-96 bg-white dark:bg-[#1c1c1c]   dark:border-white/5 rounded-3xl overflow-hidden z-50">
                        {connectedSites.map(site => {
                            const siteCfg = siteSchedules[site.id] || DEF
                            const isActive = site.id === selectedSiteId
                            return (
                                <button key={site.id} onClick={() => { setSelectedSiteId(site.id); setDropdownOpen(false) }}
                                    className={`w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${isActive ? 'bg-primary/5' : ''}`}
                                >
                                    <div className={`w-8 h-8 rounded-3xl flex items-center justify-center flex-shrink-0 ${siteCfg.enabled ? 'bg-primary/15 text-primary' : 'bg-black/5 dark:bg-white/5 text-black/25'}`}>
                                        <Globe className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-bold text-sm truncate ${isActive ? 'text-primary' : ''}`}>{stripProtocol(site.url)}</div>
                                        <div className="text-xs text-black/40 dark:text-white/40">{siteCfg.enabled ? `${siteCfg.postsPerWeek}× / Woche` : 'Pausiert'}</div>
                                    </div>
                                    {isActive && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Main grid */}
            <div className={`grid grid-cols-1 lg:grid-cols-12 gap-8 transition-all duration-300 ${noSites ? 'opacity-30 pointer-events-none' : ''}`}>

                {/* Left: Config */}
                <div className="lg:col-span-7 space-y-5">

                    {/* Autopilot */}
                    <div className="bg-white dark:bg-[#1c1c1c] p-6 rounded-3xl  flex items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1"><Zap className="w-5 h-5 text-primary" /><h2 className="text-lg font-bold">Autopilot</h2></div>
                            <p className="text-sm text-black/55 dark:text-white/40">KI erstellt automatisch Entwürfe im gewählten Rhythmus.</p>
                        </div>
                        <button onClick={() => update({ enabled: !cfg.enabled })}
                            className={`flex-shrink-0 w-14 h-8 rounded-full transition-all duration-300 focus:outline-none relative  ${cfg.enabled ? 'bg-primary' : 'bg-black/10 dark:bg-white/10'}`}
                        >
                            <div className={`absolute left-1 top-1 w-6 h-6 rounded-full bg-white  transition-transform duration-300 ${cfg.enabled ? 'translate-x-6' : ''}`} />
                        </button>
                    </div>

                    <div className={`space-y-5 transition-all duration-400 ${!cfg.enabled ? 'opacity-40 pointer-events-none' : ''}`}>

                        {/* Beiträge pro Woche */}
                        <div className="bg-white dark:bg-[#1c1c1c] p-6 rounded-3xl  flex items-center justify-between gap-4">
                            <div>
                                <h3 className="font-bold mb-1">Beiträge pro Woche</h3>
                                <p className="text-sm text-black/55 dark:text-white/40">Wie oft soll der KI-Agent neue Entwürfe erstellen?</p>
                            </div>
                            <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 px-3 py-2 rounded-3xl">
                                <button onClick={() => update({ postsPerWeek: Math.max(1, cfg.postsPerWeek - 1) })} className="w-9 h-9 rounded-3xl bg-white dark:bg-black/40 font-black text-xl hover:text-primary transition-colors focus:outline-none flex items-center justify-center ">−</button>
                                <span className="text-2xl font-extrabold min-w-[2ch] text-center" style={{ color: 'var(--color-primary)' }}>{cfg.postsPerWeek}</span>
                                <button onClick={() => update({ postsPerWeek: Math.min(14, cfg.postsPerWeek + 1) })} className="w-9 h-9 rounded-3xl bg-white dark:bg-black/40 font-black text-xl hover:text-primary transition-colors focus:outline-none flex items-center justify-center ">+</button>
                            </div>
                        </div>

                        {/* Wann schon entwerfen — daysInAdvance stepper */}
                        <div className="bg-white dark:bg-[#1c1c1c] p-6 rounded-3xl  flex items-center justify-between gap-4">
                            <div>
                                <h3 className="font-bold mb-1">Wann schon entwerfen</h3>
                                <p className="text-sm text-black/55 dark:text-white/40">
                                    Wie viele Tage <em>vor</em> der geplanten Veröffentlichung soll der KI-Entwurf bereit sein?
                                    Minimum: 3 Tage — empfohlen: 7 Tage.
                                </p>
                            </div>
                            <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 px-3 py-2 rounded-3xl flex-shrink-0">
                                <button onClick={() => update({ daysInAdvance: Math.max(3, cfg.daysInAdvance - 1) })} className="w-9 h-9 rounded-3xl bg-white dark:bg-black/40 font-black text-xl hover:text-primary transition-colors focus:outline-none flex items-center justify-center ">−</button>
                                <div className="text-center min-w-[3.5rem]">
                                    <div className="text-2xl font-extrabold" style={{ color: 'var(--color-primary)' }}>{cfg.daysInAdvance}</div>
                                    <div className="text-[10px] text-black/35 dark:text-white/40">Tage</div>
                                </div>
                                <button onClick={() => update({ daysInAdvance: Math.min(30, cfg.daysInAdvance + 1) })} className="w-9 h-9 rounded-3xl bg-white dark:bg-black/40 font-black text-xl hover:text-primary transition-colors focus:outline-none flex items-center justify-center ">+</button>
                            </div>
                        </div>

                        {/* Time slots */}
                        <div className="bg-white dark:bg-[#1c1c1c] p-6 rounded-3xl ">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <h3 className="font-bold mb-0.5">Bevorzugte Zeitfenster</h3>
                                    <p className="text-sm text-black/55 dark:text-white/40">Wähle mehrere Tageszeiten — die KI verteilt Beiträge darauf.</p>
                                </div>
                                {cfg.selectedSlots.length > 0 && (
                                    <span className="text-xs font-bold px-2.5 py-1 rounded-2xl bg-primary/10 text-primary">{cfg.selectedSlots.length} aktiv</span>
                                )}
                            </div>
                            <div className="grid grid-cols-5 gap-2 mb-5">
                                {TIME_OPTIONS.map(t => {
                                    const active = cfg.selectedSlots.includes(t)
                                    return (
                                        <button key={t} onClick={() => toggleSlot(t)}
                                            className={`py-2.5 rounded-3xl text-xs font-bold font-mono tracking-wide transition-all duration-200 focus:outline-none ${active ? 'bg-primary text-white  scale-105' : 'bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/10'}`}
                                        >
                                            {t}
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="flex items-center gap-2 px-4 py-3 bg-blue-600/10 rounded-3xl text-xs font-medium text-primary">
                                <Info className="w-4 h-4 flex-shrink-0" />
                                Zufälliger Jitter (±30 Min) wird für SEO-Plausibilität addiert.
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Calendar */}
                <div className="lg:col-span-5">
                    <div className="bg-white dark:bg-[#1c1c1c] rounded-3xl  p-6 sticky top-8">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2">
                                <CalendarDays className="w-5 h-5 text-primary" />
                                <h3 className="font-bold text-base">{MONTHS_DE[calMonth]} {calYear}</h3>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={prevMonth} className="w-8 h-8 rounded-3xl flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"><ChevronLeft className="w-4 h-4" /></button>
                                <button onClick={nextMonth} className="w-8 h-8 rounded-3xl flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        </div>

                        <div className="grid grid-cols-7 mb-2">
                            {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-black/25 dark:text-white/40 py-1">{d}</div>)}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e${i}`} />)}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1
                                const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()
                                const hasPost = cfg.enabled && scheduledDays.has(day)
                                // Draft-day: daysInAdvance days before publish day
                                const publishDate = new Date(calYear, calMonth, day)
                                const draftDate = new Date(publishDate); draftDate.setDate(publishDate.getDate() - cfg.daysInAdvance)
                                const isDraftDay = cfg.enabled && draftDate.getMonth() === calMonth && draftDate.getFullYear() === calYear && scheduledDays.has(draftDate.getDate() + cfg.daysInAdvance < daysInMonth + 1 ? draftDate.getDate() + cfg.daysInAdvance : -1)
                                return (
                                    <div key={day} className={`aspect-square flex flex-col items-center justify-center rounded-3xl text-xs font-semibold transition-all duration-200 relative
                                        ${isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface-light dark:ring-offset-surface-dark' : ''}
                                        ${hasPost ? 'bg-primary/10 text-primary' : 'text-black/55 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5'}
                                    `}>
                                        {day}
                                        {hasPost && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />}
                                    </div>
                                )
                            })}
                        </div>

                        <div className="mt-5 pt-4  dark:border-white/5 flex items-center gap-5 text-xs text-black/40 dark:text-white/40">
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary/15" />Veröffentlichung</div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded ring-2 ring-primary ring-offset-1 ring-offset-surface-light dark:ring-offset-surface-dark" />Heute</div>
                        </div>

                        {cfg.enabled && (
                            <div className="mt-5 pt-4  dark:border-white/5 space-y-2">
                                <p className="text-xs font-bold uppercase tracking-widest text-black/25 dark:text-white/40 mb-3">Nächste Beiträge</p>
                                {Array.from(scheduledDays).slice(0, 3).map((day, i) => {
                                    const slot = cfg.selectedSlots[i % Math.max(cfg.selectedSlots.length, 1)] || '09:00'
                                    const d = new Date(calYear, calMonth, day)
                                    const draftD = new Date(d); draftD.setDate(d.getDate() - cfg.daysInAdvance)
                                    return (
                                        <div key={day} className="flex items-start gap-3 px-3 py-2.5 rounded-3xl bg-black/3 dark:bg-white/3">
                                            <div className="w-7 h-7 rounded-2xl bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{day}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-semibold">{d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })} · {slot} Uhr</div>
                                                <div className="text-[10px] text-black/35 dark:text-white/40 mt-0.5">
                                                    Entwurf bis: {draftD.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })}
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-2xl bg-black/5 dark:bg-white/5 text-black/35 dark:text-white/40 flex-shrink-0">Entwurf</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {!cfg.enabled && (
                            <div className="mt-5 pt-4  dark:border-white/5 flex flex-col items-center justify-center py-6 text-black/25 dark:text-white/40 text-center">
                                <Clock className="w-10 h-10 stroke-[1] mb-2 opacity-40" />
                                <p className="text-sm font-semibold">Autopilot pausiert</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

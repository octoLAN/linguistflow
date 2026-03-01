import { useState, useEffect, Dispatch, SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Copy, KeyRound, ExternalLink, Globe, LayoutTemplate, User, AlertTriangle, ShieldCheck, Info, Plus, Settings2, Trash2, Code2, Save, BookOpen, PenLine, Zap } from 'lucide-react'
import { LoadingBar } from '../components/LoadingScreen'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { LinguistFlowAPI } from '../lib/api'
import TemplateLibraryModal, { SITE_TEMPLATES } from '../components/ui/TemplateLibraryModal'
import type { ConnectedSite, SiteTemplate } from '../App'

interface OnboardingProps {
    connectedSites: ConnectedSite[]
    setConnectedSites: Dispatch<SetStateAction<ConnectedSite[]>>
}

interface OnboardingFormData {
    siteUrl: string
    tone: string
    username: string
    appPassword: string
    analysisMethod: 'ai' | 'manual'
    primaryColor: string
    brandColor: string
    accentColor: string
    keywords: string
}

// ── KeywordEditor — inline component used inside "Verwalten" ─────────────────
function KeywordEditor({ siteId, keywords, onSave }: { siteId: string; keywords: string; onSave: (kw: string) => void }) {
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState(keywords)
    const tags = keywords.split(',').map(k => k.trim()).filter(Boolean)

    const save = () => { onSave(value); setEditing(false) }

    if (!editing) return (
        <div className="flex flex-wrap items-center gap-2">
            {tags.length > 0
                ? tags.map((t, i) => (
                    <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">{t}</span>
                ))
                : <span className="text-sm text-black/35 dark:text-white/40 italic">Keine Keywords hinterlegt</span>
            }
            <button
                onClick={() => { setValue(keywords); setEditing(true) }}
                className="ml-2 text-xs px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-primary/10 text-black/40 dark:text-white/40 hover:text-primary transition-all font-medium flex items-center gap-1"
            >
                <PenLine className="w-3 h-3" /> Bearbeiten
            </button>
        </div>
    )

    return (
        <div className="space-y-3">
            <p className="text-xs text-black/40 dark:text-white/40">Kommagetrennt — z.B. <code className="font-mono">SEO, Backlinks, Content Marketing</code></p>
            <textarea
                rows={2}
                className="w-full bg-[#f7f7f8] dark:bg-[#141414] border border-primary/20 rounded-2xl px-4 py-3 text-sm text-[#0a0a0a] dark:text-[#f0f0f0] outline-none focus:ring-2 focus:ring-primary resize-none"
                value={value}
                onChange={e => setValue(e.target.value)}
                autoFocus
            />
            <div className="flex gap-2">
                <button onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-ink-light dark:bg-ink-dark text-base-light dark:text-base-dark text-sm font-bold hover:opacity-90 transition-opacity">
                    <Save className="w-3.5 h-3.5" /> Speichern
                </button>
                <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-2xl bg-black/5 dark:bg-white/5 text-sm text-black/40 dark:text-white/40 hover:bg-black/10 transition-colors">
                    Abbrechen
                </button>
            </div>
        </div>
    )
}

export default function Onboarding({ connectedSites, setConnectedSites }: OnboardingProps) {
    const navigate = useNavigate()
    const [view, setView] = useState<'list' | 'setup'>(connectedSites.length > 0 ? 'list' : 'setup')
    const [step, setStep] = useState(() => {
        const saved = localStorage.getItem('onboarding_step')
        return saved ? parseInt(saved, 10) : 1
    })
    const [copied, setCopied] = useState(false)
    const [managingSiteId, setManagingSiteId] = useState<string | null>(null)
    const [editPassword, setEditPassword] = useState('')
    const [isVerifying, setIsVerifying] = useState(false)
    const [verifyError, setVerifyError] = useState<string | null>(null)
    const [templateModalSiteId, setTemplateModalSiteId] = useState<string | null>(null)

    const [isSimulatingAI, setIsSimulatingAI] = useState(false)
    const [aiSimulationText, setAiSimulationText] = useState('')

    // Form State
    const [formData, setFormData] = useState<OnboardingFormData>(() => {
        const saved = localStorage.getItem('onboarding_formData')
        if (saved) {
            try { return JSON.parse(saved) } catch (e) { }
        }
        return {
            siteUrl: '',
            tone: 'professionell',
            username: '',
            appPassword: '',
            analysisMethod: 'manual' as 'ai' | 'manual',
            primaryColor: '#ffffff',
            brandColor: '#007AFF',
            accentColor: '#FF2D55',
            keywords: '',
        }
    })

    // Auto-save form data & step to localStorage so users don't lose progress on reload/tab switch
    useEffect(() => {
        localStorage.setItem('onboarding_formData', JSON.stringify(formData))
    }, [formData])

    useEffect(() => {
        localStorage.setItem('onboarding_step', step.toString())
    }, [step])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleConnect = async () => {
        setIsVerifying(true)
        setVerifyError(null)
        try {
            await LinguistFlowAPI.verifySite(formData.siteUrl, formData.username, formData.appPassword)
            const newSite: ConnectedSite = {
                id: `LF-${Math.floor(Math.random() * 9000) + 1000}-X${Math.floor(Math.random() * 9)}`,
                url: formData.siteUrl,
                tone: formData.tone,
                username: formData.username,
                appPassword: formData.appPassword,
                templateId: 'editorial', //  default template
                designContext: {
                    primaryColor: formData.primaryColor,
                    brandColor: formData.brandColor,
                    accentColor: formData.accentColor,
                    keywords: formData.keywords,
                    analysisMethod: formData.analysisMethod
                }
            }
            setConnectedSites(prev => [...prev, newSite])
            // Clear local storage on success
            localStorage.removeItem('onboarding_formData')
            localStorage.removeItem('onboarding_step')
            // Go to final success screen
            setStep(7)
        } catch (err: any) {
            setVerifyError(err.message || 'Die Verbindung zu WordPress ist fehlgeschlagen. Bitte prüfen Sie URL und Passwort.')
        } finally {
            setIsVerifying(false)
        }
    }

    const runAiSimulation = async () => {
        setStep(4)
        setIsSimulatingAI(true)
        setAiSimulationText('Scraping Meta-Daten & Analysiere CSS...')

        try {
            const result = await LinguistFlowAPI.analyzeSite(formData.siteUrl)
            setAiSimulationText('Daten erfolgreich extrahiert!')
            setFormData(prev => ({
                ...prev,
                primaryColor: result.primaryColor,
                brandColor: result.brandColor,
                accentColor: result.accentColor,
                keywords: result.keywords
            }))
        } catch (error) {
            setAiSimulationText('Analyse fehlgeschlagen. Bitte manuell ergänzen.')
            console.error(error)
        }

        setTimeout(() => {
            setIsSimulatingAI(false)
            setStep(5)
        }, 1500)
    }

    const handleSetTemplate = (siteId: string, templateId: SiteTemplate) => {
        setConnectedSites(sites => sites.map(s => s.id === siteId ? { ...s, templateId } : s))
    }

    const handleAddClientDetails = () => {
        setStep(1)
        setView('setup')
    }

    const handleDeleteSite = (id: string) => {
        setConnectedSites(sites => sites.filter(s => s.id !== id))
        setManagingSiteId(null)
    }

    const handleSavePassword = (id: string) => {
        if (!editPassword.trim()) return

        setConnectedSites(sites => sites.map(s => {
            if (s.id === id) {
                return { ...s, appPassword: editPassword }
            }
            return s
        }))
        setEditPassword('')
        setManagingSiteId(null)
        // Brief success feedback could be added here
        alert('Neues Anwendungspasswort gespeichert!')
    }

    return (
        <div className="pb-20 max-w-4xl mx-auto">
            <header className="mb-12 flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight mb-3">Kunden-Setup & Integration</h1>
                    <p className="text-lg text-black/55 dark:text-white/40">
                        Verbinden Sie die LinguistFlow-Engine in 2 Minuten sicher mit der Website Ihres Kunden.
                    </p>
                </div>
                {view === 'list' && (
                    <div className="flex-shrink-0">
                        <PrimaryButton onClick={handleAddClientDetails} icon={<Plus />} className="whitespace-nowrap">
                            Neue Verbindung
                        </PrimaryButton>
                    </div>
                )}
            </header>

            {/* VIEW: LIST (Only visible if sites are connected and not in setup mode) */}
            {view === 'list' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {connectedSites.map(site => (
                        <div key={site.id} className="bg-white dark:bg-[#1c1c1c] p-8 rounded-3xl  group transition-transform hover:-translate-y-1">
                            {/* Site header row */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="w-14 h-14 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                        <CheckCircle2 className="w-7 h-7 stroke-[2]" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold">{site.url}</h3>
                                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-black/55 dark:text-white/40 font-medium">
                                            <span className="flex items-center gap-1.5"><Globe className="w-4 h-4" /> Verbunden (REST API)</span>
                                            <span className="flex items-center gap-1.5"><Settings2 className="w-4 h-4" /> Stil: {site.tone}</span>
                                            <span className="flex items-center gap-1.5"><LayoutTemplate className="w-4 h-4" />
                                                Layout: <strong className="text-primary">{SITE_TEMPLATES.find(t => t.id === (site.templateId || 'editorial'))?.name || 'Editorial'}</strong>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { if (managingSiteId === site.id) { setManagingSiteId(null) } else { setManagingSiteId(site.id); setEditPassword('') } }}
                                    className="text-black/35 hover:text-[#0a0a0a] dark:text-white/40 dark:hover:text-ink-dark transition-colors font-bold px-6 py-3 rounded-3xl hover:bg-black/5 dark:hover:bg-white/5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                >
                                    {managingSiteId === site.id ? 'Schließen' : 'Verwalten'}
                                </button>
                            </div>

                            {/* Management Expansion Area */}
                            {managingSiteId === site.id && (
                                <div className="mt-8 pt-8  dark:border-white/5 animate-in fade-in slide-in-from-top-2 flex flex-col gap-6">

                                    {/* Edit Password Row */}
                                    <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                                        <div className="flex-1">
                                            <label className="block text-sm font-bold uppercase tracking-wider text-black/55 dark:text-white/40 mb-2">Anwendungspasswort aktualisieren</label>
                                            <div className="flex gap-3">
                                                <div className="relative flex-1">
                                                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/25 dark:text-white/40/50" />
                                                    <input
                                                        type="text"
                                                        value={editPassword}
                                                        onChange={(e) => setEditPassword(e.target.value)}
                                                        placeholder="Neues Passwort (xxxx xxxx xxxx xxxx)"
                                                        className="w-full bg-[#f7f7f8] dark:bg-[#1c1c1c] border-none text-[#0a0a0a] dark:text-[#f0f0f0] font-mono font-medium tracking-widest rounded-3xl pl-12 pr-6 py-3.5 focus:ring-2 focus:ring-primary focus:outline-none "
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => handleSavePassword(site.id)}
                                                    disabled={!editPassword.trim()}
                                                    className="px-6 py-3.5 bg-ink-light dark:bg-ink-dark text-base-light dark:text-base-dark font-bold rounded-3xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    <Save className="w-4 h-4" /> Speichern
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex-1 w-full border-t md:border-t-0 md: dark:border-white/5 md:pl-8 pt-6 md:pt-0">
                                            <label className="block text-sm font-bold uppercase tracking-wider text-black/55 dark:text-white/40 mb-2">Website entfernen</label>
                                            <p className="text-sm text-black/55 dark:text-white/40 mb-3">Trennung der API-Verbindung aufheben.</p>
                                            <button
                                                onClick={() => handleDeleteSite(site.id)}
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-red-500 hover:bg-red-500/10 transition-colors "
                                            >
                                                <Trash2 className="w-4 h-4" /> Verbindung löschen
                                            </button>
                                        </div>
                                    </div>

                                    {/* ── Keywords ── */}
                                    <div className="bg-black/5 dark:bg-[#1c1c1c] p-5 rounded-3xl">
                                        <label className="block text-sm font-bold uppercase tracking-wider text-black/55 dark:text-white/40 mb-3">
                                            Keywords / Themen
                                        </label>
                                        <KeywordEditor
                                            siteId={site.id}
                                            keywords={site.designContext?.keywords || ''}
                                            onSave={(kw) => setConnectedSites(prev =>
                                                prev.map(s => s.id === site.id
                                                    ? { ...s, designContext: { ...s.designContext!, keywords: kw } }
                                                    : s
                                                )
                                            )}
                                        />
                                    </div>

                                    {/* Reshow Embed Code */}
                                    <div className="bg-black/5 dark:bg-[#1c1c1c] p-5 rounded-3xl flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-[#f7f7f8] dark:bg-[#141414] flex items-center justify-center ">
                                                <Code2 className="w-5 h-5 text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold">Einbettungscode (Snippet)</p>
                                                <p className="text-xs text-black/55 dark:text-white/40 font-mono mt-0.5">{'<div id="linguistflow-root"></div>'}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText('<div id="linguistflow-root"></div>\n<script src="https://cdn.linguistflow.com/v1/embed.js"></script>')
                                                setCopied(true)
                                                setTimeout(() => setCopied(false), 2000)
                                            }}
                                            className="px-4 py-2 text-sm font-bold text-[#0a0a0a] dark:text-[#f0f0f0] bg-[#f7f7f8] dark:bg-[#141414] hover: rounded-2xl transition-all  dark:border-white/5 flex items-center gap-2"
                                        >
                                            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                            {copied ? 'Kopiert!' : 'Code kopieren'}
                                        </button>
                                    </div>

                                </div>
                            )}
                        </div>
                    ))}

                    {connectedSites.length === 0 && (
                        <div className="text-center py-20">
                            <div className="w-20 h-20 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Globe className="w-10 h-10 text-black/35 dark:text-white/40" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">Noch keine Kundenseite verbunden</h3>
                            <p className="text-black/55 dark:text-white/40 mb-8 max-w-sm mx-auto">Verbinden Sie Ihre erste Website, um mit LinguistFlow automatisch Inhalte zu veröffentlichen.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Template Library Modal */}
            {templateModalSiteId && (() => {
                const site = connectedSites.find(s => s.id === templateModalSiteId)!
                return (
                    <TemplateLibraryModal
                        currentTemplateId={site?.templateId}
                        onSelect={(id) => handleSetTemplate(templateModalSiteId, id)}
                        onClose={() => setTemplateModalSiteId(null)}
                    />
                )
            })()}

            {/* VIEW: SETUP FLOW */}
            {view === 'setup' && (
                <>
                    {/* Progress Bar (Borderless) */}
                    <div className="flex items-center gap-4 mb-12">
                        {[1, 2, 3, 4, 5, 6].map((s) => (
                            <div key={s} className="flex items-center gap-4 flex-1">
                                <div className={`
              h-2 rounded-full flex-1 transition-all duration-500
              ${step >= s ? 'bg-primary ' : 'bg-black/5 dark:bg-white/5'}
            `} />
                            </div>
                        ))}
                    </div>

                    {/* STEP 1: Basis-Daten (URL) */}
                    {step === 1 && (
                        <div className="bg-white dark:bg-[#1c1c1c] p-10 rounded-4xl  animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="w-12 h-12 rounded-3xl bg-primary/10 text-primary flex items-center justify-center">
                                    <Globe className="w-6 h-6 stroke-[1.5]" />
                                </div>
                                <h2 className="text-2xl font-bold">1. Der Identifikationspunkt</h2>
                            </div>

                            <p className="text-lg text-black/55 dark:text-white/40 mb-6">
                                Bitte geben Sie die URL der bestehenden oder geplanten Website ein. Diese dient als Basis für unsere System-Analyse.
                            </p>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold uppercase tracking-wider text-black/55 dark:text-white/40 mb-2">Website URL</label>
                                    <input
                                        type="url"
                                        name="siteUrl"
                                        value={formData.siteUrl}
                                        onChange={handleChange}
                                        onBlur={(e) => {
                                            let url = e.target.value.trim()
                                            if (url && !/^https?:\/\//i.test(url)) {
                                                url = 'https://' + url
                                                setFormData(prev => ({ ...prev, siteUrl: url }))
                                            }
                                        }}
                                        placeholder="https://mein-kunde.de"
                                        className="w-full bg-black/5 dark:bg-[#1c1c1c] border-none text-[#0a0a0a] dark:text-[#f0f0f0] text-lg font-medium rounded-3xl px-6 py-4 focus:ring-2 focus:ring-primary focus:outline-none  transition-shadow"
                                    />
                                </div>
                            </div>

                            <div className="mt-10 flex justify-end">
                                <PrimaryButton
                                    onClick={() => {
                                        let url = formData.siteUrl.trim()
                                        if (url && !/^https?:\/\//i.test(url)) {
                                            url = 'https://' + url
                                            setFormData(prev => ({ ...prev, siteUrl: url }))
                                        }
                                        setStep(2)
                                    }}
                                    disabled={!formData.siteUrl}
                                    className={!formData.siteUrl ? 'opacity-50 cursor-not-allowed' : ''}
                                    icon={<ChevronRight />}
                                >
                                    Weiter zur Analyse-Wahl
                                </PrimaryButton>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Methodenwahl (KI vs. Manuell) */}
                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                            <div className="flex items-center gap-4 mb-8">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                    <button onClick={() => setStep(1)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-black/40 hover:text-[#0a0a0a]"><ChevronRight className="w-5 h-5 rotate-180" /></button>
                                    2. Die Methodenwahl
                                </h2>
                            </div>

                            <p className="text-lg text-black/55 dark:text-white/40 mb-8 max-w-2xl">
                                Wie möchten Sie das Setup des Design-Kontexts fortsetzen? LinguistFlow kann Ihre Seite automatisch analysieren oder Sie geben die Vorgaben manuell ein.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div
                                    onClick={() => { setFormData(prev => ({ ...prev, analysisMethod: 'ai' })); runAiSimulation() }}
                                    className="cursor-pointer bg-white dark:bg-[#1c1c1c] p-8 rounded-4xl   hover:border-primary/30 transition-all group"
                                >
                                    <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                        <Zap className="w-8 h-8 fill-primary/20 stroke-[1.5]" />
                                    </div>
                                    <h3 className="text-xl font-bold mb-3">Option A: KI-Analyse</h3>
                                    <p className="text-black/55 dark:text-white/40">Das System crawlt die Webseite ({formData.siteUrl}), erkennt das 60-30-10 Branding automatisch und fasst die Inhalte für Keywords zusammen.</p>
                                </div>

                                <div
                                    onClick={() => { setFormData(prev => ({ ...prev, analysisMethod: 'manual' })); setStep(3) }}
                                    className="cursor-pointer bg-white dark:bg-[#1c1c1c] p-8 rounded-4xl   hover:border-ink-light/30 transition-all group"
                                >
                                    <div className="w-16 h-16 rounded-3xl bg-black/5 dark:bg-white/5 text-black/55 dark:text-white/40 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                        <PenLine className="w-8 h-8 stroke-[1.5]" />
                                    </div>
                                    <h3 className="text-xl font-bold mb-3">Option B: Manuelle Eingabe</h3>
                                    <p className="text-black/55 dark:text-white/40">Sie haben die volle Kontrolle und geben Ihre Design-Vorgaben nach dem 60-30-10 Prinzip komplett selbst ein.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Manuelle Dateneingabe */}
                    {step === 3 && (
                        <div className="bg-white dark:bg-[#1c1c1c] p-10 rounded-4xl  animate-in fade-in slide-in-from-right-8 duration-500">
                            <div className="flex items-center gap-4 mb-8">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                    <button onClick={() => setStep(2)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-black/40 hover:text-[#0a0a0a]"><ChevronRight className="w-5 h-5 rotate-180" /></button>
                                    3. Das Design-Herzstück (Manuelle Eingabe)
                                </h2>
                            </div>

                            <div className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl">
                                        <label className="block text-sm font-bold uppercase tracking-wider mb-2">60% Primärfarbe (Neutral)</label>
                                        <p className="text-xs text-black/55 dark:text-white/40 mb-4 h-12">Hintergrundfarbe. Meistens Weiß, helles Grau oder dunkles Schwarz.</p>
                                        <div className="flex items-center gap-3">
                                            <input type="color" name="primaryColor" value={formData.primaryColor || '#ffffff'} onChange={handleChange} className="w-12 h-12 rounded-2xl cursor-pointer" />
                                            <input type="text" name="primaryColor" value={formData.primaryColor || '#ffffff'} onChange={handleChange} className="flex-1 bg-white dark:bg-[#1c1c1c] border-none font-mono text-sm px-4 py-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary" />
                                        </div>
                                    </div>
                                    <div className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl /40">
                                        <label className="block text-sm font-bold uppercase tracking-wider mb-2">30% Sekundärfarbe (Brand)</label>
                                        <p className="text-xs text-black/55 dark:text-white/40 mb-4 h-12">Markenfarbe. Für Überschriften, Menüs, Icons und dekorative Elemente.</p>
                                        <div className="flex items-center gap-3">
                                            <input type="color" name="brandColor" value={formData.brandColor || '#007AFF'} onChange={handleChange} className="w-12 h-12 rounded-2xl cursor-pointer" />
                                            <input type="text" name="brandColor" value={formData.brandColor || '#007AFF'} onChange={handleChange} className="flex-1 bg-white dark:bg-[#1c1c1c] border-none font-mono text-sm px-4 py-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary" />
                                        </div>
                                    </div>
                                    <div className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl ">
                                        <label className="block text-sm font-bold uppercase tracking-wider mb-2">10% Akzentfarbe (Action)</label>
                                        <p className="text-xs text-black/55 dark:text-white/40 mb-4 h-12">Kontrastfarbe. Essenziell für Call-to-Action Buttons (z. B. "Jetzt kaufen").</p>
                                        <div className="flex items-center gap-3">
                                            <input type="color" name="accentColor" value={formData.accentColor || '#FF2D55'} onChange={handleChange} className="w-12 h-12 rounded-2xl cursor-pointer" />
                                            <input type="text" name="accentColor" value={formData.accentColor || '#FF2D55'} onChange={handleChange} className="flex-1 bg-white dark:bg-[#1c1c1c] border-none font-mono text-sm px-4 py-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary" />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold uppercase tracking-wider text-black/55 dark:text-white/40 mb-2">Kurzbeschreibung & Keywords</label>
                                    <p className="text-sm text-black/55 dark:text-white/40 mb-3">Worum geht es auf der Website? (Branche, Produkte, Dienstleistungen). Wird als Basis-Kontext für die Inhaltsgenerierung verwendet.</p>
                                    <textarea
                                        name="keywords"
                                        value={formData.keywords}
                                        onChange={(e) => setFormData(prev => ({ ...prev, keywords: e.target.value }))}
                                        placeholder="z.B. IT-Dienstleistungen, Cloud Computing, Cyber Security, B2B Software..."
                                        rows={4}
                                        className="w-full bg-black/5 dark:bg-[#1c1c1c] border-none text-[#0a0a0a] dark:text-[#f0f0f0] font-medium rounded-3xl px-6 py-4 focus:ring-2 focus:ring-primary focus:outline-none  resize-none"
                                    />
                                </div>
                            </div>

                            <div className="mt-10 flex justify-end">
                                <PrimaryButton onClick={() => setStep(5)} icon={<ChevronRight />}>
                                    Abgleich & Review
                                </PrimaryButton>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: KI-Analyse (Ladebildschirm) */}
                    {step === 4 && (
                        <div className="bg-white dark:bg-[#1c1c1c] p-16 rounded-4xl  text-center animate-in zoom-in-95 duration-500 flex flex-col items-center justify-center min-h-[400px]">
                            <h2 className="text-2xl font-bold mb-10">Der automatisierte Prozess läuft</h2>
                            <LoadingBar label={aiSimulationText} />
                        </div>
                    )}

                    {/* STEP 5: Daten-Abgleich (Review-Phase) */}
                    {step === 5 && (
                        <div className="bg-white dark:bg-[#1c1c1c] p-10 rounded-4xl  animate-in fade-in slide-in-from-right-8 duration-500">
                            <div className="flex items-center gap-4 mb-8">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                    <button onClick={() => setStep(formData.analysisMethod === 'ai' ? 2 : 3)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-black/40 hover:text-[#0a0a0a]"><ChevronRight className="w-5 h-5 rotate-180" /></button>
                                    5. Daten-Abgleich & Review
                                </h2>
                            </div>

                            <p className="text-lg text-black/55 dark:text-white/40 mb-8">
                                Bitte überprüfen Sie die gesammelten Branding-Daten für <strong className="text-[#0a0a0a] dark:text-[#f0f0f0]">{formData.siteUrl}</strong>, bevor wir das Setup finalisieren.
                            </p>

                            <div className="space-y-8 mb-10">
                                <h4 className="font-bold uppercase tracking-wider text-sm text-black/40">Extrahierte Farben (60-30-10)</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl">
                                        <label className="block text-sm font-bold uppercase tracking-wider mb-2">60% Primärfarbe</label>
                                        <div className="flex items-center gap-3 mt-4">
                                            <input type="color" name="primaryColor" value={formData.primaryColor || '#ffffff'} onChange={handleChange} className="w-12 h-12 rounded-2xl cursor-pointer" />
                                            <input type="text" name="primaryColor" value={formData.primaryColor || '#ffffff'} onChange={handleChange} className="flex-1 bg-white dark:bg-[#1c1c1c] border-none font-mono text-sm px-4 py-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary" />
                                        </div>
                                    </div>
                                    <div className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl /40">
                                        <label className="block text-sm font-bold uppercase tracking-wider mb-2">30% Sekundärfarbe</label>
                                        <div className="flex items-center gap-3 mt-4">
                                            <input type="color" name="brandColor" value={formData.brandColor || '#007AFF'} onChange={handleChange} className="w-12 h-12 rounded-2xl cursor-pointer" />
                                            <input type="text" name="brandColor" value={formData.brandColor || '#007AFF'} onChange={handleChange} className="flex-1 bg-white dark:bg-[#1c1c1c] border-none font-mono text-sm px-4 py-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary" />
                                        </div>
                                    </div>
                                    <div className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl ">
                                        <label className="block text-sm font-bold uppercase tracking-wider mb-2">10% Akzentfarbe</label>
                                        <div className="flex items-center gap-3 mt-4">
                                            <input type="color" name="accentColor" value={formData.accentColor || '#FF2D55'} onChange={handleChange} className="w-12 h-12 rounded-2xl cursor-pointer" />
                                            <input type="text" name="accentColor" value={formData.accentColor || '#FF2D55'} onChange={handleChange} className="flex-1 bg-white dark:bg-[#1c1c1c] border-none font-mono text-sm px-4 py-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl">
                                    <h4 className="font-bold uppercase tracking-wider text-sm text-black/40 mb-4">Branchen-Kontext & Keywords / Beschreibung anpassen</h4>
                                    <textarea
                                        name="keywords"
                                        value={formData.keywords}
                                        onChange={(e) => setFormData(prev => ({ ...prev, keywords: e.target.value }))}
                                        rows={4}
                                        placeholder="Beschreiben Sie hier manuell, worum es auf der Seite geht (z.B. Branchen, Zielgruppe), falls die Automatik fehlerhaft war."
                                        className="w-full bg-white dark:bg-[#1c1c1c] border-none text-[#0a0a0a] dark:text-[#f0f0f0] font-medium rounded-3xl px-4 py-3 focus:ring-2 focus:ring-primary focus:outline-none  resize-none"
                                    />
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end gap-4">
                                <PrimaryButton onClick={() => setStep(6)} icon={<ChevronRight />}>
                                    Bestätigen & Weiter
                                </PrimaryButton>
                            </div>
                        </div>
                    )}

                    {/* STEP 6: Finalisierung & System-Übergabe */}
                    {step === 6 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-500">

                            <div className="bg-primary/10  p-6 rounded-r-2xl mb-8 flex gap-4">
                                <KeyRound className="w-8 h-8 text-primary flex-shrink-0" />
                                <div>
                                    <h3 className="text-lg font-bold text-primary mb-1">Sichere Verbindung herstellen</h3>
                                    <p className="text-black/70 dark:text-white/40 leading-relaxed">
                                        Damit die KI Artikel auf dem Blog hinterlegen kann, benötigen wir einen sicheren Zugang (ein sogenanntes Anwendungspasswort).
                                        Folgen Sie dieser einfachen 1-Minuten-Anleitung.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                                {/* Left: The "Dummy-Proof" Instructions */}
                                <div className="space-y-6">
                                    <div className="bg-white dark:bg-[#1c1c1c] p-8 rounded-3xl  relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10" />
                                        <h4 className="font-bold text-xl mb-6">Schritt-für-Schritt Anleitung</h4>

                                        <ol className="space-y-6 list-none p-0 m-0 counter-reset-step">
                                            {[
                                                "Loggen Sie sich in Ihr WordPress-Dashboard ein.",
                                                "Klicken Sie links im Menü auf Benutzer und dann auf Profil.",
                                                "Scrollen Sie ganz nach unten zum Bereich Anwendungspasswörter.",
                                                "Tragen Sie bei 'Name des neuen Anwendungspassworts' einfach LinguistFlow ein und klicken Sie auf Neues Passwort hinzufügen.",
                                                "Kopieren Sie das generierte Passwort (sieht aus wie xxxx xxxx xxxx xxxx) und fügen Sie es rechts ein."
                                            ].map((text, i) => (
                                                <li key={i} className="flex gap-4 items-start relative before:content-[counter(step)] before:counter-increment-step before:flex before:items-center before:justify-center before:w-8 before:h-8 before:rounded-full before:bg-black/5 before:dark:bg-white/5 before:text-black/40 before:dark:text-white/40 before:font-bold before:text-sm before:flex-shrink-0">
                                                    <p className="text-black/70 dark:text-white/40 leading-relaxed pt-1">{text}</p>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>

                                    {/* PERMISSION TRANSPARENCY (MOVED HERE) */}
                                    <div className="bg-black/5 dark:bg-white/5 rounded-3xl p-8 mt-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <ShieldCheck className="w-5 h-5 text-emerald-500" />
                                            <h5 className="font-bold text-sm uppercase tracking-wider text-black/70 dark:text-[#f0f0f0]">Welche Rechte erhält LinguistFlow?</h5>
                                        </div>
                                        <p className="text-sm text-black/65 dark:text-white/40 mb-4 leading-relaxed">
                                            Mit dem Anwendungspasswort erhält unsere Engine ausschließlich Zugriff auf die WordPress-Schnittstelle (REST API), um:
                                        </p>
                                        <ul className="space-y-2 mb-4">
                                            <li className="flex items-center gap-2 text-[15px] text-black/70 dark:text-white/40">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                Neue Blog-Beiträge als Entwurf zu speichern oder zu veröffentlichen.
                                            </li>
                                            <li className="flex items-center gap-2 text-[15px] text-black/70 dark:text-white/40">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                Bilder für diese Beiträge in Ihre Mediathek hochzuladen.
                                            </li>
                                        </ul>
                                        <p className="text-sm text-black/55 dark:text-white/40/80 leading-relaxed  dark:border-white/5 pt-4">
                                            <strong className="text-black/70 dark:text-[#f0f0f0]">Was wir NICHT können:</strong> Wir haben keinen Zugriff auf Ihre Passwörter, Ihre Plugins, Ihre Shop-Daten oder Ihre allgemeinen Website-Einstellungen. Sie können den Zugriff durch Löschen des Anwendungspassworts in WordPress jederzeit mit sofortiger Wirkung kappen.
                                        </p>
                                    </div>
                                </div>

                                {/* Right: The Input Form */}
                                <div className="bg-white dark:bg-[#1c1c1c] p-8 rounded-3xl  flex flex-col justify-start h-fit">
                                    <div className="flex items-center justify-between mb-6">
                                        <h4 className="font-bold text-xl">Zugangsdaten eintragen</h4>
                                        <button
                                            onClick={() => setStep(5)}
                                            className="flex items-center gap-1 text-sm font-bold text-black/40 dark:text-white/40 hover:text-[#0a0a0a] dark:hover:text-ink-dark transition-colors focus:outline-none"
                                        >
                                            <ChevronRight className="w-4 h-4 rotate-180" /> Zurück
                                        </button>
                                    </div>

                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-sm font-bold uppercase tracking-wider text-black/55 dark:text-white/40 mb-2">WordPress Benutzername</label>
                                            <div className="relative">
                                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/25 dark:text-white/40/50" />
                                                <input
                                                    type="text"
                                                    name="username"
                                                    value={formData.username}
                                                    onChange={handleChange}
                                                    placeholder="z.B. admin oder max.muster"
                                                    className="w-full bg-[#f7f7f8] dark:bg-[#1c1c1c] border-none text-[#0a0a0a] dark:text-[#f0f0f0] font-medium rounded-3xl pl-12 pr-6 py-4 focus:ring-2 focus:ring-primary focus:outline-none "
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold uppercase tracking-wider text-black/55 dark:text-white/40 mb-2">Anwendungspasswort</label>
                                            <div className="relative">
                                                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/25 dark:text-white/40/50" />
                                                <input
                                                    type="text"
                                                    name="appPassword"
                                                    value={formData.appPassword}
                                                    onChange={handleChange}
                                                    placeholder="xxxx xxxx xxxx xxxx"
                                                    className="w-full bg-[#f7f7f8] dark:bg-[#1c1c1c] border-none text-[#0a0a0a] dark:text-[#f0f0f0] font-mono font-medium tracking-widest rounded-3xl pl-12 pr-6 py-4 focus:ring-2 focus:ring-primary focus:outline-none "
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECURITY WARNING (NEW STYLING) */}
                                    <div className="mt-8 bg-black dark:bg-[#141414] rounded-3xl p-4 flex gap-3 items-start ring-1 ring-white/10 ">
                                        <div className="mt-0.5 pt-0.5">
                                            <Info className="w-5 h-5 text-primary" />
                                        </div>
                                        <p className="text-[14px] text-white/90 font-medium leading-relaxed">
                                            <span className="font-semibold">Sicherheitshinweis:</span> Bitte geben Sie hier auf keinen Fall Ihr normales Administrator-Passwort ein, mit dem Sie sich in Ihr Dashboard einloggen. Nutzen Sie ausschließlich das generierte Anwendungspasswort.
                                        </p>
                                    </div>

                                    <div className="mt-8 pt-6  dark:border-white/5">
                                        {verifyError && (
                                            <div className="mb-6 p-4 bg-red-500/10  text-red-500 rounded-3xl text-sm font-medium flex items-start gap-3">
                                                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                                <p>{verifyError}</p>
                                            </div>
                                        )}
                                        <PrimaryButton
                                            onClick={handleConnect}
                                            disabled={!formData.username || !formData.appPassword || isVerifying}
                                            className={`w-full ${(!formData.username || !formData.appPassword || isVerifying) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {isVerifying ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    Verbindung wird geprüft...
                                                </span>
                                            ) : (
                                                'Sichere API-Verbindung aktivieren'
                                            )}
                                        </PrimaryButton>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 7: Success & Embed Code */}
                    {step === 7 && (
                        <div className="bg-white dark:bg-[#1c1c1c] p-12 rounded-4xl  text-center animate-in zoom-in-95 duration-500">
                            <div className="w-20 h-20 bg-primary/10 rounded-full mx-auto flex items-center justify-center mb-6">
                                <CheckCircle2 className="w-10 h-10 text-primary stroke-[2]" />
                            </div>
                            <h2 className="text-3xl font-extrabold mb-4">Erfolgreich verbunden!</h2>
                            <p className="text-lg text-black/55 dark:text-white/40 max-w-xl mx-auto mb-10">
                                Die KI hat Zugriff auf die WordPress-Mediathek und kann nun fertige Artikel als Entwürfe ablegen. Der letzte Schritt ist die Integration des Blogs auf der Website.
                            </p>

                            <div className="bg-[#f7f7f8] dark:bg-[#1c1c1c] rounded-3xl p-8 text-left max-w-2xl mx-auto   dark:ring-white/5">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-bold uppercase tracking-wider text-black/40 dark:text-white/40">Injektions-Code (Shadow DOM)</span>
                                    <button
                                        onClick={() => copyToClipboard('<div id="linguistflow-root" data-widget-id="LF-8492-X1"></div>\n<script src="https://cdn.linguistflow.com/widget.js" async></script>')}
                                        className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-hover transition-colors focus:outline-none bg-primary/10 px-4 py-2 rounded-lg"
                                    >
                                        {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        {copied ? 'Kopiert!' : 'Kopieren'}
                                    </button>
                                </div>

                                <pre className="text-sm text-black/70 dark:text-white/40 font-mono overflow-x-auto p-4 bg-black/5 dark:bg-white/5 rounded-3xl border-l-2 border-primary">
                                    <span className="text-primary">&lt;div</span> <span className="text-pink-500">id=</span><span className="text-green-500">"linguistflow-root"</span> <span className="text-pink-500">data-widget-id=</span><span className="text-green-500">"LF-8492-X1"</span><span className="text-primary">&gt;</span><span className="text-primary">&lt;/div&gt;</span>
                                    <br />
                                    <span className="text-primary">&lt;script</span> <span className="text-pink-500">src=</span><span className="text-green-500">"https://cdn.linguistflow.com/widget.js"</span> <span className="text-pink-500">async</span><span className="text-primary">&gt;</span><span className="text-primary">&lt;/script&gt;</span>
                                </pre>
                                <p className="text-sm text-black/40 dark:text-white/40 mt-4 flex items-center gap-2">
                                    <LayoutTemplate className="w-4 h-4" />
                                    Fügen Sie diesen Code an der Stelle auf der Website ein, wo der Blog erscheinen soll.
                                </p>
                            </div>

                            <div className="mt-12 flex justify-center gap-4">
                                <button onClick={() => setView('list')} className="px-6 py-4 font-bold text-black/40 dark:text-white/40 hover:text-[#0a0a0a] dark:hover:text-ink-dark transition-colors focus:outline-none">
                                    Zurück zur Übersicht
                                </button>
                                <PrimaryButton onClick={handleAddClientDetails} icon={<Plus />}>
                                    Weitere Website hinzufügen
                                </PrimaryButton>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

import { useState } from 'react'
import { X, Check } from 'lucide-react'
import type { SiteTemplate } from '../../App'

export interface TemplateDefinition {
    id: SiteTemplate
    name: string
    tagline: string
    inspiration: string
    description: string
    accentClass: string
}

export const SITE_TEMPLATES: TemplateDefinition[] = [
    {
        id: 'authority',
        name: 'The Authority',
        tagline: 'Minimalist · High-Contrast · 60-30-10',
        inspiration: 'Schema 1 — Maximale Lesbarkeit',
        description: 'Sticky TOC links, Progress Bar, Inter Variable Font, Micro-Interactions. Perfekt für SEO-Autoritäts-Artikel mit hohem E-E-A-T-Anspruch.',
        accentClass: 'from-blue-500/30 to-blue-500/5',
    },
    {
        id: 'immersive',
        name: 'The Immersive',
        tagline: 'Scrollytelling · Parallax · Dark-Mode',
        inspiration: 'Schema 2 — Dynamische Einblendungen',
        description: 'Intersection Observer Fade-in, Parallax-Sektionen, responsive Card-Grid für Key Points. Ideal für Story-Driven Content mit hohem Engagement.',
        accentClass: 'from-violet-500/30 to-fuchsia-500/5',
    },
    {
        id: 'datahub',
        name: 'The Data Hub',
        tagline: 'Strukturiert · Tabellen · Info-Boxen',
        inspiration: 'Schema 3 — Scientific & Structured',
        description: 'Info-Boxen für Quick-Summaries, optimiertes Tabellendesign (CLS-sicher), Auto-Autor-Notiz. Perfekt für Research, Vergleiche und datengetriebene Artikel.',
        accentClass: 'from-cyan-500/30 to-teal-500/5',
    },
    {
        id: 'editorial',
        name: 'Editorial',
        tagline: 'Bold · Full-Width · Impact',
        inspiration: 'Inspiriert von The Verge',
        description: 'Großes Hero-Bild, fette Überschrift mit Akzentfarbe, Single-Column-Text mit Pull-Quotes. Perfekt für Tech & Lifestyle.',
        accentClass: 'from-rose-500/30 to-orange-500/10',
    },
    {
        id: 'magazine',
        name: 'Magazine',
        tagline: 'Zwei Spalten · Sidebar TOC · Dichte',
        inspiration: 'Inspiriert von Smashing Magazine',
        description: 'Content-Spalte mit Sticky-Sidebar. Kompakte Typografie, klare Hierarchie. Ideal für lange How-To Artikel.',
        accentClass: 'from-primary/30 to-primary/5',
    },
    {
        id: 'minimal',
        name: 'Minimal',
        tagline: 'Zentriert · Viel Luft · Fokus',
        inspiration: 'Inspiriert von Medium',
        description: 'Schmale zentrierte Spalte, maximaler Weißraum. Der Inhalt steht im Mittelpunkt — keine Ablenkungen.',
        accentClass: 'from-slate-500/20 to-slate-500/5',
    },
]

// ── Schematic Layout Thumbnails ──────────────────────────────────────────────

function AuthorityThumbnail() {
    return (
        <div className="w-full h-40 bg-white dark:bg-[#111] rounded-2xl overflow-hidden flex flex-col p-3 select-none border border-black/5 dark:border-white/5">
            {/* Progress bar */}
            <div className="w-2/3 h-1 rounded bg-blue-500 mb-2" />
            {/* Two col */}
            <div className="flex gap-2 flex-1">
                {/* Sticky TOC */}
                <div className="w-1/4 flex-shrink-0 flex flex-col gap-1 pt-1">
                    {[1, 0.8, 0.8, 0.6].map((w, i) => (
                        <div key={i} className={`h-1 rounded ${i === 0 ? 'bg-blue-500/70' : 'bg-black/10 dark:bg-white/10'}`} style={{ width: `${w * 100}%` }} />
                    ))}
                </div>
                {/* Content */}
                <div className="flex-1 flex flex-col gap-1 pt-1">
                    <div className="w-full h-3 rounded bg-black/20 dark:bg-white/20 mb-1" />
                    {/* Key Takeaways */}
                    <div className="border-l-2 border-blue-500 pl-2 py-1 bg-blue-500/5 rounded-r">
                        <div className="w-full h-1 rounded bg-black/10 dark:bg-white/10 mb-0.5" />
                        <div className="w-3/4 h-1 rounded bg-black/10 dark:bg-white/10" />
                    </div>
                    <div className="w-full h-1 rounded bg-black/10 dark:bg-white/10 mt-1" />
                    <div className="w-full h-1 rounded bg-black/10 dark:bg-white/10" />
                    <div className="w-4/5 h-1 rounded bg-black/10 dark:bg-white/10" />
                </div>
            </div>
        </div>
    )
}

function ImmersiveThumbnail() {
    return (
        <div className="w-full h-40 bg-[#0d0d0d] rounded-2xl overflow-hidden flex flex-col gap-1.5 select-none">
            {/* Big H1 */}
            <div className="px-3 pt-3">
                <div className="w-3/4 h-2.5 rounded bg-white/30 mb-1" />
                <div className="w-1/2 h-2.5 rounded bg-white/20" />
            </div>
            {/* Parallax section */}
            <div className="w-full h-14 bg-gradient-to-r from-violet-500/40 to-fuchsia-500/30 flex items-center justify-center">
                <div className="w-1/2 h-2 rounded bg-white/50" />
            </div>
            {/* Card grid */}
            <div className="flex gap-1.5 px-3 pb-2">
                {[0, 1].map(i => (
                    <div key={i} className="flex-1 bg-white/5 rounded-lg p-2 border border-white/10">
                        <div className="w-2/3 h-1 rounded bg-violet-400/50 mb-1" />
                        <div className="w-full h-1 rounded bg-white/10" />
                        <div className="w-4/5 h-1 rounded bg-white/10 mt-0.5" />
                    </div>
                ))}
            </div>
        </div>
    )
}

function DataHubThumbnail() {
    return (
        <div className="w-full h-40 bg-white dark:bg-[#111] rounded-2xl overflow-hidden flex flex-col gap-1.5 p-3 select-none">
            {/* Info box */}
            <div className="border-l-3 border-cyan-500 pl-2 py-1.5 bg-cyan-500/8 rounded-r-lg">
                <div className="w-1/3 h-1 rounded bg-cyan-500/60 mb-1" />
                <div className="w-full h-1 rounded bg-black/10 dark:bg-white/10" />
            </div>
            {/* Table */}
            <div className="flex flex-col gap-0 border border-black/10 dark:border-white/10 rounded-lg overflow-hidden">
                <div className="h-4 bg-cyan-500/20 flex items-center gap-1 px-2">
                    <div className="flex-1 h-1.5 rounded bg-cyan-600/50" />
                    <div className="flex-1 h-1.5 rounded bg-cyan-600/30" />
                </div>
                {[0, 1].map(i => (
                    <div key={i} className="flex items-center gap-1 px-2 py-1 border-t border-black/5 dark:border-white/5">
                        <div className="flex-1 h-1 rounded bg-black/10 dark:bg-white/10" />
                        <div className="flex-1 h-1 rounded bg-black/10 dark:bg-white/10" />
                    </div>
                ))}
            </div>
            {/* Author note */}
            <div className="flex items-center gap-1.5 bg-black/3 dark:bg-white/3 rounded-full px-2 py-1 mt-auto">
                <div className="w-4 h-4 rounded-full bg-black/20 dark:bg-white/20 flex-shrink-0" />
                <div className="w-3/4 h-1 rounded bg-black/10 dark:bg-white/10" />
            </div>
        </div>
    )
}

function EditorialThumbnail() {
    return (
        <div className="w-full h-40 bg-base-light dark:bg-[#111] rounded-2xl overflow-hidden flex flex-col gap-1.5 p-3 select-none">
            <div className="w-full h-16 rounded-lg bg-gradient-to-br from-rose-500/40 to-orange-400/20 flex items-end px-3 pb-2">
                <div className="w-3/4 h-2 rounded bg-white/60" />
            </div>
            <div className="flex gap-1.5 px-0.5">
                <div className="w-4 h-4 rounded-full bg-black/20 dark:bg-white/20 flex-shrink-0" />
                <div className="w-24 h-1.5 rounded bg-black/10 dark:bg-white/10 self-center" />
            </div>
            <div className="flex flex-col gap-1 px-0.5 flex-1">
                <div className="w-full h-1.5 rounded bg-black/10 dark:bg-white/10" />
                <div className="w-full h-1.5 rounded bg-black/10 dark:bg-white/10" />
                <div className="w-4/5 h-1.5 rounded bg-black/10 dark:bg-white/10" />
            </div>
            <div className="border-l-4 border-rose-400 pl-2 py-0.5">
                <div className="w-2/3 h-1.5 rounded bg-rose-400/40" />
            </div>
        </div>
    )
}

function MagazineThumbnail() {
    return (
        <div className="w-full h-40 bg-base-light dark:bg-[#111] rounded-2xl overflow-hidden flex flex-col gap-1.5 p-3 select-none">
            <div className="w-full h-10 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-end px-3 pb-1">
                <div className="w-1/2 h-1.5 rounded bg-white/50" />
            </div>
            <div className="flex gap-2 flex-1">
                <div className="w-1/4 flex-shrink-0 flex flex-col gap-1 pt-1">
                    {[1, 0.8, 0.8, 0.6, 0.8].map((w, i) => (
                        <div key={i} className={`h-1 rounded ${i === 0 ? 'bg-primary/40' : 'bg-black/10 dark:bg-white/10'}`} style={{ width: `${w * 100}%` }} />
                    ))}
                </div>
                <div className="flex-1 flex flex-col gap-1 pt-1">
                    {[1, 1, 1, 0.8, 1, 0.67].map((w, i) => (
                        <div key={i} className="h-1.5 rounded bg-black/10 dark:bg-white/10" style={{ width: `${w * 100}%` }} />
                    ))}
                </div>
            </div>
        </div>
    )
}

function MinimalThumbnail() {
    return (
        <div className="w-full h-40 bg-base-light dark:bg-[#111] rounded-2xl overflow-hidden flex flex-col items-center gap-2 p-4 select-none">
            <div className="w-24 h-1 rounded bg-black/10 dark:bg-white/10" />
            <div className="flex flex-col items-center gap-1 mt-1 w-3/4">
                <div className="w-full h-2.5 rounded bg-black/20 dark:bg-white/20" />
                <div className="w-5/6 h-2.5 rounded bg-black/20 dark:bg-white/20" />
            </div>
            <div className="w-8 h-0.5 rounded bg-primary/40 my-0.5" />
            <div className="w-3/4 flex flex-col gap-1">
                <div className="w-full h-1.5 rounded bg-black/10 dark:bg-white/10" />
                <div className="w-full h-1.5 rounded bg-black/10 dark:bg-white/10" />
                <div className="w-4/5 h-1.5 rounded bg-black/10 dark:bg-white/10" />
            </div>
        </div>
    )
}

const THUMBNAILS: Record<SiteTemplate, React.FC> = {
    authority: AuthorityThumbnail,
    immersive: ImmersiveThumbnail,
    datahub: DataHubThumbnail,
    editorial: EditorialThumbnail,
    magazine: MagazineThumbnail,
    minimal: MinimalThumbnail,
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface TemplateLibraryModalProps {
    currentTemplateId?: SiteTemplate
    onSelect: (id: SiteTemplate) => void
    onClose: () => void
}

const SCHEMA_BADGE: Partial<Record<SiteTemplate, string>> = {
    authority: 'Schema 1',
    immersive: 'Schema 2',
    datahub: 'Schema 3',
}

export default function TemplateLibraryModal({ currentTemplateId, onSelect, onClose }: TemplateLibraryModalProps) {
    const [hovered, setHovered] = useState<SiteTemplate | null>(null)
    const [selected, setSelected] = useState<SiteTemplate>(currentTemplateId || 'authority')

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
            <div className="bg-base-light dark:bg-base-dark rounded-[2.5rem] shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-10 pt-10 pb-6 flex-shrink-0">
                    <div>
                        <h2 className="text-3xl font-extrabold tracking-tight">Vorlagen-Bibliothek</h2>
                        <p className="text-sm text-ink-light/60 dark:text-ink-muted mt-1">
                            Wähle ein Layout. Nur Design & Struktur — Inhalte füllt die KI.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors focus:outline-none"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Schema highlight row */}
                <div className="px-10 pb-4 flex-shrink-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">✦ Neue Artikel-Schemas</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        {SITE_TEMPLATES.slice(0, 3).map(tpl => {
                            const Thumb = THUMBNAILS[tpl.id]
                            const isSelected = selected === tpl.id
                            const isHovered = hovered === tpl.id
                            return (
                                <button
                                    key={tpl.id}
                                    onClick={() => setSelected(tpl.id)}
                                    onMouseEnter={() => setHovered(tpl.id)}
                                    onMouseLeave={() => setHovered(null)}
                                    className={`relative text-left rounded-3xl p-4 border-2 transition-all duration-300 focus:outline-none ${isSelected
                                        ? 'border-primary shadow-lg shadow-primary/20 bg-primary/5'
                                        : 'border-black/5 dark:border-white/5 bg-surface-light dark:bg-surface-dark hover:border-primary/40'
                                        }`}
                                >
                                    {SCHEMA_BADGE[tpl.id] && (
                                        <span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                            {SCHEMA_BADGE[tpl.id]}
                                        </span>
                                    )}
                                    {isSelected && (
                                        <div className="absolute top-3 left-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-btn">
                                            <Check className="w-3.5 h-3.5 text-white" />
                                        </div>
                                    )}
                                    <div className={`relative mb-3 transition-transform duration-300 ${isHovered || isSelected ? 'scale-[1.02]' : ''}`}>
                                        <Thumb />
                                        {isSelected && (
                                            <div className={`absolute inset-0 bg-gradient-to-br ${tpl.accentClass} rounded-2xl opacity-30`} />
                                        )}
                                    </div>
                                    <div className="space-y-0.5">
                                        <h3 className={`font-bold transition-colors ${isSelected ? 'text-primary' : 'text-ink-light dark:text-ink-dark'}`}>{tpl.name}</h3>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-light/40 dark:text-ink-muted">{tpl.tagline}</p>
                                        <p className="text-xs text-ink-light/50 dark:text-ink-muted/70 italic">{tpl.inspiration}</p>
                                        <p className="text-xs text-ink-light/60 dark:text-ink-muted leading-relaxed pt-1">{tpl.description}</p>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    <p className="text-xs font-bold uppercase tracking-widest text-ink-light/40 dark:text-ink-muted mb-3">Legacy Templates</p>
                    <div className="grid grid-cols-3 gap-3">
                        {SITE_TEMPLATES.slice(3).map(tpl => {
                            const Thumb = THUMBNAILS[tpl.id]
                            const isSelected = selected === tpl.id
                            return (
                                <button
                                    key={tpl.id}
                                    onClick={() => setSelected(tpl.id)}
                                    onMouseEnter={() => setHovered(tpl.id)}
                                    onMouseLeave={() => setHovered(null)}
                                    className={`relative text-left rounded-2xl p-3 border-2 transition-all duration-200 focus:outline-none ${isSelected
                                        ? 'border-primary bg-primary/5'
                                        : 'border-black/5 dark:border-white/5 bg-surface-light dark:bg-surface-dark hover:border-primary/30'
                                        }`}
                                >
                                    {isSelected && (
                                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                            <Check className="w-3 h-3 text-white" />
                                        </div>
                                    )}
                                    <div className="mb-2 scale-90 origin-top">
                                        <Thumb />
                                    </div>
                                    <h3 className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-ink-light dark:text-ink-dark'}`}>{tpl.name}</h3>
                                    <p className="text-[10px] text-ink-light/40 dark:text-ink-muted">{tpl.tagline}</p>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-10 py-5 border-t border-black/5 dark:border-white/5 flex items-center justify-between flex-shrink-0">
                    <span className="text-sm text-ink-light/50 dark:text-ink-muted">
                        {SITE_TEMPLATES.find(t => t.id === selected)?.name} ausgewählt
                    </span>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl text-sm font-medium text-ink-light/60 dark:text-ink-muted hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                        >
                            Abbrechen
                        </button>
                        <button
                            onClick={() => { onSelect(selected); onClose() }}
                            className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-btn focus:outline-none"
                        >
                            Auswählen
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

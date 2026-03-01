import { useState, useCallback, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import {
    DndContext, closestCenter, KeyboardSensor, PointerSensor,
    useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
    arrayMove, SortableContext, sortableKeyboardCoordinates,
    useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
    GripVertical, Image as ImageIcon, LayoutGrid,
    Save, X, Settings2, BookOpen, PenLine,
    Heading1, ListOrdered, AlignLeft, Code, Quote as QuoteIcon,
    Cpu, ChevronLeft, Palette,
} from 'lucide-react'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import TemplateLibraryModal, { SITE_TEMPLATES } from '../components/ui/TemplateLibraryModal'
import type { ConnectedSite } from '../App'
import type { VisualOptions } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────
export type BlockType = 'h1_hero' | 'hero_image' | 'intro_block' | 'toc_block' | 'ai_text_block'
    | 'quote_block' | 'custom_html'
    | 'parallax_section' | 'card_grid' | 'info_box' | 'author_note'
export type EditorMode = 'preview' | 'build'
export type BuilderMode = 'template' | 'draft'

export interface BlockOptions {
    alignment?: 'left' | 'center' | 'right'
    paddingTop?: number
    paddingBottom?: number
    url?: string
    fontSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '4xl'
    characterLength?: number
    bgColor?: string
}

export interface Block {
    id: string
    type: BlockType
    label: string
    settings: BlockOptions
}

// ── Ghost Data ─────────────────────────────────────────────────────────────────
const DEFAULT_GHOST: Record<string, string> = {
    h1_hero: 'Die Zukunft von KI-Suchmaschinen in 2026',
    intro_block: '• KI-gestützte Suchen ersetzen Keywords durch Intent.\n• B2B-Unternehmen müssen auf „Informational Gain" setzen.\n• Der ROI von klassischen SEO-Texten sinkt rapide.',
    ai_text_block: '## Was ist Intent-basierte Suche?\n\nAutomatisierung im Redaktionsalltag ist kein Trend, sondern Realität. Immer mehr Unternehmen lagern die Recherche an Sprachmodelle aus.\n\n### Warum klassisches SEO stirbt\n\nDer LCP misst die Zeit bis zum Rendern des größten sichtbaren Elements.\n\n> Die Technologie soll den Menschen nicht ersetzen, sondern ihm Superkräfte verleihen.\n\n- Core Web Vitals als Ranking-Faktor\n- E-E-A-T als Trust-Signal\n- Intent-Cluster statt einzelne Keywords',
    quote_block: 'Die Technologie soll den Menschen nicht ersetzen, sondern ihm Superkräfte verleihen.',
    hero_image: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=800',
    parallax_section: 'Im Zentrum der digitalen Revolution steht die Aufmerksamkeit.',
    info_box: 'Quick-Summary: KI-Suche verschiebt SEO von Keywords zu Intent. Wer jetzt investiert, gewinnt Marktanteile.',
    card_grid: 'Intent statt Keyword|Semantische Suche läuft über Kontext statt exakte Phrasen|E-E-A-T signalisieren|Expertise, Erfahrung, Autorität und Vertrauen zählen mehr als Linkbuilding',
    author_note: 'Reviewed von KI-Redaktion & Experten-Team',
}

const BLOCK_TEMPLATES: Array<{ type: BlockType; label: string; Icon: React.ElementType; isAI?: boolean }> = [
    { type: 'h1_hero', label: 'H1 Hero Headline', Icon: Heading1, isAI: true },
    { type: 'intro_block', label: 'Intro & Key Takeaways', Icon: ListOrdered, isAI: true },
    { type: 'toc_block', label: 'Inhaltsverzeichnis (TOC)', Icon: LayoutGrid },
    { type: 'hero_image', label: 'Bild (LCP-Optimiert)', Icon: ImageIcon },
    { type: 'ai_text_block', label: 'AI Deep Dive Sektion', Icon: AlignLeft, isAI: true },
    { type: 'quote_block', label: 'Experten-Zitat', Icon: QuoteIcon },
    { type: 'parallax_section', label: 'Parallax Sektion', Icon: ImageIcon },
    { type: 'card_grid', label: 'Key-Points Card Grid', Icon: LayoutGrid, isAI: true },
    { type: 'info_box', label: 'Info-Box / Summary', Icon: AlignLeft },
    { type: 'author_note', label: 'Autor-Notiz', Icon: AlignLeft },
    { type: 'custom_html', label: 'Custom HTML/CSS', Icon: Code },
]

// ── Shared: Article Preview Render ────────────────────────────────────────────
export function ArticlePreviewRender({
    ghost, onEditClick, showEditButton = true,
    onSave, saved, onClose, template = 'authority', visualOpts = {} as import('../lib/api').VisualOptions,
}: {
    ghost: Record<string, string>
    onEditClick?: () => void
    showEditButton?: boolean
    onSave?: () => void
    saved?: boolean
    onClose?: () => void
    template?: string
    visualOpts?: import('../lib/api').VisualOptions
}) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [progress, setProgress] = useState(0)
    const handleScroll = () => {
        const el = scrollRef.current; if (!el) return
        const max = el.scrollHeight - el.clientHeight
        setProgress(max > 0 ? Math.round((el.scrollTop / max) * 100) : 0)
    }
    const headings: { text: string; level: number }[] = []
        ; (ghost.ai_text_block || '').split('\n').forEach(l => {
            const m = l.match(/^(#{1,3})\s+(.+)$/); if (m) headings.push({ level: m[1].length, text: m[2] })
        })
    const cards = (ghost.card_grid || '').split('|').reduce<{ title: string, body: string }[]>((acc, v, i) => {
        if (i % 2 === 0) acc.push({ title: v, body: '' }); else if (acc.length) acc[acc.length - 1].body = v; return acc
    }, [])
    const isDark = template === 'immersive'

    const topBar = (
        <div className={`flex items-center gap-4 px-6 py-3 border-b flex-shrink-0 backdrop-blur-xl ${isDark ? 'border-white/10 bg-black/80' : 'border-black/5 dark:border-white/5 bg-white/90 dark:bg-[#0a0a0a]/90'}`}>
            <span className={`font-bold text-sm truncate flex-1 ${isDark ? 'text-white' : ''}`}>{ghost.h1_hero}</span>
            <span className={`text-xs px-2 py-1 rounded-lg font-mono ${isDark ? 'bg-white/10 text-white/60' : 'bg-primary/10 text-primary'}`}>{progress}% gelesen</span>
            {onClose && <button onClick={onClose} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors focus:outline-none ${isDark ? 'text-white/50 hover:bg-white/10' : 'text-black/55 dark:text-white/40 hover:bg-black/5'}`}><X className="w-4 h-4" /> Schließen</button>}
            {onSave && <button onClick={onSave} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all focus:outline-none ${saved ? (isDark ? 'bg-violet-500/20 text-violet-300' : 'bg-primary/10 text-primary') : (isDark ? 'text-white/50 hover:bg-white/10' : 'text-black/55 hover:bg-black/5')}`}><Save className="w-4 h-4" /> {saved ? 'Gespeichert ✓' : 'Speichern'}</button>}
            {showEditButton && onEditClick && <button onClick={onEditClick} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors focus:outline-none shadow-btn ${isDark ? 'bg-violet-500 hover:bg-violet-600 text-white' : 'bg-primary hover:bg-primary/90 text-white'}`}><PenLine className="w-4 h-4" /> Bearbeiten</button>}
        </div>
    )

    // ── Schema 1: The Authority — lol.css + wlol.css + lol.html ─────────────
    if (template !== 'immersive' && template !== 'datahub') {
        const h2Headings = (ghost.ai_text_block || '').split('\n')
            .filter(l => l.startsWith('## ')).map(l => l.slice(3)).slice(0, 3)
        const fallbackCards = [
            'Kernargumente und Hintergründe im Überblick',
            'Fundierte Einordnung mit Daten und Expertenmeinungen',
            'Was Sie nach diesem Artikel wissen sollten'
        ]
        const cardTags = ['Zusammenfassung', 'Analyse', 'Fazit']
        const heroCards = h2Headings.length > 0 ? h2Headings : fallbackCards

        const S = visualOpts.style || {}
        const L = visualOpts.layout || {}
        const ADV = visualOpts.advanced || {}

        // ── CSS-Variablen: 1:1 aus lol.css — auf dem wrapper-div statt :root ──
        const globalVars = {
            // FARBEN (60-30-10 Regel)
            '--ds-color-primary': S.brand_primary || '#007AFF',
            '--ds-color-primary-hover': S.primary_hover || '#005bb5',
            '--ds-color-bg-main': S.bg_body || '#ffffff',
            '--ds-color-bg-sec': S.bg_panel || '#f5f5f7',
            '--ds-color-bg-card': S.bg_card || visualOpts.master_hero?.card_bg || '#ffffff',
            '--ds-color-text-main': S.text_main || '#1d1d1f',
            '--ds-color-text-body': S.text_dimmed || '#424245',
            '--ds-color-text-muted': S.text_muted || '#86868b',
            '--ds-color-border': S.border_color || '#d2d2d7',
            '--ds-color-border-light': S.border_color_light || '#e5e5e7',
            // TYPOGRAFIE
            '--ds-font-family': S.font_family || "'Inter', -apple-system, sans-serif",
            '--ds-text-h1': S.h1_size || '3.5rem',
            '--ds-text-h2': S.h2_size || '1.9rem',
            '--ds-text-body-large': S.body_large_size || '1.25rem',
            '--ds-text-body': S.body_size || '1.1rem',
            '--ds-text-small': S.small_size || '0.85rem',
            // BORDER RADIUS
            '--ds-radius-sm': S.radius_sm || '8px',
            '--ds-radius-md': S.radius_md || '12px',
            '--ds-radius-lg': S.radius_lg || '14px',
            '--ds-radius-xl': S.radius_xl || S.radius_ui || '16px',
            // ABSTÄNDE
            '--ds-spacing-xs': S.spacing_xs || '10px',
            '--ds-spacing-sm': S.spacing_sm || '20px',
            '--ds-spacing-md': S.spacing_md || '30px',
            '--ds-spacing-lg': S.spacing_lg || '40px',
            '--ds-spacing-xl': S.spacing_xl || '60px',
            '--ds-container-width': L.container_width || '1440px',
            '--ds-sidebar-width-left': L.sidebar_width || '280px',
            '--ds-sidebar-width-right': L.action_width || '240px',
            // EFFEKTE
            '--ds-shadow-card': S.shadow_elevation || '0 10px 30px rgba(0,0,0,0.05)',
            '--ds-transition-speed': '0.3s',
        } as React.CSSProperties

        // ── Component CSS: exakter Port aus wlol.css ─────────────────────────
        const injectedCSS = `/* --- BASIS --- */
* { box-sizing: border-box; margin: 0; padding: 0; }
.ds-master-wrapper { font-family: var(--ds-font-family); color: var(--ds-color-text-body); background: var(--ds-color-bg-main); line-height: 1.6; overflow-x: hidden; text-align: left; }
.ds-container { max-width: var(--ds-container-width); margin: 0 auto; padding: 0 20px; }
#reading-progress { position: fixed; top: 0; left: 0; width: 0%; height: 4px; background: var(--ds-color-primary); z-index: 10000; transition: width 0.1s; }

/* BLOCK 1: HERO SEKTION */
.ds-hero { background-color: var(--ds-color-bg-sec); padding: var(--ds-spacing-xl) var(--ds-spacing-sm); border-bottom: 1px solid var(--ds-color-border); }
.ds-hero-container { max-width: var(--ds-container-width); margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-spacing-lg); align-items: center; }
.ds-breadcrumbs { font-size: var(--ds-text-small); color: var(--ds-color-text-muted); margin-bottom: var(--ds-spacing-sm); }
.ds-breadcrumbs a { text-decoration: none; color: inherit; transition: var(--ds-transition-speed); }
.ds-breadcrumbs a:hover { color: var(--ds-color-primary); }
.ds-hero-content h1 { font-size: var(--ds-text-h1); font-weight: 800; line-height: 1.1; margin-bottom: var(--ds-spacing-sm); color: var(--ds-color-text-main); }
.ds-hero-intro { font-size: var(--ds-text-body-large); margin-bottom: var(--ds-spacing-md); max-width: 600px; }
.ds-hero-btns { display: flex; gap: 15px; flex-wrap: wrap; }
.ds-btn-primary { background: var(--ds-color-text-main); color: #fff; padding: 14px 28px; border-radius: var(--ds-radius-sm); text-decoration: none; font-weight: 600; transition: var(--ds-transition-speed); }
.ds-btn-primary:hover { transform: translateY(-2px); background: #000; }
.ds-btn-text { padding: 14px 28px; color: var(--ds-color-text-main); font-weight: 600; text-decoration: none; }
.ds-hero-visual { display: flex; flex-direction: column; gap: 15px; perspective: 1000px; }
.ds-preview-card { background: var(--ds-color-bg-card); padding: var(--ds-spacing-sm); border-radius: var(--ds-radius-lg); box-shadow: var(--ds-shadow-card); border: 1px solid var(--ds-color-border-light); max-width: 400px; }
.ds-preview-card:nth-child(1) { transform: rotate(-2deg) translateX(20px); z-index: 3; }
.ds-preview-card:nth-child(2) { transform: rotate(1deg) translateX(0px); z-index: 2; margin-top: -40px; opacity: 0.8; }
.ds-preview-card:nth-child(3) { transform: rotate(3deg) translateX(-20px); z-index: 1; margin-top: -40px; opacity: 0.5; }

/* BLOCK 2: HAUPT-LAYOUT */
.ds-grid-container { display: grid; gap: 50px; max-width: var(--ds-container-width); margin: 0 auto; padding: var(--ds-spacing-lg) var(--ds-spacing-sm); align-items: start; grid-template-columns: var(--ds-sidebar-width-left) 1fr var(--ds-sidebar-width-right); }

/* SIDEBAR LINKS */
.ds-sidebar-left { position: sticky; top: var(--ds-spacing-lg); font-size: var(--ds-text-small); }
.ds-cta-box { background: var(--ds-color-primary); color: white; padding: var(--ds-spacing-sm); border-radius: var(--ds-radius-md); margin-bottom: var(--ds-spacing-md); }
.ds-cta-box a { color: white; font-weight: 700; text-decoration: none; }
.ds-info-list { list-style: none; padding: 0; margin-bottom: var(--ds-spacing-md); border-bottom: 1px solid var(--ds-color-border); padding-bottom: var(--ds-spacing-sm); }
.ds-info-list li { margin-bottom: 12px; }
.ds-label { font-weight: 700; color: var(--ds-color-text-main); display: block; font-size: 0.7rem; text-transform: uppercase; }
.ds-topics-nav { margin-top: var(--ds-spacing-sm); }
.ds-topics-label { display: block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ds-color-text-muted); margin-bottom: var(--ds-spacing-xs); }
.ds-topics-list { list-style: none; padding: 0; margin: 0; }
.ds-topics-list li { padding: 6px 0 6px 14px; border-left: 2px solid var(--ds-color-border); transition: border-color var(--ds-transition-speed); }
.ds-topics-list li:hover { border-left-color: var(--ds-color-primary); }
.ds-topics-list a { text-decoration: none; color: var(--ds-color-text-body); font-size: var(--ds-text-small); display: block; }
.ds-topics-list a:hover { color: var(--ds-color-primary); }

/* HAUPTINHALT */
.ds-main-content { max-width: 100%; }
.ds-author-box { display: flex; gap: var(--ds-spacing-lg); margin-bottom: var(--ds-spacing-lg); padding: 25px; background: var(--ds-color-bg-sec); border-radius: var(--ds-radius-xl); }
.ds-profile { display: flex; align-items: center; gap: 12px; }
.ds-profile img { width: 48px; height: 48px; border-radius: 50%; }

.ds-toc { margin: var(--ds-spacing-lg) 0; padding: var(--ds-spacing-md); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-xl); }
.ds-toc h5 { margin-bottom: 15px; font-size: 1.1rem; color: var(--ds-color-text-main); }
#toc-list { display: grid; grid-template-columns: 1fr 1fr; gap: 15px 30px; list-style: none; padding: 0; }
#toc-list a { text-decoration: none; color: var(--ds-color-primary); transition: var(--ds-transition-speed); }
#toc-list a.active-chapter { color: var(--ds-color-text-main); font-weight: 800; border-left: 3px solid var(--ds-color-primary); padding-left: 12px; }

/* Typografie im Artikel */
.ds-article h1 { font-size: var(--ds-text-h1); color: var(--ds-color-text-main); }
.ds-article h2 { font-size: var(--ds-text-h2); margin-top: 4rem; padding-bottom: 12px; border-bottom: 1px solid var(--ds-color-border); color: var(--ds-color-text-main); margin-bottom: 1rem; }
.ds-article p { font-size: var(--ds-text-body); margin-bottom: 1.8rem; }
.ds-article blockquote { margin: 45px 0; padding: 10px 0 10px 30px; border-left: 4px solid var(--ds-color-primary); font-style: italic; font-size: 1.3rem; }

/* IN CONTENT CTA (NEW) */
.ds-in-content-cta { background: var(--ds-color-bg-sec); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-lg); padding: 35px; margin: 50px 0; display: flex; justify-content: space-between; align-items: center; gap: 30px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.03); }
.ds-cta-text h4 { font-size: 1.4rem; color: var(--ds-color-text-main); margin-bottom: 8px; }

/* SIDEBAR RECHTS */
.ds-sidebar-right { position: sticky; top: var(--ds-spacing-lg); }
.ds-ad-box { background: #fbfbfd; border: 1px dashed var(--ds-color-border); min-height: 500px; display: flex; align-items: center; justify-content: center; border-radius: var(--ds-radius-md); }

/* RESPONSIVE */
@media (max-width: 1200px) { .ds-grid-container { grid-template-columns: var(--ds-sidebar-width-left) 1fr; } .ds-sidebar-right { display: none; } }
@media (max-width: 1000px) { .ds-hero-container { grid-template-columns: 1fr; text-align: center; } .ds-hero-visual { display: none; } .ds-hero-intro { margin: 0 auto var(--ds-spacing-md) auto; } .ds-hero-btns { justify-content: center; } .ds-in-content-cta { flex-direction: column; text-align: center; } }
@media (max-width: 900px) { .ds-grid-container { grid-template-columns: 1fr; } .ds-sidebar-left { display: none; } #toc-list { grid-template-columns: 1fr; } }`
        // ── JSX: exakter Port aus lol.html ───────────────────────────────────
        const content_schema1 = (
            <div className="fixed inset-0 z-50 flex flex-col overflow-hidden ds-master-wrapper" style={globalVars}>
                <style>{injectedCSS}{ADV.custom_css || ''}</style>
                <div className="absolute top-0 left-0 z-[10000] transition-all duration-100" style={{ width: `${progress}%`, height: 4, background: 'var(--ds-color-primary)' }} />
                {topBar}
                <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">

                    {/* Lese-Fortschrittsbalken */}
                    <div id="reading-progress" />

                    {/* BLOCK 1: HERO SEKTION */}
                    <section className="ds-hero">
                        <div className="ds-hero-container">
                            <div className="ds-hero-content">
                                <nav className="ds-breadcrumbs">
                                    <a href="#">Startseite</a> / <a href="#">Artikel</a> / <span>Aktuell</span>
                                </nav>
                                <h1>{ghost.h1_hero || 'Mustertitel für ein professionelles Thema'}</h1>
                                <p className="ds-hero-intro">
                                    {(ghost.intro_block || '').split('\n')[0] || 'Dieser Bereich wird von der KI generiert. Er vermittelt dem Leser sofort den Kernnutzen prägnant und informativ.'}
                                </p>
                                <div className="ds-hero-btns">
                                    <a href="#article-root" className="ds-btn-primary">Direkt zum Inhalt</a>
                                    <a href="#" className="ds-btn-text">Mehr erfahren &rarr;</a>
                                </div>
                            </div>
                            {/* Rechts: Gestapelte Karten */}
                            <div className="ds-hero-visual">
                                {heroCards.map((cardTitle, i) => (
                                    <div key={i} className="ds-preview-card">
                                        <strong>{cardTags[i]} &bull; 0{i + 1}</strong><br />
                                        <span>{cardTitle}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* BLOCK 2: HAUPT-BEREICH (Grid) */}
                    <div className="ds-grid-container">

                        {/* LINKE SPALTE (Sidebar) */}
                        <aside className="ds-sidebar-left">
                            <div className="ds-cta-box">
                                <p>Erhalten Sie Zugriff auf weiterführende Ressourcen.</p>
                                <a href="#">Jetzt registrieren</a>
                            </div>
                            <ul className="ds-info-list">
                                <li><span className="ds-label">Prüfung</span> Verifizierter Artikel</li>
                                <li><span className="ds-label">Update</span> Aktuell</li>
                                <li><span className="ds-label">Lesezeit</span> ca. 5 Min.</li>
                            </ul>
                            {/* THEMEN: Dynamische Artikel-Navigation */}
                            {headings.length > 0 && (
                                <nav className="ds-topics-nav">
                                    <span className="ds-topics-label">Themen</span>
                                    <ul className="ds-topics-list">
                                        {headings.map((h, i) => (
                                            <li key={i}><a href="#">{h.text}</a></li>
                                        ))}
                                    </ul>
                                </nav>
                            )}
                        </aside>

                        {/* MITTLERE SPALTE (Content) */}
                        <main className="ds-main-content">
                            {/* Autoren-Box */}
                            <header className="ds-author-box">
                                <div className="ds-profile">
                                    <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(ghost.author_name || 'LinguistFlow KI')}&background=007AFF&color=fff`} alt="Autor" loading="lazy" />
                                    <div><span style={{ color: 'var(--ds-color-text-muted)', fontSize: '.75rem', display: 'block' }}>Inhalt von</span><strong>{ghost.author_name || 'LinguistFlow KI'}</strong></div>
                                </div>
                                <div className="ds-profile">
                                    <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(ghost.reviewer_name || 'Experten-Team')}&background=random&color=fff`} alt="Experte" loading="lazy" />
                                    <div><span style={{ color: 'var(--ds-color-text-muted)', fontSize: '.75rem', display: 'block' }}>Geprüft von</span><strong>{ghost.reviewer_name || 'Experten-Team'}</strong></div>
                                </div>
                            </header>

                            {/* Dynamisches Inhaltsverzeichnis */}
                            <nav className="ds-toc">
                                <h5>Inhalt dieses Artikels</h5>
                                <ul id="toc-list">
                                    {(headings.length > 0 ? headings : [{ text: 'Einleitung' }, { text: 'Analyse' }, { text: 'Praxisbeispiele' }, { text: 'Fazit' }]).slice(0, 8).map((h, i) => (
                                        <li key={i}><a href="#">{h.text}</a></li>
                                    ))}
                                </ul>
                            </nav>

                            {/* ARTIKEL TEXT */}
                            <article className="ds-article" id="article-root">
                                <h1>{ghost.h1_hero}</h1>
                                {ghost.intro_block && <p>{ghost.intro_block}</p>}
                                {(() => {
                                    const lines = (ghost.ai_text_block || '').split('\n')
                                    const nodes: React.ReactNode[] = []
                                    let bulletBuf: string[] = []
                                    const flushBullets = (key: number) => {
                                        if (bulletBuf.length === 0) return
                                        nodes.push(
                                            <ul key={`ul-${key}`} className="ds-list">
                                                {bulletBuf.map((t, j) => <li key={j}>{typeof t === 'string' ? renderInlineMd(t) : t}</li>)}
                                            </ul>
                                        )
                                        bulletBuf = []
                                    }
                                    lines.forEach((line, i) => {
                                        if (!line.trim()) { flushBullets(i); return }
                                        if (line.startsWith('## ')) { flushBullets(i); nodes.push(<h2 key={i}>{renderInlineMd(line.slice(3))}</h2>); return }
                                        if (line.startsWith('### ')) { flushBullets(i); nodes.push(<h3 key={i} style={{ fontSize: '1.15rem', marginTop: '2.5rem', marginBottom: '.5rem' }}>{renderInlineMd(line.slice(4))}</h3>); return }
                                        if (line.startsWith('> ')) { flushBullets(i); nodes.push(<blockquote key={i}>{line.slice(2)}</blockquote>); return }
                                        if (line.startsWith('- ') || line.startsWith('* ')) { bulletBuf.push(line.slice(2)); return }
                                        flushBullets(i)
                                        nodes.push(<p key={i}>{renderInlineMd(line)}</p>)
                                    })
                                    flushBullets(lines.length)
                                    return nodes
                                })()}

                                {ghost.cta_block_html ? <div dangerouslySetInnerHTML={{ __html: ghost.cta_block_html }} /> : (
                                    <div className="ds-in-content-cta">
                                        <div className="ds-cta-text">
                                            <h4>Kostenloses Whitepaper</h4>
                                            <p>Lade dir unseren exklusiven 40-seitigen PDF-Guide herunter.</p>
                                        </div>
                                        <a href="#" className="ds-btn-primary" style={{ color: 'white', borderRadius: 8, textDecoration: 'none', padding: '14px 28px', background: 'var(--ds-color-primary)', fontWeight: 600 }}>Download</a>
                                    </div>
                                )}
                            </article>
                        </main>

                        {/* RECHTE SPALTE (Werbung) */}
                        <aside className="ds-sidebar-right">
                            <div className="ds-ad-box">
                                <p style={{ fontSize: '.85rem', color: 'var(--ds-color-text-muted)' }}>Anzeigen-Platzhalter</p>
                            </div>
                        </aside>
                    </div>
                </div>
            </div>
        )

        return content_schema1;
    }

    // ── Schema 2: The Immersive ──────────────────────────────────────────────
    if (template === 'immersive') return (
        <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: '#0d0d0d', color: 'var(--ds-bg-body)', fontFamily: "'Inter',-apple-system,sans-serif" }}>
            <div className="absolute top-0 left-0 h-[3px] z-[100] transition-all duration-150" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }} />
            {topBar}
            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
                <div className="max-w-[860px] mx-auto px-6 py-14">
                    <div className="flex gap-2 mb-6">
                        <span style={{ fontSize: '.75rem', fontFamily: 'monospace', padding: '.2rem .55rem', borderRadius: 6, background: 'rgba(124,58,237,.2)', color: '#c4b5fd' }}>KI-generiert</span>
                    </div>
                    <h1 style={{ fontSize: '2.8rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: '2rem' }}>{ghost.h1_hero}</h1>
                    {(ghost.hero_image || ghost.parallax_section) && (
                        <div style={{ height: 280, backgroundImage: ghost.hero_image ? `url(${ghost.hero_image})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 0 3rem', position: 'relative', overflow: 'hidden', background: ghost.hero_image ? undefined : 'linear-gradient(135deg,#4c1d95,#701a75)' }}>
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }} />
                            <h2 style={{ position: 'relative', fontSize: '1.5rem', fontWeight: 700, textAlign: 'center', padding: '0 2rem', textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>{ghost.parallax_section || (ghost.intro_block || '').split('\n')[0]}</h2>
                        </div>
                    )}
                    {ghost.intro_block && <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,.7)', lineHeight: 1.8, marginBottom: '2.5rem', whiteSpace: 'pre-line' }}>{ghost.intro_block}</p>}
                    {cards.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16, margin: '2rem 0 3rem' }}>
                            {cards.map((c, i) => (
                                <div key={i} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 'var(--ds-radius-ui)', padding: '1.25rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#c4b5fd', marginBottom: 6 }}>{c.title}</h3>
                                    <p style={{ fontSize: '.9rem', color: 'rgba(255,255,255,.6)', lineHeight: 1.7 }}>{c.body}</p>
                                </div>
                            ))}
                        </div>
                    )}
                    <div>
                        {(ghost.ai_text_block || '').split('\n').filter(Boolean).map((line, i) => {
                            if (line.startsWith('## ')) return <h2 key={i} style={{ fontSize: '1.5rem', fontWeight: 700, margin: '2.5rem 0 .5rem' }}>{line.slice(3)}</h2>
                            if (line.startsWith('### ')) return <h3 key={i} style={{ fontSize: '1.2rem', fontWeight: 600, color: 'rgba(255,255,255,.7)', margin: '1.5rem 0 .3rem' }}>{line.slice(4)}</h3>
                            if (line.startsWith('> ')) return <blockquote key={i} style={{ borderLeft: '4px solid #7c3aed', background: 'rgba(124,58,237,.1)', padding: '.7rem 1.25rem', borderRadius: '0 12px 12px 0', margin: '1.5rem 0', fontStyle: 'italic', color: '#c4b5fd', fontSize: '1.1rem' }}>{line.slice(2)}</blockquote>
                            if (line.startsWith('- ')) return <li key={i} style={{ color: 'rgba(255,255,255,.7)', marginBottom: 4, listStyle: 'disc', marginLeft: '1.5rem' }}>{line.slice(2)}</li>
                            return <p key={i} style={{ color: 'rgba(255,255,255,.75)', lineHeight: 1.8, marginBottom: '1rem', fontSize: '1.05rem' }}>{renderInlineMd(line)}</p>
                        })}
                        {ghost.quote_block && <blockquote style={{ borderLeft: '4px solid #7c3aed', background: 'rgba(124,58,237,.12)', padding: '.75rem 1.25rem', borderRadius: '0 12px 12px 0', margin: '2rem 0', fontStyle: 'italic', color: '#c4b5fd', fontSize: '1.15rem' }}>„{ghost.quote_block}"</blockquote>}
                    </div>
                </div>
            </div>
        </div>
    )

    // ── Schema 3: The Data Hub ───────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex flex-col overflow-hidden" style={{ fontFamily: "'Inter',-apple-system,sans-serif" }}>
            <div className="absolute top-0 left-0 h-[3px] z-[100] transition-all duration-150" style={{ width: `${progress}%`, background: '#2196f3' }} />
            {topBar}
            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
                <div className="max-w-[820px] mx-auto px-6 py-12">
                    {ghost.info_box && (
                        <div style={{ background: '#e3f2fd', borderLeft: '5px solid #2196f3', padding: '1.25rem 1.5rem', marginBottom: '2rem', borderRadius: '0 12px 12px 0' }}>
                            <strong style={{ display: 'block', marginBottom: 4, color: '#1565c0', fontSize: '.9rem' }}>Quick-Summary:</strong>
                            <p style={{ color: 'var(--ds-text-main)', lineHeight: 1.7, margin: 0 }}>{ghost.info_box}</p>
                        </div>
                    )}
                    <div className="flex gap-2 mb-5">
                        <span style={{ fontSize: '.75rem', fontFamily: 'monospace', padding: '.2rem .55rem', borderRadius: 6, background: 'rgba(33,150,243,.12)', color: '#1565c0' }}>KI-generiert</span>
                        <span className="text-xs font-mono px-2 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-black/55">de</span>
                    </div>
                    <h1 className="dark:text-white" style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '1.5rem', color: 'var(--ds-text-main)' }}>{ghost.h1_hero}</h1>
                    {ghost.intro_block && <div style={{ background: 'var(--ds-bg-panel)', borderLeft: '4px solid #2196f3', padding: '1rem 1.5rem', marginBottom: '2rem', borderRadius: '0 8px 8px 0' }}><p style={{ whiteSpace: 'pre-line', lineHeight: 1.7, color: 'var(--ds-text-main)', margin: 0 }}>{ghost.intro_block}</p></div>}
                    {headings.length === 0 && (
                        <div style={{ overflowX: 'auto', margin: '2rem 0', borderRadius: 'var(--ds-radius-ui)', boxShadow: '0 4px 12px rgba(0,0,0,.07)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.95rem' }}>
                                <thead><tr>{['Aspekt', 'Strategie', 'Benchmark'].map(h => <th key={h} style={{ background: '#2196f3', color: 'var(--ds-bg-body)', padding: '12px 16px', textAlign: 'left', fontWeight: 700 }}>{h}</th>)}</tr></thead>
                                <tbody>{['LCP', 'INP', 'CLS'].map((r, i) => <tr key={i} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? '#fff' : 'var(--ds-bg-panel)' }}><td style={{ padding: '12px 16px', fontWeight: 600 }}>{r}</td><td style={{ padding: '12px 16px', color: '#555' }}>[KI-generiert]</td><td style={{ padding: '12px 16px', color: '#555' }}>Benchmark</td></tr>)}</tbody>
                            </table>
                        </div>
                    )}
                    <div>
                        {(ghost.ai_text_block || '').split('\n').filter(Boolean).map((line, i) => {
                            if (line.startsWith('## ')) return <h2 key={i} className="dark:text-white" style={{ fontSize: '1.4rem', fontWeight: 700, margin: '2.5rem 0 .5rem', borderTop: '2px solid #e3f2fd', paddingTop: '1rem', color: 'var(--ds-text-main)' }}>{line.slice(3)}</h2>
                            if (line.startsWith('### ')) return <h3 key={i} style={{ fontSize: '1.15rem', fontWeight: 600, margin: '1.5rem 0 .3rem', color: '#2196f3' }}>{line.slice(4)}</h3>
                            if (line.startsWith('> ')) return <blockquote key={i} style={{ background: '#e3f2fd', borderLeft: '5px solid #2196f3', padding: '.7rem 1.25rem', borderRadius: '0 8px 8px 0', margin: '1.5rem 0', color: '#1565c0', fontStyle: 'italic' }}>{line.slice(2)}</blockquote>
                            if (line.startsWith('- ')) return <li key={i} style={{ marginBottom: 4, marginLeft: '1.5rem', color: 'var(--ds-text-main)', listStyle: 'disc', lineHeight: 1.7 }}>{line.slice(2)}</li>
                            return <p key={i} className="dark:text-gray-300" style={{ lineHeight: 1.8, marginBottom: '1rem', color: 'var(--ds-text-main)', fontSize: '1.05rem' }}>{line}</p>
                        })}
                        {ghost.quote_block && <blockquote style={{ background: '#e3f2fd', borderLeft: '5px solid #2196f3', padding: '.75rem 1.25rem', borderRadius: '0 8px 8px 0', margin: '2rem 0', color: '#1565c0', fontStyle: 'italic', fontSize: '1.1rem' }}>„{ghost.quote_block}"</blockquote>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fafafa', border: '1px solid #eee', padding: '14px 20px', borderRadius: 50, marginTop: '3rem' }}>
                        <img src="https://i.pravatar.cc/50" alt="Autor" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} loading="lazy" />
                        <span style={{ fontSize: '.9rem', color: '#555' }}>{ghost.author_note || 'Reviewed von KI-Redaktion & Experten-Team'}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Sortable Live Block ────────────────────────────────────────────────────────
function SortableLiveBlock({
    block, isSelected, ghost, onSelect, onRemove, builderMode,
}: {
    block: Block; isSelected: boolean; ghost: Record<string, string>
    onSelect: () => void; onRemove: () => void; builderMode?: BuilderMode
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
    const text = ghost[block.type] || ''

    const renderContent = () => {
        switch (block.type) {
            case 'h1_hero':
                return <h1 className="text-3xl font-extrabold tracking-tight leading-tight text-[#0a0a0a] dark:text-[#f0f0f0]">{text || 'H1 Hero Headline'}</h1>
            case 'hero_image':
                return <div className="w-full aspect-video rounded-xl overflow-hidden bg-white dark:bg-[#1c1c1c]">
                    {text ? <img src={text} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-black/25"><ImageIcon className="w-12 h-12" /></div>}
                </div>
            case 'intro_block':
                return <div className="bg-primary/5 border-l-4 border-primary p-5 rounded-r-2xl">
                    <p className="font-bold text-xs uppercase tracking-wide text-primary mb-2">Key Takeaways</p>
                    <p className="text-black/70 dark:text-white/40 whitespace-pre-line leading-relaxed text-sm">{text}</p>
                </div>
            case 'toc_block':
                return <div className="border border-black/5 dark:border-white/5 rounded-2xl p-5 bg-white dark:bg-[#1c1c1c]">
                    <p className="font-bold text-xs uppercase tracking-widest text-black/35 dark:text-white/40 mb-3">Inhaltsverzeichnis</p>
                    <div className="space-y-1">{[1, 2, 3].map(i => <div key={i} className="h-2.5 rounded bg-black/10 dark:bg-white/10" style={{ width: `${90 - i * 15}%` }} />)}</div>
                </div>
            case 'ai_text_block':
                return builderMode === 'template'
                    ? <div className="space-y-2">{[100, 95, 88, 100, 80].map((w, i) => <div key={i} className="h-3 rounded bg-black/8 dark:bg-white/8" style={{ width: `${w}%` }} />)}</div>
                    : <div className="space-y-3 text-sm">{(text || '').split('\n').filter(Boolean).slice(0, 6).map((l, i) => {
                        if (l.startsWith('## ')) return <h2 key={i} className="text-lg font-bold text-[#0a0a0a] dark:text-[#f0f0f0]">{l.slice(3)}</h2>
                        if (l.startsWith('> ')) return <blockquote key={i} className="border-l-3 border-primary pl-3 text-black/55 dark:text-white/40 italic">{l.slice(2)}</blockquote>
                        return <p key={i} className="text-black/65 dark:text-white/40 leading-relaxed">{l}</p>
                    })}</div>
            case 'quote_block':
                return <blockquote className="border-l-4 border-emerald-500 pl-6 py-2 italic text-xl text-black/55 dark:text-white/40">„{text}"</blockquote>
            case 'parallax_section':
                return <div className="w-full h-32 rounded-xl overflow-hidden relative flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#4c1d95,#701a75)' }}>
                    <div className="absolute inset-0 bg-black/30" />
                    <p className="relative text-white font-bold text-lg text-center px-4">{text}</p>
                </div>
            case 'card_grid': {
                const cs = text.split('|').reduce<{ title: string, body: string }[]>((a, v, i) => {
                    if (i % 2 === 0) a.push({ title: v, body: '' }); else if (a.length) a[a.length - 1].body = v; return a
                }, [])
                return <div className="grid grid-cols-2 gap-3">
                    {(cs.length > 0 ? cs : [{ title: 'Key Point 1', body: 'Beschreibung' }, { title: 'Key Point 2', body: 'Beschreibung' }]).map((c, i) => (
                        <div key={i} className="bg-white dark:bg-[#1c1c1c] border border-black/5 dark:border-white/5 rounded-xl p-4">
                            <h3 className="font-bold text-sm text-[#0a0a0a] dark:text-[#f0f0f0] mb-1">{c.title}</h3>
                            <p className="text-xs text-black/55 dark:text-white/40">{c.body}</p>
                        </div>
                    ))}
                </div>
            }
            case 'info_box':
                return <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-500/10 p-4 rounded-r-xl">
                    <strong className="block text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">Quick-Summary:</strong>
                    <p className="text-sm text-black/70 dark:text-white/40">{text}</p>
                </div>
            case 'author_note':
                return <div className="flex items-center gap-3 bg-white dark:bg-[#1c1c1c] border border-black/5 dark:border-white/5 px-4 py-3 rounded-full">
                    <img src="https://i.pravatar.cc/40" className="w-8 h-8 rounded-full" alt="" />
                    <span className="text-sm text-black/65 dark:text-white/40">{text || 'KI-Redaktion & Experten-Review'}</span>
                </div>
            case 'custom_html':
                return <div className="bg-white dark:bg-[#1c1c1c] border border-dashed border-primary/30 rounded-xl p-4 font-mono text-xs text-black/40 dark:text-white/40">&lt;custom-html /&gt;</div>
            default:
                return <div className="text-sm text-black/35 dark:text-white/40">Block: {block.type}</div>
        }
    }

    return (
        <div ref={setNodeRef} style={style}
            onClick={onSelect}
            className={`group relative rounded-2xl transition-all cursor-pointer ${isSelected ? 'ring-2 ring-primary ring-offset-2' : 'hover:ring-2 hover:ring-primary/30 hover:ring-offset-2'}`}>
            {/* Drag handle */}
            <div {...attributes} {...listeners} className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1.5 text-black/25 dark:text-white/40/30 hover:text-black/55">
                <GripVertical className="w-4 h-4" />
            </div>
            {/* Block label */}
            {isSelected && (
                <div className="absolute -top-7 left-0 flex items-center gap-2">
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{block.label}</span>
                    <button onClick={e => { e.stopPropagation(); onRemove() }} className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}
            <div className="p-1">{renderContent()}</div>
        </div>
    )
}

// ── Visual Builder Shell ───────────────────────────────────────────────────────
export function VisualBuilderShell({
    blocks, setBlocks, ghost, setGhost, visualOpts, setVisualOpts, mode, onSave, saved, onSwitchToPreview,
    title, subtitle, inline, bottomBar,
}: {
    blocks: Block[]
    setBlocks: React.Dispatch<React.SetStateAction<Block[]>>
    ghost: Record<string, string>
    setGhost?: React.Dispatch<React.SetStateAction<Record<string, string>>>
    visualOpts?: VisualOptions
    setVisualOpts?: React.Dispatch<React.SetStateAction<VisualOptions>>
    mode?: BuilderMode
    onSave?: () => void
    saved?: boolean
    onSwitchToPreview?: () => void
    title?: string
    subtitle?: string
    inline?: boolean
    bottomBar?: React.ReactNode
}) {
    const builderMode: BuilderMode = mode || 'template'
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [showAddBlock, setShowAddBlock] = useState(false)
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            setBlocks(items => {
                const oldIndex = items.findIndex(i => i.id === active.id)
                const newIndex = items.findIndex(i => i.id === over.id)
                return arrayMove(items, oldIndex, newIndex)
            })
        }
    }

    const addBlock = useCallback((type: BlockType) => {
        const tpl = BLOCK_TEMPLATES.find(b => b.type === type)
        if (!tpl) return
        const newBlock: Block = { id: Math.random().toString(36).slice(2), type, label: tpl.label, settings: {} }
        setBlocks(prev => [...prev, newBlock])
        setSelectedId(newBlock.id)
        setShowAddBlock(false)
    }, [setBlocks])

    const [showDesignPanel, setShowDesignPanel] = useState(false)
    const selectedBlock = blocks.find(b => b.id === selectedId) ?? null

    const shell = (
        <div className={inline ? 'flex flex-col h-full' : 'fixed inset-0 z-40 flex flex-col bg-[#f7f7f8] dark:bg-[#141414]'}>
            {/* Header */}
            {!inline && (
                <div className="flex items-center gap-4 px-6 py-3 border-b border-black/5 dark:border-white/5 bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl flex-shrink-0">
                    <div className="flex-1">
                        {title && <h1 className="font-bold text-sm truncate">{title}</h1>}
                        {subtitle && <p className="text-xs text-black/35 dark:text-white/40">{subtitle}</p>}
                    </div>
                    {/* Design panel toggle — only shown when setVisualOpts is wired in */}
                    {setVisualOpts && (
                        <button
                            onClick={() => { setShowDesignPanel(p => !p); setSelectedId(null) }}
                            title="Design anpassen"
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors focus:outline-none ${showDesignPanel ? 'bg-primary text-white' : 'text-black/55 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                        >
                            Design
                        </button>
                    )}
                    {onSwitchToPreview && (
                        <button onClick={onSwitchToPreview} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-black/55 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none">
                            <BookOpen className="w-4 h-4" /> Vorschau
                        </button>
                    )}
                    {onSave && (
                        <button onClick={onSave} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all focus:outline-none ${saved ? 'bg-primary/10 text-primary' : 'text-black/55 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                            <Save className="w-4 h-4" /> {saved ? 'Gespeichert ✓' : 'Speichern'}
                        </button>
                    )}
                </div>
            )}

            {/* Two-pane: canvas + settings */}
            <div className="flex flex-1 overflow-hidden">
                {/* Canvas */}
                <div className="flex-1 overflow-y-auto px-10 py-8">
                    <div className="max-w-[780px] mx-auto pl-8">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-8">
                                    {blocks.map(block => (
                                        <SortableLiveBlock
                                            key={block.id}
                                            block={block}
                                            isSelected={selectedId === block.id}
                                            ghost={ghost}
                                            onSelect={() => setSelectedId(block.id)}
                                            onRemove={() => {
                                                setBlocks(prev => prev.filter(b => b.id !== block.id))
                                                setSelectedId(null)
                                            }}
                                            builderMode={builderMode}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>

                        {/* Add block */}
                        {builderMode === 'template' && (
                            <div className="mt-8">
                                {showAddBlock ? (
                                    <div className="border-2 border-dashed border-primary/30 rounded-2xl p-4">
                                        <div className="text-xs font-bold uppercase tracking-widest text-black/35 dark:text-white/40 mb-3">Block hinzufügen</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {BLOCK_TEMPLATES.map(bt => (
                                                <button key={bt.type} onClick={() => addBlock(bt.type)}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left hover:bg-primary/10 hover:text-primary transition-colors focus:outline-none">
                                                    <bt.Icon className="w-4 h-4 flex-shrink-0" />
                                                    <span>{bt.label}</span>
                                                    {bt.isAI && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">KI</span>}
                                                </button>
                                            ))}
                                        </div>
                                        <button onClick={() => setShowAddBlock(false)} className="mt-3 text-xs text-black/35 dark:text-white/40 hover:text-black/55 focus:outline-none">Abbrechen</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowAddBlock(true)}
                                        className="w-full border-2 border-dashed border-black/10 dark:border-white/10 rounded-2xl py-4 text-sm text-black/35 dark:text-white/40 hover:border-primary/40 hover:text-primary transition-all focus:outline-none">
                                        + Block hinzufügen
                                    </button>
                                )}
                            </div>
                        )}
                        {bottomBar && <div className="mt-6">{bottomBar}</div>}
                    </div>
                </div>

                {/* Settings sidebar — block or design panel */}
                {(selectedBlock || showDesignPanel) && (
                    <div className="w-72 flex-shrink-0 border-l border-black/5 dark:border-white/5 overflow-y-auto p-5">
                        {showDesignPanel && setVisualOpts ? (
                            // ── Global Design Panel ───────────────────────────
                            (() => {
                                const S = (visualOpts?.style || {}) as Record<string, string>
                                const upd = (key: string, val: string) =>
                                    setVisualOpts!(o => ({ ...o, style: { ...(o.style || {}), [key]: val } }))
                                const ColorRow = ({ label, k, def }: { label: string, k: string, def: string }) => (
                                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }}>
                                        <span style={{ fontSize: '.8rem', color: 'var(--ds-text-dimmed)' }}>{label}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <input type="color" value={S[k] || def} onChange={e => upd(k, e.target.value)}
                                                style={{ width: 32, height: 32, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'transparent' }} />
                                            <span style={{ fontSize: '.7rem', fontFamily: 'monospace', color: 'var(--ds-text-dimmed)' }}>{S[k] || def}</span>
                                        </div>
                                    </label>
                                )
                                return (
                                    <>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-bold text-sm flex items-center gap-2">Globales Design</h3>
                                            <button onClick={() => setShowDesignPanel(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"><X className="w-4 h-4" /></button>
                                        </div>
                                        <p className="text-xs text-black/35 dark:text-white/40 mb-4">Änderungen sofort in der Vorschau sichtbar.</p>
                                        <div className="space-y-3">
                                            <ColorRow label="Brand Primary" k="brand_primary" def="#007AFF" />
                                            <ColorRow label="Primary Hover" k="primary_hover" def="#005bb5" />
                                            <ColorRow label="Hintergrund (Body)" k="bg_body" def="#ffffff" />
                                            <ColorRow label="Panel / Sidebar" k="bg_panel" def="#f5f5f7" />
                                            <ColorRow label="Text (Primär)" k="text_main" def="#1d1d1f" />
                                            <ColorRow label="Text (Gedimmt)" k="text_dimmed" def="#86868b" />
                                            <ColorRow label="Rahmenfarbe" k="border_color" def="#d2d2d7" />
                                        </div>
                                    </>
                                )
                            })()

                        ) : selectedBlock ? (
                            // ── Block info panel ────────────────────────────
                            <>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-sm flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" /> {selectedBlock.label}</h3>
                                    <button onClick={() => setSelectedId(null)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"><X className="w-4 h-4" /></button>
                                </div>
                                <div className="space-y-4 text-sm text-black/55 dark:text-white/40">
                                    <p>Block-ID: <span className="font-mono text-xs">{selectedBlock.id.slice(0, 8)}</span></p>
                                    <p>Typ: <span className="font-semibold text-[#0a0a0a] dark:text-[#f0f0f0]">{selectedBlock.type}</span></p>
                                </div>
                            </>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    )

    return shell
}

// ── Template Presets ───────────────────────────────────────────────────────────
interface TemplatePreset {
    id: string
    name: string
    category: string
    description: string
    schema: string
    blocks: BlockType[]
}

const TEMPLATES: TemplatePreset[] = [
    {
        id: 'authority-seo',
        name: 'Authority SEO',
        category: 'Schema 1 — The Authority',
        description: 'Sticky TOC, Progress Bar, Key Takeaways. Maximale Lesbarkeit.',
        schema: 'authority',
        blocks: ['hero_image', 'h1_hero', 'intro_block', 'toc_block', 'ai_text_block', 'quote_block'],
    },
    {
        id: 'authority-howto',
        name: 'How-To Guide',
        category: 'Schema 1 — The Authority',
        description: 'Strukturierter Step-by-Step Artikel mit TOC und Quotes.',
        schema: 'authority',
        blocks: ['h1_hero', 'intro_block', 'ai_text_block', 'quote_block'],
    },
    {
        id: 'immersive-story',
        name: 'Story-Driven',
        category: 'Schema 2 — The Immersive',
        description: 'Dunkles Thema, Parallax Intro, Card Grid für Key Points.',
        schema: 'immersive',
        blocks: ['h1_hero', 'parallax_section', 'intro_block', 'card_grid', 'ai_text_block', 'quote_block'],
    },
    {
        id: 'immersive-showcase',
        name: 'Product Showcase',
        category: 'Schema 2 — The Immersive',
        description: 'Hero-Bild, Feature Cards, scrollytelling Inhalt.',
        schema: 'immersive',
        blocks: ['hero_image', 'h1_hero', 'card_grid', 'ai_text_block'],
    },
    {
        id: 'datahub-research',
        name: 'Research Report',
        category: 'Schema 3 — The Data Hub',
        description: 'Info-Box, Vergleichstabelle, Autor-Notiz. Für datengetriebene Artikel.',
        schema: 'datahub',
        blocks: ['info_box', 'h1_hero', 'intro_block', 'ai_text_block', 'quote_block', 'author_note'],
    },
    {
        id: 'datahub-comparison',
        name: 'Produkt-Vergleich',
        category: 'Schema 3 — The Data Hub',
        description: 'Quick Summary-Box, Card Grid, Tabelle, Fazit.',
        schema: 'datahub',
        blocks: ['info_box', 'h1_hero', 'card_grid', 'ai_text_block', 'author_note'],
    },
]

// ── LAYOUT_BLOCKS maps site template → default block list ─────────────────────
const LAYOUT_BLOCKS: Record<string, BlockType[]> = {
    authority: ['hero_image', 'h1_hero', 'intro_block', 'toc_block', 'ai_text_block', 'quote_block'],
    immersive: ['h1_hero', 'parallax_section', 'intro_block', 'card_grid', 'ai_text_block', 'quote_block'],
    datahub: ['info_box', 'h1_hero', 'intro_block', 'ai_text_block', 'author_note'],
    editorial: ['hero_image', 'h1_hero', 'intro_block', 'ai_text_block', 'quote_block'],
    magazine: ['h1_hero', 'intro_block', 'toc_block', 'ai_text_block', 'quote_block'],
    minimal: ['h1_hero', 'intro_block', 'ai_text_block'],
}

function makeBlocks(types: BlockType[]): Block[] {
    return types.map(type => {
        const tpl = BLOCK_TEMPLATES.find(b => b.type === type)!
        return { id: Math.random().toString(36).slice(2), type, label: tpl?.label ?? type, settings: {} }
    })
}

// ── Editable Authority Layout (Elementor-Style) ────────────────────────────────
function EditableAuthorityLayout({
    ghost, setGhost, visualOpts, setVisualOpts, activeTemplate, onTemplateChange, onSave, saved, onBack,
}: {
    ghost: Record<string, string>
    setGhost: React.Dispatch<React.SetStateAction<Record<string, string>>>
    visualOpts: VisualOptions
    setVisualOpts: React.Dispatch<React.SetStateAction<VisualOptions>>
    activeTemplate: string
    onTemplateChange: () => void
    onSave?: () => void
    saved?: boolean
    onBack: () => void
}) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [progress, setProgress] = useState(0)
    const [hovered, setHovered] = useState<string | null>(null)
    const [activePanel, setActivePanel] = useState<string | null>(null)
    const [dsTab, setDsTab] = useState<'colors' | 'typo' | 'layout' | 'advanced'>('colors')

    const handleScroll = () => {
        const el = scrollRef.current; if (!el) return
        const max = el.scrollHeight - el.clientHeight
        setProgress(max > 0 ? Math.round((el.scrollTop / max) * 100) : 0)
    }

    const sections = (ghost.ai_text_block || '').split('\n').reduce<{ heading: string; body: string[] }[]>((acc, line) => {
        if (line.startsWith('## ')) { acc.push({ heading: line.slice(3), body: [] }) }
        else if (acc.length > 0) { acc[acc.length - 1].body.push(line) }
        return acc
    }, [])

    const headings = sections.map(s => s.heading)

    const rebuildContent = (secs: typeof sections) =>
        secs.map(s => `## ${s.heading}\n\n${s.body.join('\n')}`).join('\n\n')

    const addSection = () => {
        const newSections = [...sections, { heading: 'Neuer Abschnitt', body: ['Inhalt hier einfügen.'] }]
        setGhost(g => ({ ...g, ai_text_block: rebuildContent(newSections) }))
        setActivePanel(`section-${newSections.length - 1}`)
    }

    const deleteSection = (idx: number, e: React.MouseEvent) => {
        e.stopPropagation()
        const newS = sections.filter((_, i) => i !== idx)
        setGhost(g => ({ ...g, ai_text_block: rebuildContent(newS) }))
        if (activePanel === `section-${idx}`) setActivePanel(null)
    }

    const EditWrap = ({ id, children, style }: { id: string; children: React.ReactNode; style?: React.CSSProperties }) => (
        <div
            style={{ position: 'relative', outline: hovered === id || activePanel === id ? '2px solid #007AFF' : '2px solid transparent', borderRadius: 'calc(var(--ds-radius-ui) / 2)', transition: 'outline .15s', cursor: 'pointer', ...style }}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
            onClick={e => { e.stopPropagation(); setActivePanel(p => p === id ? null : id) }}
        >
            {(hovered === id || activePanel === id) && (
                <div style={{ position: 'absolute', top: -26, left: 0, zIndex: 1000, background: 'var(--ds-brand-primary)', color: 'var(--ds-bg-body)', fontSize: '.68rem', fontWeight: 700, padding: '3px 10px', borderRadius: '6px 6px 0 0', whiteSpace: 'nowrap', fontFamily: 'Inter,sans-serif', letterSpacing: '.04em', pointerEvents: 'none' }}>✎ Bearbeiten</div>
            )}
            {children}
        </div>
    )

    const FloatLabel = ({ text }: { text: string }) => (
        <label style={{ display: 'block', fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ds-text-dimmed)', marginBottom: 6, letterSpacing: '.05em' }}>{text}</label>
    )
    const FieldInput = ({ fieldKey }: { fieldKey: string }) => (
        <input type="text" value={ghost[fieldKey] || ''} onChange={e => setGhost(g => ({ ...g, [fieldKey]: e.target.value }))} onClick={e => e.stopPropagation()}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', border: '1px solid var(--ds-border-color)', fontSize: '.9rem', fontFamily: 'Inter,sans-serif', color: 'var(--ds-text-main)', outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
    )
    const FieldTextarea = ({ fieldKey, rows = 4 }: { fieldKey: string; rows?: number }) => (
        <textarea rows={rows} value={ghost[fieldKey] || ''} onChange={e => setGhost(g => ({ ...g, [fieldKey]: e.target.value }))} onClick={e => e.stopPropagation()}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', border: '1px solid var(--ds-border-color)', fontSize: '.9rem', lineHeight: 1.6, resize: 'vertical', fontFamily: 'Inter,sans-serif', color: 'var(--ds-text-main)', outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
    )

    const SelectInput = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) => (
        <div style={{ marginBottom: 16 }}>
            <FloatLabel text={label} />
            <select value={value} onChange={e => { e.stopPropagation(); onChange(e.target.value) }} onClick={e => e.stopPropagation()}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', border: '1px solid var(--ds-border-color)', fontSize: '.9rem', fontFamily: 'Inter,sans-serif', color: 'var(--ds-text-main)', outline: 'none', background: 'var(--ds-bg-body)' }}>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    )

    const ToggleInput = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) => (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, cursor: 'pointer', fontSize: '.9rem', fontWeight: 600 }}>
            {label}
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} onClick={e => e.stopPropagation()} style={{ width: 18, height: 18, cursor: 'pointer' }} />
        </label>
    )

    const RangeInput = ({ label, value, onChange, min, max, unit = '' }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; unit?: string }) => (
        <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><FloatLabel text={label} /><span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--ds-brand-primary)' }}>{value}{unit}</span></div>
            <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} onClick={e => e.stopPropagation()} style={{ width: '100%' }} />
        </div>
    )

    const ColorInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
        <div style={{ marginBottom: 16 }}>
            <FloatLabel text={label} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'calc(var(--ds-radius-ui) / 2)', overflow: 'hidden', border: '1px solid var(--ds-border-color)', flexShrink: 0 }}>
                    <input type="color" value={value || 'var(--ds-bg-body)'} onChange={e => onChange(e.target.value)} onClick={e => e.stopPropagation()} style={{ width: '150%', height: '150%', margin: '-25%', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }} />
                </div>
                <input type="text" value={value || ''} placeholder="Standardwert" onChange={e => onChange(e.target.value)} onClick={e => e.stopPropagation()} style={{ flex: 1, padding: '10px 12px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', border: '1px solid var(--ds-border-color)', fontSize: '.9rem', fontFamily: 'monospace', color: 'var(--ds-text-main)', outline: 'none', minWidth: 0, background: 'var(--ds-bg-body)' }} />
            </div>
        </div>
    )

    const ThemeEditor = ({ label = "Farbpalette (Theme)", theme, onChange }: { label?: string, theme?: any, onChange: (t: any) => void }) => {
        const t = theme || {}
        return (
            <div style={{ marginBottom: 24, padding: '16px', background: 'var(--ds-bg-panel)', borderRadius: 'var(--ds-radius-ui)', border: '1px solid var(--ds-border-color)' }}>
                <h5 style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--ds-text-main)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Palette className="w-4 h-4" /> {label}</h5>
                <ColorInput label="Wichtigste Aktion (Primary)" value={t.primary || ''} onChange={v => onChange({ ...t, primary: v })} />
                <ColorInput label="Papier/Hintergrund (Body)" value={t.bg_body || ''} onChange={v => onChange({ ...t, bg_body: v })} />
                <ColorInput label="Karten/Sidebar (Oberfläche)" value={t.bg_sidebar || ''} onChange={v => onChange({ ...t, bg_sidebar: v })} />
                <ColorInput label="Haupttext (Dark)" value={t.text_main || ''} onChange={v => onChange({ ...t, text_main: v })} />
                <ColorInput label="Rahmen & Linien" value={t.border || ''} onChange={v => onChange({ ...t, border: v })} />
            </div>
        )
    }

    const renderPanel = () => {
        if (!activePanel) return null

        const PanelSection = ({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) => (
            <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid var(--ds-border-color)' }}>
                <h4 style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ds-text-dimmed)', marginBottom: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {icon && <span>{icon}</span>}{title}
                </h4>
                {children}
            </div>
        )

        const Divider = () => <div style={{ height: 1, background: 'var(--ds-border-color)', margin: '20px 0' }} />

        // ── GLOBAL: 4-Tab DesignSystemPanel ──────────────────────────────────
        if (activePanel === 'global') {
            const prog = visualOpts.progress_engine || {}
            const S = visualOpts.style || {}
            const L = visualOpts.layout || {}
            const ADV = visualOpts.advanced || {}

            const tabStyle = (active: boolean) => ({
                flex: 1, padding: '7px 2px', fontSize: '.75rem', fontWeight: 700,
                cursor: 'pointer', background: active ? 'var(--ds-brand-primary)' : 'transparent',
                color: active ? '#fff' : 'var(--ds-text-dimmed)',
                border: 'none', borderRadius: 8, fontFamily: 'inherit', transition: 'var(--ds-transition-fast)',
            })

            return (
                <>
                    {/* Tab switcher */}
                    <div style={{ display: 'flex', gap: 4, background: 'var(--ds-bg-panel)', borderRadius: 'calc(var(--ds-radius-ui) / 2)', padding: 4, marginBottom: 20 }}>
                        {(['colors', 'typo', 'layout', 'advanced'] as const).map(t => (
                            <button key={t} style={tabStyle(dsTab === t)} onClick={e => { e.stopPropagation(); setDsTab(t) }}>
                                {t === 'colors' ? 'Farben' : t === 'typo' ? 'Typo' : t === 'layout' ? 'Layout' : 'Advanced'}
                            </button>
                        ))}
                    </div>

                    {dsTab === 'colors' && (
                        <>
                            <PanelSection title="Haupt-Farben" icon="🔵">
                                <ColorInput label="Primary (Aktionen)" value={S.brand_primary || '#007AFF'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, brand_primary: v } }))} />
                                <ColorInput label="Primary Hover" value={S.primary_hover || '#005bb5'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, primary_hover: v } }))} />
                                <ColorInput label="Hintergrund (Body)" value={S.bg_body || '#ffffff'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, bg_body: v } }))} />
                                <ColorInput label="Panel / Sidebar (Sec)" value={S.bg_panel || '#f5f5f7'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, bg_panel: v } }))} />
                                <ColorInput label="Karten-Hintergrund" value={S.bg_card || '#ffffff'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, bg_card: v } }))} />
                            </PanelSection>
                            <PanelSection title="Text-Farben" icon="✏️">
                                <ColorInput label="Text Primär (Überschriften)" value={S.text_main || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, text_main: v } }))} />
                                <ColorInput label="Text Body (Fließtext)" value={S.text_dimmed || '#424245'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, text_dimmed: v } }))} />
                                <ColorInput label="Text Muted (Breadcrumbs/Meta)" value={S.text_muted || '#86868b'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, text_muted: v } }))} />
                            </PanelSection>
                            <PanelSection title="Rahmen & Schatten" icon="🔲">
                                <ColorInput label="Rahmenfarbe (Haupt)" value={S.border_color || '#d2d2d7'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, border_color: v } }))} />
                                <ColorInput label="Rahmenfarbe (Light)" value={S.border_color_light || '#e5e5e7'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, border_color_light: v } }))} />
                                <SelectInput label="Schatten-Preset" value={S.shadow_elevation || 'default'} onChange={v => {
                                    const map: Record<string, string> = {
                                        none: 'none',
                                        default: '0 10px 30px rgba(0,0,0,0.05)',
                                        medium: '0 20px 40px rgba(0,0,0,0.08)',
                                        strong: '0 30px 60px rgba(0,0,0,0.18)',
                                        brutal: '4px 4px 0px rgba(0,0,0,1)',
                                    }
                                    setVisualOpts(o => ({ ...o, style: { ...S, shadow_elevation: map[v] || v } }))
                                }} options={[{ label: 'Subtil (Standard)', value: 'default' }, { label: 'Medium', value: 'medium' }, { label: 'Kein Schatten', value: 'none' }, { label: 'Tief (Strong)', value: 'strong' }, { label: 'Brutal (Flat)', value: 'brutal' }]} />
                            </PanelSection>
                            {/* Blockquote Preview */}
                            {(() => {
                                const cData = visualOpts.insight_engine || {}
                                return (
                                    <PanelSection title="Zitat-Block (Blockquote)" icon="❝">
                                        <ColorInput label="Vertikale Linie" value={cData.quote_line_color || '#007AFF'} onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, quote_line_color: v } }))} />
                                        <ColorInput label="Zitat-Textfarbe" value={cData.quote_text_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, quote_text_color: v } }))} />
                                        <ColorInput label="Zitat-Hintergrund" value={cData.quote_bg || 'rgba(0,0,0,0)'} onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, quote_bg: v } }))} />
                                        <blockquote style={{ margin: '10px 0 0', padding: '8px 0 8px 20px', borderLeft: `4px solid ${cData.quote_line_color || '#007AFF'}`, fontStyle: 'italic', fontSize: '.88rem', color: cData.quote_text_color || 'var(--ds-text-main)', background: cData.quote_bg || 'transparent', borderRadius: '0 10px 10px 0', lineHeight: 1.55 }}>
                                            „Die Technologie soll den Menschen nicht ersetzen."
                                        </blockquote>
                                    </PanelSection>
                                )
                            })()}
                        </>
                    )}

                    {dsTab === 'typo' && (
                        <>
                            <PanelSection title="Schrift-Familie" icon="">
                                <SelectInput label="Font-Family" value={S.font_family || 'inter'} onChange={v => {
                                    const map: Record<string, string> = {
                                        inter: "'Inter',-apple-system,sans-serif",
                                        merriweather: "'Merriweather',Georgia,serif",
                                        mono: "'JetBrains Mono','Fira Code',monospace",
                                        playfair: "'Playfair Display',serif",
                                        lora: "'Lora',serif",
                                    }
                                    setVisualOpts(o => ({ ...o, style: { ...S, font_family: map[v] || v } }))
                                }} options={[{ label: 'Inter (System)', value: 'inter' }, { label: 'Merriweather (Serif)', value: 'merriweather' }, { label: 'Playfair Display', value: 'playfair' }, { label: 'Lora', value: 'lora' }, { label: 'JetBrains Mono', value: 'mono' }]} />
                            </PanelSection>
                            <PanelSection title="Schrift-Größen (--ds-text-*)" icon="📏">
                                <SelectInput label="H1 Größe (--ds-text-h1)" value={S.h1_size || '3.5rem'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, h1_size: v } }))} options={[{ label: '2.5rem (Klein)', value: '2.5rem' }, { label: '3rem', value: '3rem' }, { label: '3.5rem (Standard)', value: '3.5rem' }, { label: '4rem (Groß)', value: '4rem' }, { label: '5rem (Huge)', value: '5rem' }]} />
                                <SelectInput label="H2 Größe (--ds-text-h2)" value={S.h2_size || '1.9rem'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, h2_size: v } }))} options={[{ label: '1.5rem (Klein)', value: '1.5rem' }, { label: '1.7rem', value: '1.7rem' }, { label: '1.9rem (Standard)', value: '1.9rem' }, { label: '2.2rem', value: '2.2rem' }, { label: '2.8rem (Groß)', value: '2.8rem' }]} />
                                <SelectInput label="Body-Large (--ds-text-body-large)" value={S.body_large_size || '1.25rem'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, body_large_size: v } }))} options={[{ label: '1.1rem', value: '1.1rem' }, { label: '1.25rem (Standard)', value: '1.25rem' }, { label: '1.4rem', value: '1.4rem' }]} />
                                <SelectInput label="Body (--ds-text-body)" value={S.body_size || '1.1rem'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, body_size: v } }))} options={[{ label: '0.95rem (Kompakt)', value: '0.95rem' }, { label: '1rem', value: '1rem' }, { label: '1.1rem (Standard)', value: '1.1rem' }, { label: '1.2rem', value: '1.2rem' }, { label: '1.3rem (Groß)', value: '1.3rem' }]} />
                                <SelectInput label="Small (--ds-text-small)" value={S.small_size || '0.85rem'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, small_size: v } }))} options={[{ label: '0.75rem', value: '0.75rem' }, { label: '0.8rem', value: '0.8rem' }, { label: '0.85rem (Standard)', value: '0.85rem' }, { label: '0.9rem', value: '0.9rem' }]} />
                            </PanelSection>
                            <PanelSection title="Lese-Komfort" icon="📖">
                                <SelectInput label="Zeilenhöhe" value={S.line_height || '1.65'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, line_height: v } }))} options={[{ label: '1.4 (Kompakt)', value: '1.4' }, { label: '1.6', value: '1.6' }, { label: '1.65 (Standard)', value: '1.65' }, { label: '1.8', value: '1.8' }, { label: '1.9 (Luftig)', value: '1.9' }]} />
                                <SelectInput label="Letter-Spacing" value={S.letter_spacing || '-0.02em'} onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, letter_spacing: v } }))} options={[{ label: '0 (Normal)', value: '0' }, { label: '-0.02em (Tight)', value: '-0.02em' }, { label: '-0.04em (Sehr Tight)', value: '-0.04em' }, { label: '0.04em (Wide)', value: '0.04em' }]} />
                            </PanelSection>
                        </>
                    )}

                    {dsTab === 'layout' && (
                        <>
                            <PanelSection title="Container & Spalten" icon="">
                                <SelectInput label="Container-Breite (--ds-container-width)" value={L.container_width || '1400px'} onChange={v => setVisualOpts(o => ({ ...o, layout: { ...L, container_width: v } }))} options={[{ label: '960px (Schmal)', value: '960px' }, { label: '1200px (Medium)', value: '1200px' }, { label: '1400px (Standard)', value: '1400px' }, { label: '1600px (Wide)', value: '1600px' }, { label: '1800px (Full Wide)', value: '1800px' }]} />
                                <RangeInput label="Linke Sidebar (--ds-sidebar-width-left)" value={parseInt(L.sidebar_width || '280')} min={160} max={400} unit="px" onChange={v => setVisualOpts(o => ({ ...o, layout: { ...L, sidebar_width: `${v}px` } }))} />
                                <RangeInput label="Rechte Sidebar (--ds-sidebar-width-right)" value={parseInt(L.action_width || '240')} min={140} max={360} unit="px" onChange={v => setVisualOpts(o => ({ ...o, layout: { ...L, action_width: `${v}px` } }))} />
                            </PanelSection>
                            <PanelSection title="Border-Radius (--ds-radius-*)" icon="🔲">
                                <RangeInput label="Radius SM (Buttons)" value={parseInt(S.radius_sm || '8')} min={0} max={24} unit="px" onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, radius_sm: `${v}px` } }))} />
                                <RangeInput label="Radius MD (Inputs/CTA)" value={parseInt(S.radius_md || '12')} min={0} max={32} unit="px" onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, radius_md: `${v}px` } }))} />
                                <RangeInput label="Radius LG (Cards)" value={parseInt(S.radius_lg || '14')} min={0} max={40} unit="px" onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, radius_lg: `${v}px` } }))} />
                                <RangeInput label="Radius XL (TOC/Author)" value={parseInt(S.radius_xl || S.radius_ui || '16')} min={0} max={48} unit="px" onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, radius_xl: `${v}px`, radius_ui: `${v}px` } }))} />
                            </PanelSection>
                            <PanelSection title="Abstände (--ds-spacing-*)" icon="↕️">
                                <RangeInput label="Spacing XS (10px default)" value={parseInt(S.spacing_xs || '10')} min={4} max={30} unit="px" onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, spacing_xs: `${v}px` } }))} />
                                <RangeInput label="Spacing SM (20px default)" value={parseInt(S.spacing_sm || '20')} min={8} max={50} unit="px" onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, spacing_sm: `${v}px` } }))} />
                                <RangeInput label="Spacing MD (30px default)" value={parseInt(S.spacing_md || '30')} min={12} max={80} unit="px" onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, spacing_md: `${v}px` } }))} />
                                <RangeInput label="Spacing LG (40px default)" value={parseInt(S.spacing_lg || '40')} min={16} max={100} unit="px" onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, spacing_lg: `${v}px` } }))} />
                                <RangeInput label="Spacing XL (60px default)" value={parseInt(S.spacing_xl || '60')} min={20} max={160} unit="px" onChange={v => setVisualOpts(o => ({ ...o, style: { ...S, spacing_xl: `${v}px` } }))} />
                            </PanelSection>
                        </>
                    )}

                    {dsTab === 'advanced' && (
                        <>
                            <PanelSection title="Animationen" icon="">
                                <SelectInput label="Transition-Speed (--ds-transition-speed)" value={ADV.transition_speed || 'default'} onChange={v => {
                                    const map: Record<string, string> = {
                                        instant: '0s',
                                        default: '0.3s',
                                        slow: '0.6s',
                                        bouncy: '0.5s cubic-bezier(0.34,1.56,0.64,1)',
                                    }
                                    setVisualOpts(o => ({ ...o, advanced: { ...ADV, transition_speed: map[v] || v } }))
                                }} options={[{ label: 'Standard (0.3s)', value: 'default' }, { label: 'Sofort (0s)', value: 'instant' }, { label: 'Langsam (0.6s)', value: 'slow' }, { label: 'Bouncy (Spring)', value: 'bouncy' }]} />
                            </PanelSection>
                            <PanelSection title="Custom CSS Injector" icon="💉">
                                <FloatLabel text="Custom CSS (wird live in Preview injiziert)" />
                                <textarea value={ADV.custom_css || ''} onChange={e => setVisualOpts(o => ({ ...o, advanced: { ...ADV, custom_css: e.target.value } }))}
                                    placeholder=".ds-hero { background: linear-gradient(135deg, #667eea, #764ba2); }" rows={7} onClick={e => e.stopPropagation()}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', border: '1px solid var(--ds-border-color)', fontSize: '.82rem', fontFamily: 'monospace', color: 'var(--ds-text-main)', outline: 'none', background: 'var(--ds-bg-panel)', resize: 'vertical', lineHeight: 1.6 }} />
                                <p style={{ fontSize: '.72rem', color: 'var(--ds-text-dimmed)', marginTop: 6 }}>Alle <code>.ds-</code> Klassen können hier überschrieben werden.</p>
                            </PanelSection>
                            <PanelSection title="Lese-Fortschrittsbalken" icon="">
                                <ToggleInput label="Aktiviert" checked={prog.enabled ?? true} onChange={v => setVisualOpts(o => ({ ...o, progress_engine: { ...prog, enabled: v } }))} />
                                <SelectInput label="Stil" value={prog.style || 'solid'} onChange={v => setVisualOpts(o => ({ ...o, progress_engine: { ...prog, style: v } }))} options={[{ label: 'Solid', value: 'solid' }, { label: 'Rainbow Gradient', value: 'rainbow' }]} />
                                <RangeInput label="Liniendicke" value={prog.thickness || 4} min={1} max={12} unit="px" onChange={v => setVisualOpts(o => ({ ...o, progress_engine: { ...prog, thickness: v } }))} />
                                <SelectInput label="Position" value={prog.position || 'top'} onChange={v => setVisualOpts(o => ({ ...o, progress_engine: { ...prog, position: v } }))} options={[{ label: 'Oben', value: 'top' }, { label: 'Unten', value: 'bottom' }]} />
                                <ToggleInput label="Neon Glow" checked={prog.glow || false} onChange={v => setVisualOpts(o => ({ ...o, progress_engine: { ...prog, glow: v } }))} />
                            </PanelSection>
                        </>
                    )}

                </>
            )
        }
        if (activePanel === 'hero') {
            const heroData = visualOpts.master_hero || {}
            return (
                <>
                    <PanelSection title="Hero Interface" icon="🦸">
                        <FloatLabel text="Haupttitel (H1)" />
                        <FieldInput fieldKey="h1_hero" />
                        <FloatLabel text="Intro-Text" />
                        <FieldTextarea fieldKey="intro_block" rows={3} />
                        <Divider />
                        <ToggleInput label="Parallax Scrolling" checked={heroData.parallax || false} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, parallax: v } }))} />
                        <RangeInput label="Backdrop-Blur" value={heroData.blur_intensity || 0} min={0} max={20} unit="px" onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, blur_intensity: v } }))} />
                        <RangeInput label="Karten-Rotation" value={heroData.card_rotation || 3} min={0} max={15} unit="deg" onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, card_rotation: v } }))} />
                    </PanelSection>
                    <PanelSection title="Hero-Karten Farben" icon="🃏">
                        <ColorInput label="Karten-Hintergrund" value={heroData.card_bg || '#ffffff'} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, card_bg: v } }))} />
                        <ColorInput label="Label-Farbe (ZUSAMMENFASSUNG…)" value={heroData.card_label_color || '#007AFF'} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, card_label_color: v } }))} />
                        <ColorInput label="Titel-Farbe" value={heroData.card_title_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, card_title_color: v } }))} />
                        <Divider />
                        <FloatLabel text={'Link-Text (Standard: "Inhalt anzeigen")'} />
                        <input type="text" value={heroData.card_link_text || ''} onClick={e => e.stopPropagation()}
                            onChange={e => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, card_link_text: e.target.value } }))}
                            placeholder="Inhalt anzeigen"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', border: '1px solid var(--ds-border-color)', fontSize: '.9rem', fontFamily: 'Inter,sans-serif', color: 'var(--ds-text-main)', outline: 'none', marginBottom: 16, boxSizing: 'border-box', background: 'var(--ds-bg-body)' }} />
                        <ColorInput label="Link-Farbe" value={heroData.card_link_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, card_link_color: v } }))} />
                    </PanelSection>
                    <PanelSection title="Hero Farben" icon="">
                        <ColorInput label="Abschnitt-Hintergrund" value={heroData.section_bg || '#f5f5f7'} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, section_bg: v } }))} />
                        <ColorInput label="H1-Titelfarbe" value={heroData.h1_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, h1_color: v } }))} />
                        <ColorInput label="Intro-Textfarbe" value={heroData.intro_color || '#86868b'} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, intro_color: v } }))} />
                        <Divider />
                        <ColorInput label="Primär-Button: Hintergrund" value={heroData.btn_primary_bg || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, btn_primary_bg: v } }))} />
                        <ColorInput label="Primär-Button: Textfarbe" value={heroData.btn_primary_text || '#ffffff'} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, btn_primary_text: v } }))} />
                        <ColorInput label="Sekundär-Link: Farbe" value={heroData.btn_secondary_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, master_hero: { ...heroData, btn_secondary_color: v } }))} />
                    </PanelSection>
                </>
            )
        }

        if (activePanel === 'meta') {
            const mData = visualOpts.meta_strip || {}
            return (
                <>
                    <PanelSection title="Content Meta Strip" icon="👤">
                        <FloatLabel text="Autor-Name" />
                        <FieldInput fieldKey="author_name" />
                        <FloatLabel text="Prüfer-Name" />
                        <FieldInput fieldKey="reviewer_name" />
                        <Divider />
                        <SelectInput label="Desktop Layout" value={mData.layout || 'horizontal'} onChange={v => setVisualOpts(o => ({ ...o, meta_strip: { ...mData, layout: v } }))} options={[{ label: 'Horizontal', value: 'horizontal' }, { label: 'Stacked', value: 'stacked' }]} />
                        <SelectInput label="Avatar Form" value={mData.avatar_shape || 'circle'} onChange={v => setVisualOpts(o => ({ ...o, meta_strip: { ...mData, avatar_shape: v } }))} options={[{ label: 'Kreis', value: 'circle' }, { label: 'Eckig', value: 'rounded' }]} />
                    </PanelSection>
                    <PanelSection title="Meta Farben" icon="">
                        <ColorInput label="Hintergrundfarbe" value={mData.bg || '#f5f5f7'} onChange={v => setVisualOpts(o => ({ ...o, meta_strip: { ...mData, bg: v } }))} />
                        <ColorInput label="Rollentext (\u201eInhalt von\u201c)" value={mData.role_color || '#86868b'} onChange={v => setVisualOpts(o => ({ ...o, meta_strip: { ...mData, role_color: v } }))} />
                        <ColorInput label="Namenstext (Autor)" value={mData.name_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, meta_strip: { ...mData, name_color: v } }))} />
                    </PanelSection>
                </>
            )
        }

        if (activePanel === 'tree') {
            const tData = visualOpts.topic_tree || {}
            return (
                <>
                    <PanelSection title="Sidebar Topic Tree" icon="🌲">
                        <SelectInput label="Tiefe" value={tData.hierarchy_size || 'h2'} onChange={v => setVisualOpts(o => ({ ...o, topic_tree: { ...tData, hierarchy_size: v } }))} options={[{ label: 'Nur H2', value: 'h2' }, { label: 'H2 & H3', value: 'h2h3' }]} />
                        <SelectInput label="Indikator" value={tData.indicator || 'line'} onChange={v => setVisualOpts(o => ({ ...o, topic_tree: { ...tData, indicator: v } }))} options={[{ label: 'Linie', value: 'line' }, { label: 'Punkt', value: 'dot' }]} />
                        <ToggleInput label="Mobile ausblenden" checked={tData.hide_mobile ?? true} onChange={v => setVisualOpts(o => ({ ...o, topic_tree: { ...tData, hide_mobile: v } }))} />
                    </PanelSection>
                    <PanelSection title="Tree Farben" icon="">
                        <ColorInput label="Hintergrundfarbe" value={tData.bg || '#f5f5f7'} onChange={v => setVisualOpts(o => ({ ...o, topic_tree: { ...tData, bg: v } }))} />
                        <ColorInput label="Textfarbe (Metadaten)" value={tData.text_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, topic_tree: { ...tData, text_color: v } }))} />
                        <ColorInput label="Link-Farbe (Kapitel)" value={tData.link_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, topic_tree: { ...tData, link_color: v } }))} />
                        <ColorInput label="Indikator-Linie" value={tData.indicator_color || '#d2d2d7'} onChange={v => setVisualOpts(o => ({ ...o, topic_tree: { ...tData, indicator_color: v } }))} />
                    </PanelSection>
                </>
            )
        }

        if (activePanel === 'toc') {
            const jData = visualOpts.jump_menu || {}
            return (
                <>
                    <PanelSection title="Inhaltsverzeichnis (TOC)" icon="📋">
                        <SelectInput label="Grid Layout" value={String(jData.grid || 1)} onChange={v => setVisualOpts(o => ({ ...o, jump_menu: { ...jData, grid: parseInt(v) } }))} options={[{ label: '1 Spalte', value: '1' }, { label: '2 Spalten', value: '2' }, { label: '3 Spalten', value: '3' }]} />
                        <SelectInput label="Active State" value={jData.active_state || 'bold'} onChange={v => setVisualOpts(o => ({ ...o, jump_menu: { ...jData, active_state: v } }))} options={[{ label: 'Fett + Brand', value: 'bold' }, { label: 'Neon Glow', value: 'glow' }]} />
                        <SelectInput label="Nummerierung" value={jData.prefix || 'none'} onChange={v => setVisualOpts(o => ({ ...o, jump_menu: { ...jData, prefix: v } }))} options={[{ label: 'Keine', value: 'none' }, { label: '1. 2. 3.', value: 'numbers' }, { label: '01 02 03', value: 'leading_zero' }]} />
                    </PanelSection>
                    <PanelSection title="TOC Farben" icon="">
                        <ColorInput label="Hintergrundfarbe" value={jData.bg || '#f5f5f7'} onChange={v => setVisualOpts(o => ({ ...o, jump_menu: { ...jData, bg: v } }))} />
                        <ColorInput label="Titel-Farbe (Inhaltsüberschrift)" value={jData.title_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, jump_menu: { ...jData, title_color: v } }))} />
                        <ColorInput label="Link-Farbe" value={jData.link_color || '#007AFF'} onChange={v => setVisualOpts(o => ({ ...o, jump_menu: { ...jData, link_color: v } }))} />
                        {/* Live-Vorschau */}
                        <div style={{ marginTop: 10, padding: '14px 18px', background: jData.bg || '#f5f5f7', borderRadius: 12 }}>
                            <p style={{ fontWeight: 700, fontSize: '.9rem', color: jData.title_color || 'var(--ds-text-main)', marginBottom: 10 }}>Inhalt dieses Artikels</p>
                            {['Einleitung', 'Analyse', 'Fazit'].map((t, i) => (
                                <p key={i} style={{ fontSize: '.85rem', color: jData.link_color || '#007AFF', marginBottom: 6, fontWeight: 500 }}>{t}</p>
                            ))}
                        </div>
                    </PanelSection>
                </>
            )
        }

        if (activePanel === 'core') {
            const cData = visualOpts.insight_engine || {}
            return (
                <>
                    <PanelSection title="Artikel-Typografie" icon="🧠">
                        <SelectInput label="Schriftstil" value={cData.variable_font || 'inter'} onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, variable_font: v } }))} options={[{ label: 'Inter (Sans)', value: 'inter' }, { label: 'Merriweather (Serif)', value: 'serif' }]} />
                        <RangeInput label="Absatz-Abstand" value={cData.para_spacing || 28} min={10} max={60} unit="px" onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, para_spacing: v } }))} />
                    </PanelSection>
                    <PanelSection title="Artikel-Farben" icon="">
                        <ColorInput label="Fliesstext (Body)" value={cData.body_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, body_color: v } }))} />
                        <ColorInput label="H2-Überschriften" value={cData.h2_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, h2_color: v } }))} />
                        <ColorInput label="H3-Überschriften" value={cData.h3_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, h3_color: v } }))} />
                    </PanelSection>
                    <PanelSection title="Zitat-Block (Blockquote)" icon="❝">
                        <ColorInput label="Vertikale Linie (Farbe)" value={cData.quote_line_color || '#007AFF'} onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, quote_line_color: v } }))} />
                        <ColorInput label="Zitat-Textfarbe" value={cData.quote_text_color || '#1d1d1f'} onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, quote_text_color: v } }))} />
                        <ColorInput label="Hintergrundfarbe" value={cData.quote_bg || 'rgba(0,0,0,0)'} onChange={v => setVisualOpts(o => ({ ...o, insight_engine: { ...cData, quote_bg: v } }))} />
                        {/* Live-Vorschau */}
                        <blockquote style={{ margin: '12px 0 0', padding: '10px 0 10px 24px', borderLeft: `4px solid ${cData.quote_line_color || '#007AFF'}`, fontStyle: 'italic', fontSize: '1.05rem', color: cData.quote_text_color || 'var(--ds-text-main)', background: cData.quote_bg || 'transparent', borderRadius: '0 12px 12px 0', lineHeight: 1.6 }}>
                            Vorschau: „Die Technologie soll den Menschen nicht ersetzen."
                        </blockquote>
                    </PanelSection>
                </>
            )
        }


        if (activePanel === 'cta') {
            const ctaData = visualOpts.cta_block || {}
            const inputBase: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', border: '1px solid var(--ds-border-color)', fontSize: '.9rem', fontFamily: 'Inter,sans-serif', color: 'var(--ds-text-main)', outline: 'none', marginBottom: 16, boxSizing: 'border-box', background: 'var(--ds-bg-body)' }
            return (
                <>
                    <PanelSection title="Block-Text" icon="✏️">
                        <FloatLabel text="CTA-Text (Block-Inhalt)" />
                        <textarea rows={3} value={ctaData.text || ''} onClick={e => e.stopPropagation()}
                            onChange={e => setVisualOpts(o => ({ ...o, cta_block: { ...ctaData, text: e.target.value } }))}
                            placeholder="Erhalten Sie Zugriff auf weiterführende Ressourcen..."
                            style={{ ...inputBase, resize: 'vertical', lineHeight: 1.5 }} />
                    </PanelSection>
                    <PanelSection title="Block-Farben" icon="">
                        <ColorInput label="Hintergrundfarbe" value={ctaData.bg_color || '#007AFF'} onChange={v => setVisualOpts(o => ({ ...o, cta_block: { ...ctaData, bg_color: v } }))} />
                        <ColorInput label="Textfarbe" value={ctaData.text_color || '#ffffff'} onChange={v => setVisualOpts(o => ({ ...o, cta_block: { ...ctaData, text_color: v } }))} />
                    </PanelSection>
                    <PanelSection title="Button" icon="🔘">
                        <FloatLabel text="Button-Text" />
                        <input type="text" value={ctaData.btn_text || ''} onClick={e => e.stopPropagation()}
                            onChange={e => setVisualOpts(o => ({ ...o, cta_block: { ...ctaData, btn_text: e.target.value } }))}
                            placeholder="Jetzt registrieren"
                            style={inputBase} />
                        <SelectInput label="Button-Stil" value={ctaData.btn_style || 'filled'}
                            onChange={v => setVisualOpts(o => ({ ...o, cta_block: { ...ctaData, btn_style: v as 'filled' | 'outline' | 'ghost' } }))}
                            options={[{ label: 'Gefüllt (Filled)', value: 'filled' }, { label: 'Outline (Border)', value: 'outline' }, { label: 'Ghost (Unterstrichen)', value: 'ghost' }]} />
                        <Divider />
                        <ColorInput label="Button Hintergrund" value={ctaData.btn_color || 'rgba(255,255,255,0.2)'} onChange={v => setVisualOpts(o => ({ ...o, cta_block: { ...ctaData, btn_color: v } }))} />
                        <ColorInput label="Button Textfarbe" value={ctaData.btn_text_color || '#ffffff'} onChange={v => setVisualOpts(o => ({ ...o, cta_block: { ...ctaData, btn_text_color: v } }))} />
                    </PanelSection>
                    {/* Live Preview */}
                    <PanelSection title="Vorschau" icon="👁️">
                        <div style={{ background: ctaData.bg_color || 'var(--ds-brand-primary)', color: ctaData.text_color || '#fff', padding: 16, borderRadius: 'var(--ds-radius-ui)' }}>
                            <p style={{ marginBottom: 12, fontWeight: 500, lineHeight: 1.5, fontSize: '.9rem' }}>{ctaData.text || 'Erhalten Sie Zugriff auf weiterführende Ressourcen.'}</p>
                            {(() => {
                                const s = ctaData.btn_style || 'filled'
                                const bg = ctaData.btn_color || 'rgba(255,255,255,0.2)'
                                const tc = ctaData.btn_text_color || '#fff'
                                const t = ctaData.btn_text || 'Jetzt registrieren'
                                const base: React.CSSProperties = { display: 'inline-block', fontWeight: 700, padding: '8px 16px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', textDecoration: 'none', fontSize: '.85rem' }
                                if (s === 'filled') return <span style={{ ...base, background: bg, color: tc }}>{t}</span>
                                if (s === 'outline') return <span style={{ ...base, background: 'transparent', color: tc, border: `2px solid ${tc}` }}>{t}</span>
                                return <span style={{ ...base, background: 'transparent', color: tc, textDecoration: 'underline' }}>{t}</span>
                            })()}
                        </div>
                    </PanelSection>
                </>
            )
        }

        if (activePanel === 'action') {
            const aData = visualOpts.action_zone || {}
            return (
                <PanelSection title="Werbefläche" icon="📢">
                    <SelectInput label="Radius" value={aData.radius || 'var(--ds-radius-ui)'} onChange={v => setVisualOpts(o => ({ ...o, action_zone: { ...aData, radius: v } }))} options={[{ label: 'Standard', value: 'var(--ds-radius-ui)' }, { label: 'Abgerundet (12px)', value: '12px' }, { label: 'Eckig', value: '0px' }, { label: 'Pill', value: '40px' }]} />
                    <p style={{ fontSize: '.78rem', color: 'var(--ds-text-dimmed)', lineHeight: 1.5 }}>Der Werbeplatz rechts wird durch externe Inhalte befüllt (z.B. Google AdSense oder eigene Banner).</p>
                </PanelSection>
            )
        }


        if (activePanel?.startsWith('section-')) {
            const idx = parseInt(activePanel.split('-')[1])
            const sec = sections[idx]
            if (!sec) return <p style={{ color: 'var(--ds-text-dimmed)', fontSize: '.85rem' }}>Nicht gefunden.</p>
            return (<>
                <FloatLabel text={`Abschnitt ${idx + 1}: Überschrift`} />
                <input type="text" value={sec.heading} onClick={e => e.stopPropagation()}
                    onChange={e => { const u = sections.map((s, i) => i === idx ? { ...s, heading: e.target.value } : s); setGhost(g => ({ ...g, ai_text_block: rebuildContent(u) })) }}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', border: '1px solid var(--ds-border-color)', fontSize: '.9rem', fontFamily: 'Inter,sans-serif', color: 'var(--ds-text-main)', outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
                <FloatLabel text="Inhalt (Markdown)" />
                <textarea rows={10} value={sec.body.join('\n')} onClick={e => e.stopPropagation()}
                    onChange={e => { const u = sections.map((s, i) => i === idx ? { ...s, body: e.target.value.split('\n') } : s); setGhost(g => ({ ...g, ai_text_block: rebuildContent(u) })) }}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', border: '1px solid var(--ds-border-color)', fontSize: '.9rem', lineHeight: 1.6, resize: 'vertical', fontFamily: 'Inter,sans-serif', color: 'var(--ds-text-main)', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />
                <p style={{ fontSize: '.72rem', color: 'var(--ds-text-dimmed)', marginBottom: 16 }}>## H2 &nbsp;|&nbsp; ### H3 &nbsp;|&nbsp; &gt; Zitat &nbsp;|&nbsp; - Liste</p>
                <button onClick={e => deleteSection(idx, e)} style={{ width: '100%', padding: '9px', borderRadius: 'calc(var(--ds-radius-ui) / 2)', border: '1px solid #ff3b30', color: '#ff3b30', background: 'transparent', fontSize: '.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Abschnitt löschen</button>
            </>)
        }
        return null
    }

    // ── CSS-Variablen: exakt aus lol.css (gleiche Werte wie ArticlePreviewRender) ──
    const _S = visualOpts.style || {}
    const _L = visualOpts.layout || {}
    const _ADV = visualOpts.advanced || {}
    const editorGlobalVars = {
        // FARBEN — lol.css :root
        '--ds-color-primary': _S.brand_primary || '#007AFF',
        '--ds-color-primary-hover': _S.primary_hover || '#005bb5',
        '--ds-color-bg-main': _S.bg_body || '#ffffff',
        '--ds-color-bg-sec': _S.bg_panel || '#f5f5f7',
        '--ds-color-bg-card': _S.bg_card || '#ffffff',
        '--ds-color-text-main': _S.text_main || '#1d1d1f',
        '--ds-color-text-body': _S.text_dimmed || '#424245',
        '--ds-color-text-muted': _S.text_muted || '#86868b',
        '--ds-color-border': _S.border_color || '#d2d2d7',
        '--ds-color-border-light': _S.border_color_light || '#e5e5e7',
        // TYPOGRAFIE
        '--ds-font-family': _S.font_family || "'Inter',-apple-system,sans-serif",
        '--ds-text-h1': _S.h1_size || '3.5rem',
        '--ds-text-h2': _S.h2_size || '1.9rem',
        '--ds-text-body-large': _S.body_large_size || '1.25rem',
        '--ds-text-body': _S.body_size || '1.1rem',
        '--ds-text-small': _S.small_size || '0.85rem',
        // RADIUS
        '--ds-radius-sm': _S.radius_sm || '8px',
        '--ds-radius-md': _S.radius_md || '12px',
        '--ds-radius-lg': _S.radius_lg || '14px',
        '--ds-radius-xl': _S.radius_xl || _S.radius_ui || '16px',
        // ABSTÄNDE
        '--ds-spacing-xs': _S.spacing_xs || '10px',
        '--ds-spacing-sm': _S.spacing_sm || '20px',
        '--ds-spacing-md': _S.spacing_md || '30px',
        '--ds-spacing-lg': _S.spacing_lg || '40px',
        '--ds-spacing-xl': _S.spacing_xl || '60px',
        // LAYOUT
        '--ds-container-width': _L.container_width || '1400px',
        '--ds-sidebar-width-left': _L.sidebar_width || '280px',
        '--ds-sidebar-width-right': _L.action_width || '240px',
        // EFFEKTE
        '--ds-shadow-card': _S.shadow_elevation || '0 10px 30px rgba(0,0,0,0.05)',
        '--ds-transition-speed': '0.3s',
        // LEGACY ALIASES (für alte Inline-Styles im Canvas)
        '--ds-bg-body': _S.bg_body || '#ffffff',
        '--ds-bg-panel': _S.bg_panel || '#f5f5f7',
        '--ds-text-main': _S.text_main || '#1d1d1f',
        '--ds-text-dimmed': _S.text_dimmed || '#424245',
        '--ds-brand-primary': _S.brand_primary || '#007AFF',
        '--ds-border-color': _S.border_color || '#d2d2d7',
        '--ds-radius-ui': _S.radius_xl || _S.radius_ui || '16px',
        '--ds-shadow-elevation': _S.shadow_elevation || '0 10px 30px rgba(0,0,0,0.05)',
        '--ds-h1-size': _S.h1_size || '3.5rem',
        '--ds-h2-size': _S.h2_size || '1.9rem',
        '--ds-body-size': _S.body_size || '1.1rem',
        '--ds-line-height': '1.65',
        '--ds-section-space': _S.spacing_xl || '60px',
        '--ds-element-gap': _S.spacing_lg || '40px',
        '--ds-sidebar-width': _L.sidebar_width || '280px',
        '--ds-action-width': _L.action_width || '240px',
    } as React.CSSProperties

    const showDesignPanel = activePanel === 'global'

    return (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ ...editorGlobalVars, fontFamily: 'var(--ds-font-family)', background: 'var(--ds-color-bg-main)', color: 'var(--ds-color-text-main)' }} onClick={() => { setHovered(null); setActivePanel(null) }}>
            {_ADV.custom_css && <style>{_ADV.custom_css}</style>}
            <EditWrap id="global" style={{ borderRadius: 0 }}>
                <div style={{ position: 'absolute', left: 0, zIndex: 10001, height: visualOpts.progress_engine?.thickness || 4, background: visualOpts.progress_engine?.style === 'rainbow' ? 'linear-gradient(90deg, #ff007f, #7928ca, var(--ds-color-primary))' : 'var(--ds-color-primary)', width: `${progress}%`, transition: 'width .1s', pointerEvents: 'none', display: visualOpts.progress_engine?.enabled === false ? 'none' : 'block', boxShadow: visualOpts.progress_engine?.glow ? '0 0 10px var(--ds-color-primary)' : 'none', bottom: visualOpts.progress_engine?.position === 'bottom' ? 0 : 'auto', top: visualOpts.progress_engine?.position === 'bottom' ? 'auto' : 0 }} />
            </EditWrap>

            {/* Toolbar */}
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', height: 52, background: 'var(--ds-color-text-main)', flexShrink: 0, zIndex: 200 }}>
                <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'rgba(255,255,255,.55)', fontSize: '.83rem', cursor: 'pointer', padding: '6px 10px', borderRadius: 6, fontFamily: 'inherit' }}>
                    <ChevronLeft style={{ width: 15, height: 15 }} /> Zurück
                </button>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.35)' }}>Vorlage:</span>
                <button onClick={onTemplateChange} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,122,255,.18)', border: '1px solid rgba(0,122,255,.38)', color: '#60a5ff', fontSize: '.8rem', fontWeight: 700, cursor: 'pointer', padding: '5px 14px', borderRadius: 20, fontFamily: 'inherit' }}>
                    <LayoutGrid style={{ width: 12, height: 12 }} />
                    {SITE_TEMPLATES.find(t => t.id === activeTemplate)?.name ?? 'The Authority'}
                </button>
                <button onClick={e => { e.stopPropagation(); addSection() }} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.13)', color: 'rgba(255,255,255,.75)', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer', padding: '5px 14px', borderRadius: 20, fontFamily: 'inherit' }}>
                    + Abschnitt
                </button>
                {/* 🎨 DESIGN PANEL BUTTON */}
                <button onClick={e => { e.stopPropagation(); setActivePanel(p => p === 'global' ? null : 'global') }} style={{ display: 'flex', alignItems: 'center', gap: 5, background: showDesignPanel ? 'var(--ds-color-primary)' : 'rgba(255,255,255,.07)', border: showDesignPanel ? 'none' : '1px solid rgba(255,255,255,.13)', color: showDesignPanel ? '#fff' : 'rgba(255,255,255,.75)', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer', padding: '5px 14px', borderRadius: 20, fontFamily: 'inherit', transition: '.2s' }}>
                    🎨 Design
                </button>
                <button onClick={onSave} style={{ display: 'flex', alignItems: 'center', gap: 6, background: saved ? '#34c759' : 'var(--ds-color-primary)', border: 'none', color: '#fff', fontSize: '.85rem', fontWeight: 700, cursor: 'pointer', padding: '7px 20px', borderRadius: 'var(--ds-radius-sm)', fontFamily: 'inherit', transition: '.3s' }}>
                    <Save style={{ width: 14, height: 14 }} /> {saved ? 'Gespeichert ✓' : 'Speichern'}
                </button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* ── Article canvas: EXAKT gleich wie ArticlePreviewRender (lol.html + wlol.css) ── */}
                <div className="ds-master-wrapper" ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
                    {/* injectedCSS: exakter Port aus wlol.css — identisch mit ArticlePreviewRender */}
                    <style>{`
/* --- BASIS --- */
* { box-sizing: border-box; margin: 0; padding: 0; }
.ds-master-wrapper { font-family: var(--ds-font-family); color: var(--ds-color-text-body); background: var(--ds-color-bg-main); line-height: 1.6; overflow-x: hidden; text-align: left; }
.ds-container { max-width: var(--ds-container-width); margin: 0 auto; padding: 0 20px; }
#reading-progress { position: fixed; top: 0; left: 0; width: 0%; height: 4px; background: var(--ds-color-primary); z-index: 10000; transition: width 0.1s; }

/* BLOCK 1: HERO SEKTION */
.ds-hero { background-color: var(--ds-color-bg-sec); padding: var(--ds-spacing-xl) var(--ds-spacing-sm); border-bottom: 1px solid var(--ds-color-border); }
.ds-hero-container { max-width: var(--ds-container-width); margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-spacing-lg); align-items: center; }
.ds-breadcrumbs { font-size: var(--ds-text-small); color: var(--ds-color-text-muted); margin-bottom: var(--ds-spacing-sm); }
.ds-breadcrumbs a { text-decoration: none; color: inherit; transition: var(--ds-transition-speed); }
.ds-breadcrumbs a:hover { color: var(--ds-color-primary); }
.ds-hero-content h1 { font-size: var(--ds-text-h1); font-weight: 800; line-height: 1.1; margin-bottom: var(--ds-spacing-sm); color: var(--ds-color-text-main); }
.ds-hero-intro { font-size: var(--ds-text-body-large); margin-bottom: var(--ds-spacing-md); max-width: 600px; }
.ds-hero-btns { display: flex; gap: 15px; flex-wrap: wrap; }
.ds-btn-primary { background: var(--ds-color-text-main); color: #fff; padding: 14px 28px; border-radius: var(--ds-radius-sm); text-decoration: none; font-weight: 600; transition: var(--ds-transition-speed); }
.ds-btn-primary:hover { transform: translateY(-2px); background: #000; }
.ds-btn-text { padding: 14px 28px; color: var(--ds-color-text-main); font-weight: 600; text-decoration: none; }
.ds-hero-visual { display: flex; flex-direction: column; gap: 15px; perspective: 1000px; }
.ds-preview-card { background: var(--ds-color-bg-card); padding: var(--ds-spacing-sm); border-radius: var(--ds-radius-lg); box-shadow: var(--ds-shadow-card); border: 1px solid var(--ds-color-border-light); max-width: 400px; }
.ds-preview-card:nth-child(1) { transform: rotate(-2deg) translateX(20px); z-index: 3; }
.ds-preview-card:nth-child(2) { transform: rotate(1deg) translateX(0px); z-index: 2; margin-top: -40px; opacity: 0.8; }
.ds-preview-card:nth-child(3) { transform: rotate(3deg) translateX(-20px); z-index: 1; margin-top: -40px; opacity: 0.5; }

/* BLOCK 2: HAUPT-LAYOUT */
.ds-grid-container { display: grid; gap: 50px; max-width: var(--ds-container-width); margin: 0 auto; padding: var(--ds-spacing-lg) var(--ds-spacing-sm); align-items: start; grid-template-columns: var(--ds-sidebar-width-left) 1fr var(--ds-sidebar-width-right); }

/* SIDEBAR LINKS */
.ds-sidebar-left { position: sticky; top: var(--ds-spacing-lg); font-size: var(--ds-text-small); }
.ds-cta-box { background: var(--ds-color-primary); color: white; padding: var(--ds-spacing-sm); border-radius: var(--ds-radius-md); margin-bottom: var(--ds-spacing-md); }
.ds-cta-box a { color: white; font-weight: 700; text-decoration: none; }
.ds-info-list { list-style: none; padding: 0; margin-bottom: var(--ds-spacing-md); border-bottom: 1px solid var(--ds-color-border); padding-bottom: var(--ds-spacing-sm); }
.ds-info-list li { margin-bottom: 12px; }
.ds-label { font-weight: 700; color: var(--ds-color-text-main); display: block; font-size: 0.7rem; text-transform: uppercase; }
.ds-topics-nav { margin-top: var(--ds-spacing-sm); }
.ds-topics-label { display: block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ds-color-text-muted); margin-bottom: var(--ds-spacing-xs); }
.ds-topics-list { list-style: none; padding: 0; margin: 0; }
.ds-topics-list li { padding: 6px 0 6px 14px; border-left: 2px solid var(--ds-color-border); transition: border-color var(--ds-transition-speed); }
.ds-topics-list li:hover { border-left-color: var(--ds-color-primary); }
.ds-topics-list a { text-decoration: none; color: var(--ds-color-text-body); font-size: var(--ds-text-small); display: block; }
.ds-topics-list a:hover { color: var(--ds-color-primary); }

/* HAUPTINHALT */
.ds-main-content { max-width: 100%; }
.ds-author-box { display: flex; gap: var(--ds-spacing-lg); margin-bottom: var(--ds-spacing-lg); padding: 25px; background: var(--ds-color-bg-sec); border-radius: var(--ds-radius-xl); }
.ds-profile { display: flex; align-items: center; gap: 12px; }
.ds-profile img { width: 48px; height: 48px; border-radius: 50%; }

.ds-toc { margin: var(--ds-spacing-lg) 0; padding: var(--ds-spacing-md); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-xl); }
.ds-toc h5 { margin-bottom: 15px; font-size: 1.1rem; color: var(--ds-color-text-main); }
#toc-list { display: grid; grid-template-columns: 1fr 1fr; gap: 15px 30px; list-style: none; padding: 0; }
#toc-list a { text-decoration: none; color: var(--ds-color-primary); transition: var(--ds-transition-speed); }
#toc-list a.active-chapter { color: var(--ds-color-text-main); font-weight: 800; border-left: 3px solid var(--ds-color-primary); padding-left: 12px; }

/* Typografie im Artikel */
.ds-article h1 { font-size: var(--ds-text-h1); color: var(--ds-color-text-main); }
.ds-article h2 { font-size: var(--ds-text-h2); margin-top: 4rem; padding-bottom: 12px; border-bottom: 1px solid var(--ds-color-border); color: var(--ds-color-text-main); margin-bottom: 1rem; }
.ds-article p { font-size: var(--ds-text-body); margin-bottom: 1.8rem; }
.ds-article blockquote { margin: 45px 0; padding: 10px 0 10px 30px; border-left: 4px solid var(--ds-color-primary); font-style: italic; font-size: 1.3rem; }

/* IN CONTENT CTA (NEW) */
.ds-in-content-cta { background: var(--ds-color-bg-sec); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-lg); padding: 35px; margin: 50px 0; display: flex; justify-content: space-between; align-items: center; gap: 30px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.03); }
.ds-cta-text h4 { font-size: 1.4rem; color: var(--ds-color-text-main); margin-bottom: 8px; }

/* SIDEBAR RECHTS */
.ds-sidebar-right { position: sticky; top: var(--ds-spacing-lg); }
.ds-ad-box { background: #fbfbfd; border: 1px dashed var(--ds-color-border); min-height: 500px; display: flex; align-items: center; justify-content: center; border-radius: var(--ds-radius-md); }

/* RESPONSIVE */
@media (max-width: 1200px) { .ds-grid-container { grid-template-columns: var(--ds-sidebar-width-left) 1fr; } .ds-sidebar-right { display: none; } }
@media (max-width: 1000px) { .ds-hero-container { grid-template-columns: 1fr; text-align: center; } .ds-hero-visual { display: none; } .ds-hero-intro { margin: 0 auto var(--ds-spacing-md) auto; } .ds-hero-btns { justify-content: center; } .ds-in-content-cta { flex-direction: column; text-align: center; } }
@media (max-width: 900px) { .ds-grid-container { grid-template-columns: 1fr; } .ds-sidebar-left { display: none; } #toc-list { grid-template-columns: 1fr; } }`}{_ADV.custom_css || ''}</style>

                    {/* BLOCK 1: HERO SEKTION — identisch mit lol.html */}
                    <EditWrap id="hero" style={{ borderRadius: 0 }}>
                        <section className="ds-hero">
                            <div className="ds-hero-container">
                                <div className="ds-hero-content">
                                    <nav className="ds-breadcrumbs">
                                        <a href="#">Startseite</a> / <a href="#">Artikel</a> / <span>Aktuell</span>
                                    </nav>
                                    <h1>{ghost.h1_hero || 'Mustertitel für ein professionelles Thema'}</h1>
                                    <p className="ds-hero-intro">
                                        {(ghost.intro_block || '').split('\n')[0] || 'Dieser Bereich wird von der KI generiert. Er vermittelt dem Leser sofort den Kernnutzen prägnant und informativ.'}
                                    </p>
                                    <div className="ds-hero-btns">
                                        <a href="#article-root" className="ds-btn-primary">Direkt zum Inhalt</a>
                                        <a href="#" className="ds-btn-text">Mehr erfahren &rarr;</a>
                                    </div>
                                </div>
                                {/* Rechts: Gestapelte Karten */}
                                <div className="ds-hero-visual">
                                    {(headings.length > 0 ? headings.map(h => h) : ['Kernargumente und Hintergründe im Überblick', 'Fundierte Einordnung mit Daten und Expertenmeinungen', 'Was Sie nach diesem Artikel wissen sollten']).slice(0, 3).map((cardTitle, i) => (
                                        <div key={i} className="ds-preview-card">
                                            <strong>{['Zusammenfassung', 'Analyse', 'Fazit'][i]} &bull; 0{i + 1}</strong><br />
                                            <span>{cardTitle}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </EditWrap>

                    {/* BLOCK 2: HAUPT-BEREICH (Grid) — identisch mit lol.html */}
                    <div className="ds-grid-container">

                        {/* LINKE SPALTE (Sidebar) */}
                        <aside className="ds-sidebar-left">
                            <EditWrap id="cta">
                                <div className="ds-cta-box">
                                    <p>{ghost.cta_text || 'Erhalten Sie Zugriff auf weiterführende Ressourcen.'}</p>
                                    <a href="#">{ghost.cta_label || 'Jetzt registrieren'}</a>
                                </div>
                            </EditWrap>
                            <EditWrap id="tree">
                                <ul className="ds-info-list">
                                    <li><span className="ds-label">Prüfung</span> Verifizierter Artikel</li>
                                    <li><span className="ds-label">Update</span> Aktuell</li>
                                    <li><span className="ds-label">Lesezeit</span> ca. 5 Min.</li>
                                </ul>
                                {/* THEMEN: Dynamische Artikel-Navigation */}
                                {sections.length > 0 && (
                                    <nav className="ds-topics-nav">
                                        <span className="ds-topics-label">Themen</span>
                                        <ul className="ds-topics-list">
                                            {sections.map((sec, i) => (
                                                <li key={i}><a href="#">{sec.heading}</a></li>
                                            ))}
                                        </ul>
                                    </nav>
                                )}
                            </EditWrap>
                        </aside>

                        {/* MITTLERE SPALTE (Content) */}
                        <main className="ds-main-content">
                            {/* Autoren-Box */}
                            <EditWrap id="meta">
                                <header className="ds-author-box">
                                    <div className="ds-profile">
                                        <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(ghost.author_name || 'LinguistFlow KI')}&background=007AFF&color=fff`} alt="Autor" loading="lazy" />
                                        <div><span style={{ color: 'var(--ds-color-text-muted)', fontSize: '.75rem', display: 'block' }}>Inhalt von</span><strong>{ghost.author_name || 'LinguistFlow KI'}</strong></div>
                                    </div>
                                    <div className="ds-profile">
                                        <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(ghost.reviewer_name || 'Experten-Team')}&background=random&color=fff`} alt="Experte" loading="lazy" />
                                        <div><span style={{ color: 'var(--ds-color-text-muted)', fontSize: '.75rem', display: 'block' }}>Geprüft von</span><strong>{ghost.reviewer_name || 'Experten-Team'}</strong></div>
                                    </div>
                                </header>
                            </EditWrap>

                            {/* Inhaltsverzeichnis */}
                            <EditWrap id="toc">
                                <nav className="ds-toc">
                                    <h5>Inhalt dieses Artikels</h5>
                                    <ul id="toc-list">
                                        {(headings.length > 0 ? headings : ['Einleitung', 'Analyse', 'Praxisbeispiele', 'Fazit']).slice(0, 8).map((h, i) => (
                                            <li key={i}><a href="#">{h}</a></li>
                                        ))}
                                    </ul>
                                </nav>
                            </EditWrap>

                            {/* ARTIKEL TEXT */}
                            <article className="ds-article" id="article-root">
                                <h1>{ghost.h1_hero}</h1>
                                {ghost.intro_block && <p>{ghost.intro_block}</p>}
                                {sections.map((sec, idx) => (
                                    <div key={idx} style={{ position: 'relative', marginTop: 8 }}>
                                        <EditWrap id={`section-${idx}`}>
                                            {(hovered === `section-${idx}` || activePanel === `section-${idx}`) && (
                                                <button onClick={e => deleteSection(idx, e)} style={{ position: 'absolute', top: -14, right: -14, zIndex: 1001, width: 26, height: 26, borderRadius: '50%', background: '#ff3b30', border: 'none', color: '#fff', fontSize: '.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, lineHeight: 1 }}>×</button>
                                            )}
                                            <h2>{sec.heading}</h2>
                                            {sec.body.filter(Boolean).map((line, li) => {
                                                if (line.startsWith('### ')) return <h3 key={li} style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '2rem', marginBottom: '.5rem' }}>{line.slice(4)}</h3>
                                                if (line.startsWith('> ')) return <blockquote key={li}>{line.slice(2)}</blockquote>
                                                if (line.startsWith('- ') || line.startsWith('* ')) return <p key={li} style={{ paddingLeft: '1.2rem', borderLeft: '2px solid var(--ds-color-border)' }}>{line.slice(2)}</p>
                                                if (line.trim()) return <p key={li}>{renderInlineMd(line)}</p>
                                                return null
                                            })}
                                        </EditWrap>
                                    </div>
                                ))}
                                <button onClick={e => { e.stopPropagation(); addSection() }}
                                    style={{ width: '100%', marginTop: 40, padding: '16px', border: '2px dashed var(--ds-color-border)', borderRadius: 'var(--ds-radius-md)', background: 'transparent', color: 'var(--ds-color-text-muted)', fontSize: '.9rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: '.2s' }}>
                                    + Neuen Abschnitt hinzufügen
                                </button>

                                <div className="ds-in-content-cta">
                                    <div className="ds-cta-text">
                                        <h4>Kostenloses Whitepaper</h4>
                                        <p>Lade dir unseren exklusiven 40-seitigen PDF-Guide herunter.</p>
                                    </div>
                                    <a href="#" className="ds-btn-primary" style={{ color: 'white', borderRadius: 8, textDecoration: 'none', padding: '14px 28px', background: 'var(--ds-color-primary)', fontWeight: 600 }}>Download</a>
                                </div>
                            </article>
                        </main>

                        {/* RECHTE SPALTE */}
                        <aside className="ds-sidebar-right">
                            <EditWrap id="action">
                                <div className="ds-ad-box">
                                    <p style={{ fontSize: '.85rem', color: 'var(--ds-color-text-muted)' }}>Anzeigen-Platzhalter</p>
                                </div>
                            </EditWrap>
                        </aside>
                    </div>
                </div>

                {/* Edit panel */}
                <div onClick={e => e.stopPropagation()} style={{ width: activePanel ? 320 : 0, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden', background: 'var(--ds-bg-body)', borderLeft: activePanel ? '1px solid var(--ds-border-color)' : 'none', transition: 'width .25s cubic-bezier(.4,0,.2,1)', boxShadow: activePanel ? '-4px 0 20px rgba(0,0,0,.07)' : 'none' }}>
                    {activePanel && (
                        <div style={{ padding: 24, minWidth: 320 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                                <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ds-text-main)', margin: 0 }}>
                                    {activePanel === 'global' ? 'Design-System' : activePanel === 'hero' ? 'Hero bearbeiten' : activePanel === 'meta' ? 'Autoren & Meta' : activePanel === 'toc' ? 'Inhaltsverzeichnis' : activePanel === 'tree' ? 'Sidebar Topics' : activePanel === 'core' ? 'Artikel-Inhalt' : activePanel === 'cta' ? 'Call-to-Action' : activePanel === 'action' ? 'Werbefläche' : `Abschnitt ${parseInt((activePanel || '').split('-')[1]) + 1}`}
                                </h3>
                                <button onClick={() => setActivePanel(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ds-text-dimmed)', padding: 4 }}><X style={{ width: 18, height: 18 }} /></button>
                            </div>
                            {renderPanel()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Editor Page ────────────────────────────────────────────────────────────────
import { LinguistFlowAPI } from '../lib/api'

/** Renders **bold** and *italic* markdown inline as React elements. */
function renderInlineMd(text: string): React.ReactNode {
    // Split by **bold** and *italic* markers
    const parts: React.ReactNode[] = []
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g
    let lastIdx = 0
    let match: RegExpExecArray | null
    let key = 0
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIdx) {
            parts.push(text.slice(lastIdx, match.index))
        }
        if (match[0].startsWith('**')) {
            parts.push(<strong key={key++}>{match[2]}</strong>)
        } else {
            parts.push(<em key={key++}>{match[3]}</em>)
        }
        lastIdx = match.index + match[0].length
    }
    if (lastIdx < text.length) parts.push(text.slice(lastIdx))
    return parts.length === 1 ? parts[0] : <>{parts}</>
}

export default function Editor() {
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams] = useSearchParams()

    const site: ConnectedSite | undefined = (location.state as any)?.site
    const templateId = site?.templateId ?? searchParams.get('template') ?? 'authority'
    const draftId = searchParams.get('draft') ?? (location.state as any)?.draftId ?? null
    // draftData is passed from Freigabe Center "Bearbeiten" → carries ghost_data + visual_opts
    const draftData = (location.state as any)?.draftData ?? null

    // ── localStorage save key (per draftId if available, otherwise shared) ─────
    const storageKey = draftId ? `lf_editor_${draftId}` : 'lf_editor_standalone'

    // Restore ghost: prefer draftData (from Freigabe Center) > localStorage > DEFAULT
    const [ghost, setGhost] = useState<Record<string, string>>(() => {
        if (draftData?.ghost_data && Object.keys(draftData.ghost_data).length > 0) {
            return draftData.ghost_data as Record<string, string>
        }
        try {
            const saved = localStorage.getItem(storageKey)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed.ghost) return parsed.ghost
            }
        } catch { /* ignore */ }
        return DEFAULT_GHOST
    })

    // Restore visualOpts: prefer draftData > localStorage > site.designContext > {}
    const [visualOpts, setVisualOpts] = useState<VisualOptions>(() => {
        if (draftData?.visual_opts && Object.keys(draftData.visual_opts).length > 0) {
            return draftData.visual_opts as VisualOptions
        }
        try {
            const saved = localStorage.getItem(storageKey)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed.visualOpts) return parsed.visualOpts
            }
        } catch { /* ignore */ }
        const design = site?.designContext
        if (design) {
            return {
                style: {
                    brand_primary: design.brandColor || '#007AFF',
                    bg_body: design.primaryColor || '#ffffff',
                    bg_panel: '#f5f5f7',
                    text_main: '#1d1d1f',
                    border_color: design.accentColor || '#d2d2d7',
                }
            }
        }
        return {}
    })

    const [saved, setSaved] = useState(false)
    const [showTemplateModal, setShowTemplateModal] = useState(false)
    const [activeTemplate, setActiveTemplate] = useState(() => {
        try {
            const s = localStorage.getItem(storageKey)
            if (s) {
                const p = JSON.parse(s)
                if (p.template) return p.template
            }
        } catch { /* ignore */ }
        return templateId
    })

    const handleSave = async () => {
        setSaved(true)
        // Always persist to localStorage (works without a draftId)
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                ghost,
                visualOpts,
                template: activeTemplate,
                savedAt: new Date().toISOString(),
            }))
        } catch { /* quota */ }
        // Also persist to backend if we have a draftId
        if (draftId) {
            await LinguistFlowAPI.updateDraft(
                draftId,
                { ...ghost as Record<string, unknown>, _template: activeTemplate },
                visualOpts as Record<string, unknown>,
            )
        }
        setTimeout(() => setSaved(false), 2000)
    }
    const handleTemplateSelect = (id: string) => { setActiveTemplate(id); setShowTemplateModal(false) }

    return (
        <>
            <EditableAuthorityLayout
                ghost={ghost}
                setGhost={setGhost}
                visualOpts={visualOpts}
                setVisualOpts={setVisualOpts}
                activeTemplate={activeTemplate}
                onTemplateChange={() => setShowTemplateModal(true)}
                onSave={handleSave}
                saved={saved}
                onBack={() => navigate(-1)}
            />
            {showTemplateModal && (
                <TemplateLibraryModal
                    currentTemplateId={activeTemplate as any}
                    onSelect={handleTemplateSelect}
                    onClose={() => setShowTemplateModal(false)}
                />
            )}
        </>
    )
}

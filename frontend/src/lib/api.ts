const isProduction = import.meta.env.PROD;
const API_BASE = isProduction
    ? `http://${window.location.hostname}:8000/api`
    : 'http://localhost:8000/api';

// ── A. Layout-Ebene ────────────────────────────────────────────────────────────
export interface LayoutOptions {
    container_width?: string  // --container-width
    grid_gap?: string         // --element-gap
    section_space?: string    // --section-space
    sidebar_width?: string    // --sidebar-width
    action_width?: string     // --action-width
}

// ── B. Style-Ebene ────────────────────────────────────────────────────────────
export interface StyleOptions {
    // Farb-Hierarchie (lol.css — 60-30-10 Regel)
    brand_primary?: string    // --ds-color-primary
    primary_hover?: string    // --ds-color-primary-hover
    bg_body?: string          // --ds-color-bg-main
    bg_panel?: string         // --ds-color-bg-sec
    bg_card?: string          // --ds-color-bg-card
    text_main?: string        // --ds-color-text-main
    text_dimmed?: string      // --ds-color-text-body (Fließtext)
    text_muted?: string       // --ds-color-text-muted (Metadaten, Breadcrumbs)
    border_color?: string     // --ds-color-border
    border_color_light?: string // --ds-color-border-light
    // Typografie-System
    font_family?: string      // --ds-font-family
    h1_size?: string          // --ds-text-h1
    h2_size?: string          // --ds-text-h2
    body_large_size?: string  // --ds-text-body-large
    body_size?: string        // --ds-text-body
    small_size?: string       // --ds-text-small
    line_height?: string
    letter_spacing?: string
    // Border-Radius System
    radius_sm?: string        // --ds-radius-sm (8px)
    radius_md?: string        // --ds-radius-md (12px)
    radius_lg?: string        // --ds-radius-lg (14px)
    radius_xl?: string        // --ds-radius-xl (16px) — ehemals radius_ui
    radius_ui?: string        // legacy alias for radius_xl
    // Abstände (Spacing)
    spacing_xs?: string       // --ds-spacing-xs (10px)
    spacing_sm?: string       // --ds-spacing-sm (20px)
    spacing_md?: string       // --ds-spacing-md (30px)
    spacing_lg?: string       // --ds-spacing-lg (40px)
    spacing_xl?: string       // --ds-spacing-xl (60px)
    // Schatten & Effekte
    shadow_elevation?: string // --ds-shadow-card
}

// ── C. Advanced-Ebene ────────────────────────────────────────────────────────
export interface AdvancedOptions {
    transition_speed?: string // --transition-fast
    custom_css?: string       // injected into preview
}

export interface VisualOptions {
    layout?: LayoutOptions
    style?: StyleOptions
    advanced?: AdvancedOptions
    // Block-spezifisch
    progress_engine?: { enabled?: boolean; style?: string; thickness?: number; position?: string; glow?: boolean }
    master_hero?: { card_rotation?: number; blur_intensity?: number; parallax?: boolean; card_bg?: string; card_label_color?: string; card_title_color?: string; card_link_text?: string; card_link_color?: string; section_bg?: string; h1_color?: string; intro_color?: string; btn_primary_bg?: string; btn_primary_text?: string; btn_secondary_color?: string }
    meta_strip?: { layout?: string; avatar_shape?: string; bg?: string; role_color?: string; name_color?: string }
    jump_menu?: { grid?: number; active_state?: string; prefix?: string; bg?: string; title_color?: string; link_color?: string }
    topic_tree?: { hierarchy_size?: string; indicator?: string; hide_mobile?: boolean; bg?: string; text_color?: string; link_color?: string; indicator_color?: string }
    insight_engine?: { variable_font?: string; para_spacing?: number; quote_watermark?: boolean; quote_line_color?: string; quote_text_color?: string; quote_bg?: string; h2_color?: string; h3_color?: string; body_color?: string }
    // CTA Block (left sidebar, above Topic Tree)
    cta_block?: {
        bg_color?: string        // Hintergrundfarbe des Blocks
        text_color?: string      // Textfarbe des Blocks
        btn_color?: string       // Hintergrundfarbe des Buttons
        btn_text_color?: string  // Textfarbe des Buttons
        btn_style?: 'filled' | 'outline' | 'ghost' // Button-Stil
        btn_text?: string        // Button-Beschriftung
        text?: string            // CTA-Text
    }
    // Ad/Werbefläche (right sidebar)
    action_zone?: { border_anim?: string; radius?: string }
}

export interface Draft {
    id: string
    title: string
    excerpt: string
    content?: string
    language: string
    created_at: string
    status: string
    template?: string
    ai_meta: {
        model: string
        provider: string
    }
    /** Persisted from Editor — VisualOptions serialized as plain JSON */
    visual_opts?: Record<string, unknown>
    /** Persisted from Editor — ghost field map (h1_hero, intro_block, sections …) */
    ghost_data?: Record<string, unknown>
    /** Legacy field kept for backward compat */
    visual_options?: VisualOptions
}

export const LinguistFlowAPI = {
    async getDrafts(): Promise<Draft[]> {
        // Retry up to 3x with 2s delay — backend might be briefly busy (SSE + agent)
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetch(`${API_BASE}/drafts`)
                if (!response.ok) throw new Error('Failed to fetch drafts')
                const data = await response.json()
                if (Array.isArray(data)) return data
                if (Array.isArray(data?.drafts)) return data.drafts
                return []
            } catch (err: any) {
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 2000))
                    continue
                }
                throw err
            }
        }
        return []
    },

    async updateDraft(
        draftId: string,
        ghostData: Record<string, unknown>,
        visualOpts: Record<string, unknown>,
    ): Promise<{ status: string }> {
        // PATCH /api/drafts/{id} updates _draft_store directly in main.py.
        // This is the single source of truth: Freigabe-Center preview AND
        // WordPress publish both read from _draft_store, so the Editor changes
        // are immediately visible in the preview AND used when publishing.
        const response = await fetch(`${API_BASE}/drafts/${draftId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ghost_data: ghostData, visual_opts: visualOpts }),
        })
        if (!response.ok) {
            // Non-fatal: swallow silently (offline / no backend)
            return { status: 'offline' }
        }
        return response.json()
    },

    async deleteDraft(draftId: string): Promise<{ status: string }> {
        const response = await fetch(`${API_BASE}/drafts/${draftId}`, { method: 'DELETE' })
        if (!response.ok) return { status: 'error' }
        return response.json()
    },

    async verifySite(url: string, username: string, appPassword: string): Promise<boolean> {
        const response = await fetch(`${API_BASE}/verify_site`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                site_url: url,
                username: username,
                app_password: appPassword,
            })
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.detail || 'Connection failed')
        }
        return true
    },

    async approveDraft(draftId: string, clientCredentials: { url: string, username: string, appPassword: string }, contentOverrides?: { title?: string, excerpt?: string, content?: string, template?: string }): Promise<{ status: string, post_id: number }> {
        const response = await fetch(`${API_BASE}/approve_draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                draft_id: draftId,
                site_url: clientCredentials.url,
                username: clientCredentials.username,
                app_password: clientCredentials.appPassword,
                ...(contentOverrides || {}),
            })
        })
        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.detail || 'Failed to approve draft')
        }
        return response.json()
    },

    async approveAndPublish(
        draftId: string,
        clientCredentials: { url: string, username: string, appPassword: string },
        contentOverrides?: { title?: string, excerpt?: string, content?: string, template?: string },
        visualOptions?: VisualOptions,
        ghostData?: Record<string, unknown>,
    ): Promise<{ status: string, wp_post_id: number, wp_post_url: string }> {
        const response = await fetch(`${API_BASE}/approve_and_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                draft_id: draftId,
                site_url: clientCredentials.url,
                username: clientCredentials.username,
                app_password: clientCredentials.appPassword,
                content_overrides: contentOverrides,
                visual_options: visualOptions,
                ghost_data: ghostData,
            })
        })
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }))
            throw new Error(error.detail || 'Publishing fehlgeschlagen')
        }
        return response.json()
    },

    async generateDraft(topic: string, clientId: string): Promise<{ status: string, draft_id: string }> {
        const response = await fetch(`${API_BASE}/generate_draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, client_id: clientId }),
        })
        if (!response.ok) { const e = await response.json(); throw new Error(e.detail || 'Failed to generate draft') }
        return response.json()
    },

    async analyzeSite(siteUrl: string): Promise<{ primaryColor: string, brandColor: string, accentColor: string, keywords: string }> {
        const response = await fetch(`${API_BASE}/analyze_site`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteUrl })
        })
        if (!response.ok) {
            const e = await response.json().catch(() => ({ detail: response.statusText }))
            throw new Error(e.detail || 'Fehler bei der Website-Analyse')
        }
        return response.json()
    },

    async autoGenerateDrafts(siteUrl: string, sources: object[], count: number = 1): Promise<{ status: string, topics: string[], draft_ids: string[], count: number }> {
        const response = await fetch(`${API_BASE}/auto_generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ site_url: siteUrl, sources, count }),
        })
        if (!response.ok) { const e = await response.json(); throw new Error(e.detail || 'Auto-Generierung fehlgeschlagen') }
        return response.json()
    },

    async pushScheduleConfig(payload: {
        site_id: string; site_url: string; enabled: boolean
        postsPerWeek: number; daysInAdvance: number
        selectedSlots: string[]; sources: object[]
    }): Promise<{ status: string }> {
        const response = await fetch(`${API_BASE}/schedule_config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        if (!response.ok) { const e = await response.json(); throw new Error(e.detail || 'Config sync failed') }
        return response.json()
    },

    async getAgentBusy(): Promise<{ is_busy: boolean; phase: string; current_topic: string; drafts_done: number; drafts_total: number; site_url: string }> {
        const response = await fetch(`${API_BASE}/agent_busy`)
        if (!response.ok) throw new Error('Failed to fetch agent busy state')
        return response.json()
    },

    async getAgentStatus(): Promise<{ sites: Array<{ site_url: string; next_publish: string; draft_due: string; is_due: boolean }>; total_drafts: number; active_sites: number }> {
        const response = await fetch(`${API_BASE}/agent_status`)
        if (!response.ok) throw new Error('Failed to fetch agent status')
        return response.json()
    },
}

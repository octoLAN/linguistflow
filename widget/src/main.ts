// @ts-ignore
import widgetCss from './style.css?inline';

/* ── Types ────────────────────────────────────────────────── */
interface Post {
  id: string;
  title: string;
  excerpt: string;
  image_url: string;
  category: string;
  url: string;
  published_at: string;
  read_time_min: number;
}

interface WidgetConfig {
  theme: 'light' | 'dark' | 'auto';
  lang: string;
  blog_title: string;
  blog_url: string;
  posts: Post[];
}

/* ── SVG Icons ────────────────────────────────────────────── */
const ICONS = {
  arrow: `<svg viewBox="0 0 24 24"><polyline points="5 12 19 12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  external: `<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  logo: `<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
  clock: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  bell: `<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
} as const;

/* ── Helpers ─────────────────────────────────────────────── */
function formatDate(iso: string, lang = 'de'): string {
  try {
    return new Date(iso).toLocaleDateString(lang, {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string = '',
  html: string = '',
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
}

/* ── Mock Data ───────────────────────────────────────────── */
const MOCK_DATA: WidgetConfig = {
  theme: 'light',
  lang: 'de',
  blog_title: 'Unser Blog',
  blog_url: '#',
  posts: [
    {
      id: '1',
      title: 'Die Zukunft der KI im Content Marketing: Was Unternehmen jetzt wissen müssen',
      excerpt: 'Künstliche Intelligenz verändert, wie wir Inhalte erstellen, verbreiten und optimieren. Dieser Artikel zeigt, wie fortschrittliche KI-Systeme die Redaktionsarbeit revolutionieren und was das für Ihre Content-Strategie bedeutet.',
      image_url: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=1200',
      category: 'KI & Strategie',
      url: '#',
      published_at: new Date(Date.now() - 2 * 864e5).toISOString(),
      read_time_min: 7,
    },
    {
      id: '2',
      title: 'SEO 2025: Die 8 wichtigsten Ranking-Faktoren im Überblick',
      excerpt: 'Google\'s Algorithmus hat sich massiv weiterentwickelt. Wir zeigen Ihnen, worauf es 2025 wirklich ankommt, um in den Suchergebnissen ganz oben zu landen.',
      image_url: 'https://images.pexels.com/photos/270408/pexels-photo-270408.jpeg?auto=compress&cs=tinysrgb&w=800',
      category: 'SEO',
      url: '#',
      published_at: new Date(Date.now() - 5 * 864e5).toISOString(),
      read_time_min: 5,
    },
    {
      id: '3',
      title: 'Content-Automatisierung: So sparen Sie 80% Ihrer Redaktionszeit',
      excerpt: 'Automatisierte Content-Pipelines sind kein Zukunftsthema mehr. Erfahren Sie, wie moderne Unternehmen KI nutzen, um effizienter zu publizieren.',
      image_url: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800',
      category: 'Automatisierung',
      url: '#',
      published_at: new Date(Date.now() - 9 * 864e5).toISOString(),
      read_time_min: 6,
    },
    {
      id: '4',
      title: 'Thought Leadership: So positionieren Sie sich als Marktführer',
      excerpt: 'Authentische Expertise ist der stärkste Marketing-Hebel. Wir zeigen, wie Sie glaubwürdige Inhalte erstellen, die Ihre Zielgruppe wirklich überzeugen.',
      image_url: 'https://images.pexels.com/photos/1181676/pexels-photo-1181676.jpeg?auto=compress&cs=tinysrgb&w=800',
      category: 'Marketing',
      url: '#',
      published_at: new Date(Date.now() - 14 * 864e5).toISOString(),
      read_time_min: 4,
    },
  ],
};

/* ── Widget Custom Element ────────────────────────────────── */
class LinguistFlowWidget extends HTMLElement {
  private _shadow: ShadowRoot;
  private _config: WidgetConfig | null = null;

  constructor() {
    super();
    // Shadow DOM = 100% CSS isolation from WordPress theme
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['data-widget-id', 'data-theme', 'data-lang'];
  }

  connectedCallback() {
    this._renderLoading();
    this._load();
  }

  attributeChangedCallback(_: string, old: string, next: string) {
    if (old !== next && this._config) this._load();
  }

  /* ── Inject Google Fonts INSIDE shadow DOM ─────────────── */
  private _buildStyles(): HTMLElement {
    // Google Fonts link inside shadow root
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = 'https://fonts.googleapis.com';

    const link2 = document.createElement('link');
    link2.rel = 'stylesheet';
    link2.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';

    const style = document.createElement('style');
    style.textContent = widgetCss;

    const frag = document.createDocumentFragment();
    frag.appendChild(link);
    frag.appendChild(link2);
    frag.appendChild(style);
    return frag as any;
  }

  /* ── Loading Skeleton ──────────────────────────────────── */
  private _renderLoading() {
    this._shadow.innerHTML = '';
    this._shadow.appendChild(this._buildStyles());

    const wrap = createEl('div', 'lf-widget');
    wrap.innerHTML = `
      <div class="lf-skeleton-wrap">
        <div class="lf-skeleton-featured"></div>
        <div class="lf-skeleton-grid">
          <div class="lf-skeleton-card"></div>
          <div class="lf-skeleton-card"></div>
          <div class="lf-skeleton-card"></div>
        </div>
      </div>
    `;
    this._shadow.appendChild(wrap);
  }

  /* ── Load Data ─────────────────────────────────────────── */
  private async _load() {
    const widgetId = this.getAttribute('data-widget-id');
    const apiBase = (window as any).LINGUISTFLOW_API_URL || 'https://api.linguistflow.io';

    try {
      // If a real widget ID is provided, fetch from API
      // Otherwise use mock data for demo/preview
      let config: WidgetConfig;

      if (widgetId && widgetId !== 'XYZ123-DEMO' && !widgetId.startsWith('DEMO')) {
        const res = await fetch(`${apiBase}/api/widget/${widgetId}`, {
          headers: { 'Accept': 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        config = await res.json();
      } else {
        // Demo mode — use mock data
        config = { ...MOCK_DATA };
      }

      // Theme override from attribute
      const attrTheme = this.getAttribute('data-theme') as WidgetConfig['theme'] | null;
      if (attrTheme) config.theme = attrTheme;

      // Auto theme (follows OS preference)
      if (config.theme === 'auto') {
        config.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      const attrLang = this.getAttribute('data-lang');
      if (attrLang) config.lang = attrLang;

      this._config = config;
      this._render(config);

    } catch (err) {
      console.warn('[LinguistFlow] API nicht erreichbar, Demo-Modus aktiv.', err);
      this._config = MOCK_DATA;
      this._render(MOCK_DATA);
    }
  }

  /* ── Main Render ───────────────────────────────────────── */
  private _render(cfg: WidgetConfig) {
    this._shadow.innerHTML = '';
    this._shadow.appendChild(this._buildStyles());

    if (!cfg.posts || cfg.posts.length === 0) {
      const wrap = createEl('div', 'lf-widget');
      wrap.innerHTML = `<div class="lf-error">Noch keine Artikel verfügbar.</div>`;
      this._shadow.appendChild(wrap);
      return;
    }

    const wrap = createEl('div', 'lf-widget');
    if (cfg.theme === 'dark') wrap.setAttribute('style', '');
    wrap.setAttribute('data-theme', cfg.theme);

    // Apply theme to :host
    if (cfg.theme === 'dark') {
      this.setAttribute('theme', 'dark');
    } else {
      this.removeAttribute('theme');
    }

    wrap.appendChild(this._buildHeader(cfg));

    const [featured, ...rest] = cfg.posts;

    // Featured post
    if (featured) {
      const sectionLabel = createEl('p', 'lf-section-title', 'Neuester Artikel');
      wrap.appendChild(sectionLabel);
      wrap.appendChild(this._buildFeatured(featured, cfg.lang));
    }

    // Grid posts
    if (rest.length > 0) {
      const gridLabel = createEl('p', 'lf-section-title', 'Weitere Artikel');
      wrap.appendChild(gridLabel);
      wrap.appendChild(this._buildGrid(rest, cfg.lang));
    }

    wrap.appendChild(this._buildFooter(cfg));

    this._shadow.appendChild(wrap);
  }

  /* ── Header ────────────────────────────────────────────── */
  private _buildHeader(cfg: WidgetConfig): HTMLElement {
    const header = createEl('div', 'lf-header');

    // Brand
    const brand = createEl('div', 'lf-brand');
    brand.innerHTML = `
      <div class="lf-brand-icon">${ICONS.logo}</div>
      <div>
        <span class="lf-brand-name">${cfg.blog_title || 'Blog'}</span>
        <span class="lf-brand-sub">powered by LinguistFlow KI</span>
      </div>
    `;

    // Actions
    const actions = createEl('div', 'lf-header-actions');

    const badge = createEl('span', 'lf-badge-new', `${cfg.posts.length} neue Artikel`);

    const viewAll = createEl('a', 'lf-view-all');
    viewAll.setAttribute('href', cfg.blog_url || '#');
    viewAll.innerHTML = `Alle anzeigen ${ICONS.arrow}`;

    actions.appendChild(badge);
    actions.appendChild(viewAll);

    header.appendChild(brand);
    header.appendChild(actions);
    return header;
  }

  /* ── Featured Card ─────────────────────────────────────── */
  private _buildFeatured(post: Post, lang: string): HTMLElement {
    const card = createEl('a', 'lf-featured');
    card.setAttribute('href', post.url || '#');

    const img = createEl('img', 'lf-featured-img');
    img.setAttribute('src', post.image_url);
    img.setAttribute('alt', post.title);
    img.setAttribute('loading', 'lazy');

    const overlay = createEl('div', 'lf-featured-overlay');

    const content = createEl('div', 'lf-featured-content');
    content.innerHTML = `
      <div class="lf-featured-meta">
        <span class="lf-tag">${post.category}</span>
        <span class="lf-date">${formatDate(post.published_at, lang)}</span>
      </div>
      <h2 class="lf-featured-title">${post.title}</h2>
      <p class="lf-featured-excerpt">${post.excerpt}</p>
      <a href="${post.url || '#'}" class="lf-read-btn">
        Artikel lesen ${ICONS.arrow}
      </a>
    `;

    card.appendChild(img);
    card.appendChild(overlay);
    card.appendChild(content);
    return card;
  }

  /* ── Grid ──────────────────────────────────────────────── */
  private _buildGrid(posts: Post[], lang: string): HTMLElement {
    const grid = createEl('div', 'lf-grid');
    posts.forEach(post => grid.appendChild(this._buildCard(post, lang)));
    return grid;
  }

  /* ── Card ──────────────────────────────────────────────── */
  private _buildCard(post: Post, lang: string): HTMLElement {
    const card = createEl('a', 'lf-card');
    card.setAttribute('href', post.url || '#');

    // Image
    const imgWrap = createEl('div', 'lf-card-img-wrap');
    const img = createEl('img');
    img.setAttribute('src', post.image_url);
    img.setAttribute('alt', post.title);
    img.setAttribute('loading', 'lazy');
    imgWrap.appendChild(img);

    // Body
    const body = createEl('div', 'lf-card-body');

    const meta = createEl('div', 'lf-card-meta');
    meta.innerHTML = `
      <span class="lf-tag-pill">${post.category}</span>
      <span class="lf-card-date">${formatDate(post.published_at, lang)}</span>
    `;

    const title = createEl('h3', 'lf-card-title', post.title);
    const excerpt = createEl('p', 'lf-card-excerpt', post.excerpt);

    const footer = createEl('div', 'lf-card-footer');
    footer.innerHTML = `
      <span class="lf-card-readmore">
        Lesen ${ICONS.arrow}
      </span>
      <span class="lf-read-time">${ICONS.clock} ${post.read_time_min} Min.</span>
    `;
    // Fix clock icon style
    const clockSvg = footer.querySelector('.lf-read-time svg') as SVGElement;
    if (clockSvg) {
      clockSvg.style.cssText = 'width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-1px;margin-right:3px;';
    }

    body.appendChild(meta);
    body.appendChild(title);
    body.appendChild(excerpt);
    body.appendChild(footer);

    card.appendChild(imgWrap);
    card.appendChild(body);
    return card;
  }

  /* ── Footer ────────────────────────────────────────────── */
  private _buildFooter(cfg: WidgetConfig): HTMLElement {
    const footer = createEl('div', 'lf-footer');

    footer.innerHTML = `
      <div class="lf-footer-brand">
        <span>KI-Artikel von</span>
        <div class="lf-footer-dot"></div>
        <strong>LinguistFlow</strong>
      </div>
      <a href="${cfg.blog_url || '#'}" class="lf-subscribe-btn">
        ${ICONS.bell} Alle Artikel
      </a>
    `;

    // Fix bell SVG style
    const bell = footer.querySelector('.lf-subscribe-btn svg') as SVGElement;
    if (bell) {
      bell.style.cssText = 'width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;';
    }

    return footer;
  }
}

/* ── Register Custom Element ─────────────────────────────── */
if (!customElements.get('linguistflow-root')) {
  customElements.define('linguistflow-root', LinguistFlowWidget);
}

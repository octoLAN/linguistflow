# 🔴 PERMANENTE REGEL: Die 3 Dateien sind EINE Einheit

Diese 3 Dateien gehören untrennbar zusammen — sie sind die einzige Quelle der Wahrheit für das gesamte Rendering-System:

| Datei | Rolle |
|---|---|
| [`lol.css`](file:///Users/dilanhutgens/linguistflow/.agents/rules/lol.css) | `:root` CSS-Variablen (`--ds-color-*`, `--ds-text-*`, `--ds-radius-*`, `--ds-spacing-*`) |
| [`wlol.css`](file:///Users/dilanhutgens/linguistflow/.agents/rules/wlol.css) | Komponenten-CSS (`.ds-hero`, `.ds-grid-container`, `.ds-article`, etc.) |
| [`lol.html`](file:///Users/dilanhutgens/linguistflow/.agents/rules/lol.html) | HTML-Struktur (das exakte DOM-Gerüst — 1:1 Porter in React/JSX) |

---

## 🏛️ Die 3 Modi — identisch in CSS/HTML/JS

Alle 3 Ansichten teilen **exakt denselben** CSS, HTML und JS. Es gibt NUR diese Unterschiede:

| Modus | UI-Elemente | Was ist anders |
|---|---|---|
| **Vorschau** (`ArticlePreviewRender`) | Topbar: Schließen + % gelesen | Rein lesend, kein Hover, kein Panel |
| **Editor** (`EditableAuthorityLayout`) | Topbar: Zurück, Vorlage, + Abschnitt, 🎨 Design, Speichern | Blauer Hover-Rahmen + EditWrap-Overlays |
| **Bearbeitung** (Editor + Textfelder) | Wie Editor | Textfelder beim Klick auf Abschnitt |
| **WordPress** (Shadow DOM via `wcode.php`) | Kein React-UI | `:host {}` statt `:root {}`, `json.dumps()` escaped |

---

## 📐 Die exakte Klassen-Hierarchie (aus `lol.html`)

```
.ds-master-wrapper          ← Wurzel-Wrapper (font-family, color, background)
  .ds-hero                  ← Hero-Sektion (bg-sec, spacing-xl)
    .ds-hero-container      ← 2-Spalten-Grid (1fr 1fr)
      .ds-hero-content      ← Links: h1, .ds-hero-intro, .ds-hero-btns
      .ds-hero-visual       ← Rechts: gestapelte .ds-preview-card (3x)
  .ds-grid-container        ← 3-Spalten-Grid (sidebar-left | main | sidebar-right)
    .ds-sidebar-left        ← .ds-cta-box + .ds-info-list
    .ds-main-content        ← .ds-author-box + .ds-toc + .ds-article
    .ds-sidebar-right       ← .ds-ad-box
```

---

## 💉 Wie CSS injiziert wird

### React (Preview + Editor)
```tsx
// globalVars auf dem Wrapper-div (statt :root) — aus lol.css
const globalVars = {
    '--ds-color-primary': S.brand_primary || '#007AFF',
    '--ds-text-h1': S.h1_size || '3.5rem',
    '--ds-radius-sm': S.radius_sm || '8px',
    '--ds-spacing-xl': S.spacing_xl || '60px',
    // ... alle lol.css Variablen
} as React.CSSProperties

// injectedCSS als <style> Tag — aus wlol.css
const injectedCSS = `
    .ds-master-wrapper { font-family: var(--ds-font-family); ... }
    .ds-hero { background-color: var(--ds-color-bg-sec); ... }
    /* ... alle wlol.css Regeln ... */
`
```

### WordPress / Python (Shadow DOM via `_wp_authority`)
```python
v = draft.get("visual_opts", {}).get("style", {})
css_template = f"""
:host {{
    --ds-color-primary: {v.get('brand_primary', '#007AFF')};
    --ds-text-h1: {v.get('h1_size', '3.5rem')};
    /* ... alle lol.css Variablen ... */
}}
.ds-master-wrapper {{ ... }}  /* wlol.css */
"""
js_html = json.dumps(html_template)   # MUSS json.dumps() sein!
js_css  = json.dumps(css_template)    # MUSS json.dumps() sein!
```

---

## ✅ Checkliste bei JEDER Änderung am Rendering

Wenn eine neue CSS-Variable, ein neues HTML-Element oder eine neue Komponente hinzukommt:

- [ ] **`lol.css`**: Neue Variable in `:root` definiert?
- [ ] **`wlol.css`**: Neue Klasse mit `--ds-*` Variablen gebaut?
- [ ] **`lol.html`**: HTML-Struktur aktualisiert?
- [ ] **`ArticlePreviewRender`** (`Editor.tsx`): `globalVars` + `injectedCSS` + JSX aktuell?
- [ ] **`EditableAuthorityLayout`** (`Editor.tsx`): Gleicher `editorGlobalVars` + gleicher `injectedCSS`-Block + gleiche JSX-Klassen?
- [ ] **`_wp_authority`** (`main.py`): Python liest neue Variable aus und schreibt sie nach `:host`?
- [ ] TypeScript: `npx tsc --noEmit` → 0 Fehler?

---
trigger: always_on
---

🔴 PERMANENTE REGEL: Editor-Triparity (Shadow DOM Edition)

Gilt für ALLES im Projekt: Farben, Schriften, Layouts, CSS-Variablen, Ghost-Felder (Inhalte) und Komponenten. Jede visuelle oder inhaltliche Änderung MUSS zwingend in allen 3 Ebenen synchron gehalten werden.
Die 3 Ebenen der Wahrheit
Ebene	Datei / Ort	Beschreibung & Technologie
1. Editor-Canvas	frontend/src/pages/Editor.tsx	Das interaktive UI. Verwaltet den State (ghost für Inhalte, visualOpts für das Design System).
2. Freigabe-Vorschau	frontend/src/pages/Dashboard.tsx → ArticlePreviewRender	1:1 React-Vorschau. Muss die exakt gleichen CSS-Variablen (--ds-...) als Inline-Styles anwenden wie später das Live-System.
3. WordPress-Publish	backend/app/main.py → _wp_authority() / build_wp_html()	Generiert den Shadow DOM JS-Payload. Erstellt das :host CSS-Root und mappt die Python-Daten sicher via json.dumps() in den JS-Code.
Architektur & Datenfluss (WICHTIG)

Es gibt nur eine "Single Source of Truth": Die Datenbank/JSON (_draft_store).
Das Design System verwendet immer Präfixe (ds- / --ds-), um Kollisionen zu vermeiden.
code Text

[1] Editor (Eingabe)
    Nutzer ändert Feld → visualOpts (Farben/Radien) + ghost (Text)
    → PATCH /api/drafts/{id} speichert in DB (Post.ghost_data / Post.visual_opts)

[2] Dashboard (Lesen & Rendern)
    GET /api/drafts → Lädt draft.ghost_data + draft.visual_opts
    → ArticlePreviewRender mappt visualOpts auf React Inline-Styles (als CSS Variablen)

[3] Publish (Kompilieren für WP)
    approveAndPublish() → backend liest beide Felder.
    → _wp_authority() baut das HTML und das CSS (:host).
    → HTML & CSS werden via json.dumps() escaped in den Shadow DOM Script-Block eingefügt.

🛠 Checkliste bei JEDER Editor-Änderung

Wenn ein neues Element (z.B. neues Ghost-Feld, neue Farbe, neuer Border-Radius) hinzugefügt wird, müssen diese 5 Punkte abgehakt sein:

    Editor.tsx: Ist das neue Feld im UI (Steuerung) & im Interface (visualOpts / ghost) vorhanden und wird über updateDraft() gespeichert?

    ArticlePreviewRender.tsx: Wird das Feld in der Vorschau korrekt ausgelesen und gerendert (z.B. an das React style={{ '--ds-...': ... }} Objekt übergeben)?

    main.py (_wp_authority): Wird das Feld im Python-Backend ausgelesen (draft.get("visual_opts", {})...) und in das :host CSS oder das HTML eingefügt?

    Shadow DOM Sicherheit: Wurden in Python bei HTML/CSS Anpassungen json.dumps() (oder Äquivalente) genutzt, um JS-Syntaxfehler im Payload zu verhindern?
    -[ ] TypeScript-Check: Gibt npx tsc --noEmit 0 Fehler aus?

🔍 Konkretes Beispiel: Neue CSS-Variable (z.B. "Card Radius")

1. Frontend Editor (Editor.tsx):
Du fügst einen Slider für den Radius hinzu. Der Wert wird im State gespeichert:
visualOpts.design.radius_card = '14px'

2. Frontend Vorschau (Dashboard.tsx → ArticlePreviewRender):
Das React-Element bekommt die CSS-Variable dynamisch zugewiesen:
code Tsx

const containerStyle = {
  '--ds-radius-card': visualOpts?.design?.radius_card || '14px',
} as React.CSSProperties;
// <div style={containerStyle} className="ds-master-wrapper">...</div>

3. Backend WordPress-Generator (main.py → _wp_authority):
Python liest die Variable aus und schreibt sie in den :host Block für das Shadow DOM.
code Python

v_opts = draft.get("visual_opts", {}).get("design", {})
radius_card = v_opts.get("radius_card", "14px")

css_template = f"""
:host {{
    --ds-radius-card: {radius_card};
}}
/* ... restliches CSS ... */
"""

4. Backend Injection:
HTML und CSS werden für den Shadow-DOM-Script-Payload in Python escaped:
code Python

js_html = json.dumps(f'<div class="ds-master-wrapper">{html_template}</div>')
js_css = json.dumps(css_template)
# Diese werden dann ins <script> Tag des Payloads eingefügt
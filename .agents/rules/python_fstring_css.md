---
description: Python f-String CSS Escaping Regel — verhindert NameError in WP-Publisher
locked: true
last_approved: 2026-02-28
---

# 🔴 PERMANENTE REGEL: CSS in Python f-Strings — Doppelte geschwungene Klammern

**Gilt für ALLE CSS-Blöcke in `main.py` (und jede andere Python-Datei mit f-Strings).**

## Das Problem

In Python f-Strings werden `{` und `}` als Variablen-Platzhalter interpretiert.
CSS verwendet `{` und `}` überall für Selektor-Blöcke.
Ohne Escaping → `NameError: name 'background' is not defined` (oder beliebige CSS-Eigenschaft).

## Die Regel

**Alle CSS-Klammern in Python f-Strings MÜSSEN verdoppelt werden:**

```python
# ❌ FALSCH — führt zu NameError
css = f"""
.ds-hero {{ color: red; }}
.ds-cta { background: blue; }   ← FEHLER: Python interpretiert 'background' als Variable
"""

# ✅ RICHTIG — alle CSS-Klammern verdoppelt
css = f"""
.ds-hero {{ color: red; }}
.ds-cta {{ background: blue; }}
"""
```

## Checkliste bei JEDER CSS-Änderung in main.py

- [ ] Neue CSS-Zeilen im f-String? → Alle `{` und `}` verdoppeln: `{{` und `}}`
- [ ] Inline-CSS-Blöcke (z.B. in HTML-Tags als `style="..."`) sind sicher — dort keine Klammern
- [ ] Testen mit: `poetry run python -c "from app.main import build_wp_html; build_wp_html({})"` oder ähnlichem Smoke-Test

## Betroffene Dateien

- `backend/app/main.py` → `_wp_authority()`, `_wp_immersive()`, `_wp_datahub()`
- Jede weitere Python-Datei mit mehrzeiligen CSS-f-Strings

## Merkhilfe

> **Faustregel:** CSS-Klammer `{` → immer `{{` in f-Strings.  
> Nur Variablen wie `{col_primary}` bleiben einfach.

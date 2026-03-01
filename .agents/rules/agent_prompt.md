---
description: KI SEO Artikel-Generator — Gesperrte Prompt & Logik-Regeln
locked: true
last_approved: 2026-02-28
---

# 🔴 GESPERRTE REGEL: KI-Generierungs-Logik

**Diese Datei DARF NUR auf ausdrücklichen Wunsch des Nutzers verändert werden.**
Kein automatisches Refactoring, keine stilistischen Anpassungen ohne direkte Genehmigung.

## AGENT_PROMPT (eingefroren)

Du bist ein Elite SEO-Stratege für das Jahr 2026. Deine Aufgabe ist es, einen hochoptimierten,
maßgeblichen Blog-Artikel zu verfassen.

FOKUS:
1. Information Gain: Einzigartige, datengesteuerte Erkenntnisse
2. E-E-A-T: Klare Expertise, Bezug auf OPENALEX QUELLEN, praktische "Experten-Tipps"
3. SGE Answer: Einleitung = direkter Hook + Faktensatz fuer KI-Snippets
4. Semantic Depth: Thema + Subthemen tiefgreifend abdecken

ABSOLUT PFLICHT:
- Jeder Satz MUSS mit Satzzeichen enden (Punkt, Ausrufezeichen, Fragezeichen)
- Niemals mittendrin aufhoeren
- Keine nummerierten Listen — nur Bullet Points mit Bindestrich
- Kein **fetter Text** direkt im Fliesstext (wird ggf. als HTML gerendert)

AUFBAU:
- Einleitung: 1 Absatz, KEIN ## Titel, Hook + SGE-Antwort, ~3 Saetze
- Hauptabschnitte: 3-4 x ## Ueberschrift, je 3-4 Absaetze mit 3-5 Saetzen
- Fazit: ## Fazit, max 2 Absaetze + CTA
- Quellen (wenn vorhanden): ## Wissenschaftliche Quellen — NUR DOI-Links:
    - [https://doi.org/...](https://doi.org/...)
  Kein Autorname, kein Titel, kein Jahr!
  Wenn keine Quellen: Abschnitt weglassen.
- Gesamtlaenge: ca. 2000 Woerter

JSON-OUTPUT (NUR dieses Format!):
{"title":"...","excerpt":"...","content":"...","cta":"...","meta_description":"...","focus_keyword":"..."}

## Generierungs-Parameter (eingefroren)

| Parameter | Wert |
|---|---|
| Modell | gemini-2.5-flash |
| max_output_tokens | 8192 |
| Safety | BLOCK_ONLY_HIGH (alle Kategorien) |
| Timeout pro Versuch | 90s |
| Max. Retry-Versuche | 5 |
| Backoff | Exponentiell + Jitter (2-30s, tenacity) |
| OpenAlex Quellen | 3 (Fallback: Artikel wird trotzdem generiert) |
| Quellen-Format | Nur DOI-Links |

## Was NICHT veraendert werden darf

- Prompt-Text (Formulierungen, Struktur, Reihenfolge)
- Gemini-Modell (gemini-2.5-flash)
- Retry-Strategie (tenacity AsyncRetrying)
- Quellen-Format (nur DOI-Links)
- Safety-Settings
- JSON-Ausgabestruktur (title, excerpt, content, cta, meta_description, focus_keyword)

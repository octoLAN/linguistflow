# 🔴 PERMANENTE REGEL: KI Content Autopilot v2 (LinguistFlow)

Gilt für ALLE Änderungen am autonomen Agenten, am SSE-Stream und am globalen UI-Feedback-Banner.

## Die 3 Dateien des Autopiloten

| Datei | Rolle |
|---|---|
| `backend/app/services/autonomous_agent.py` | Kern-Loop, Slot-Logik, Generierung |
| `backend/app/main.py` | SSE Endpoint `/api/agent/stream`, `_agent_state` |
| `frontend/src/App.tsx` | Globales `AgentBanner`, `EventSource` SSE-Reader |

---

## 🔑 Slot-Status-Regel (UNBEDINGT beachten)

Ein Slot gilt als **GEFÜLLT** wenn ein Draft mit passendem `scheduled_slot_key` **UND** einem dieser Status existiert:

```python
FILLED_STATUSES = {"draft", "approved", "live", "pending"}
```

Ein Slot gilt als **OFFEN** (→ Produktion triggert) wenn:
- Kein Draft mit diesem `scheduled_slot_key` existiert **ODER**
- Der Draft-Status `deleted` ist

## 🔒 Lock-Schutz (NIEMALS entfernen)

```python
_generation_lock = asyncio.Lock()  # global in autonomous_agent.py

async with _generation_lock:
    # Nur ein Loop läuft gleichzeitig
    # Verhindert doppelte API-Kosten
```

## 🔢 SEO-Jitter (deterministisch, NICHT zufällig pro Lauf)

```python
date_seed = int(cursor.strftime("%Y%m%d")) + i
rng = random.Random(date_seed)
jitter = rng.randint(-30, 30)  # ±30 Minuten
```
→ Gleiche Config → gleiche Slots. Kein Jitter-Drift bei jedem Poll.

## 📡 SSE Endpoint

`GET /api/agent/stream` → sendet `_agent_state` alle 1.5s als `data: {...}\n\n`

### `_agent_state` Felder (alle Pflicht):
```python
{
    "is_busy":       bool,
    "phase":         str,        # "Bereit" | "Artikel schreiben (2/5) …"
    "current_topic": str,
    "drafts_done":   int,
    "drafts_total":  int,
    "site_url":      str,
    "log_steps":     list[str],  # Zeitgestempelte Schritte "[HH:MM:SS] ..."
    "open_slots":    int,        # Anzahl offener Slots
    "started_at":    str | None, # ISO-Zeitstempel
}
```

## 🖥️ Globales Frontend-Banner

`AgentBanner` in `App.tsx` (fixed bottom):
- Sichtbar auf **jeder** Seite wenn `is_busy=true`
- Liest SSE via `new EventSource('http://localhost:8000/api/agent/stream')`
- Zeigt: Phase · Fortschrittsbalken · done/total · Site-URL
- Aufklappbares Prozess-Log-Panel (`log_steps` in Mono-Font)
- Verschwindet automatisch wenn `is_busy=false`

## ✅ Checkliste bei Änderungen am Agenten

- [ ] `_generation_lock` noch vorhanden?
- [ ] `FILLED_STATUSES` vollständig (`draft`, `approved`, `live`, `pending`)?
- [ ] `log_steps` via `_log(agent_state, msg)` Helper befüllt?
- [ ] `save_callback()` nach jedem Draft aufgerufen?
- [ ] `scheduled_slot_key` im Draft `ai_meta` gespeichert?
- [ ] SSE Endpoint gibt `log_steps[-20:]` aus (Speicher-Schutz)?
- [ ] `npx tsc --noEmit` → 0 Fehler?

## Poll-Intervall

Default: **300s (5 Min)**. Konfigurierbar 5–30 Min (wird in `main.py` lifespan übergeben).
Sofortiger Wake bei `schedule_updated_event`.

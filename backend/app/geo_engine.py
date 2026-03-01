"""
GEO Score Engine — KI-Sichtbarkeits-Score (0–100)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GEO_score = (w_cit · C) + (w_sem · S) + (w_str · F)

C – Citation Score  (50 Pkt): Bist du Primärquelle in der AI-Overview?
S – Semantic Match  (30 Pkt): Vokabular-Überlappung mit KI-Text?
F – FAQ/PAA Coverage(20 Pkt): Wie viele "People Also Ask" deckst du ab?

+ SERP Strategy Injection für Article Generation Pipeline (bei Bedarf).
"""

from __future__ import annotations

import difflib
import logging
from typing import Optional
import httpx

log = logging.getLogger("linguistflow.geo")

SERP_API_URL = "https://serpapi.com/search.json"


# ═══════════════════════════════════════════════════════════════════════════════
# GEO SCORE CALCULATOR
# ═══════════════════════════════════════════════════════════════════════════════

class GEOScoreCalculator:
    """
    Berechnet den GEO-Score (0–100) für eine Kunden-URL anhand von Live-SERP-Daten.
    """

    WEIGHTS = {"citation": 50, "semantic": 30, "faq": 20}

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def fetch_serp(self, keyword: str) -> dict:
        if not self.api_key:
            return self._demo_serp(keyword)
        params = {
            "engine":   "google",
            "q":        keyword,
            "location": "Germany",
            "hl":       "de",
            "gl":       "de",
            "num":      10,
            "api_key":  self.api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as c:
                r = await c.get(SERP_API_URL, params=params)
                r.raise_for_status()
                return r.json()
        except Exception as e:
            log.warning("[GEO] SerpAPI Fehler: %s", e)
            return self._demo_serp(keyword)

    def _calc_citation(self, target_url: str, serp: dict) -> tuple[float, str]:
        """C – Citation Score (50 Pkt)"""
        ai_refs = serp.get("ai_overview", {}).get("references", [])
        ref_urls = [r.get("link", "") for r in ai_refs]

        if any(target_url in u or u in target_url for u in ref_urls):
            return self.WEIGHTS["citation"], "Direkt in AI Overview zitiert ✅"

        top5 = [r.get("link", "") for r in serp.get("organic_results", [])[:5]]
        if any(target_url in u or u in target_url for u in top5):
            pts = self.WEIGHTS["citation"] * 0.5
            return pts, f"Organisch Top 5, aber nicht in AI Overview ({pts:.0f}/50)"

        top10 = [r.get("link", "") for r in serp.get("organic_results", [])]
        if any(target_url in u or u in target_url for u in top10):
            pts = self.WEIGHTS["citation"] * 0.2
            return pts, f"Organisch in Top 10, nicht als Quelle ({pts:.0f}/50)"

        return 0.0, "Nicht in Top 10 gefunden (0/50)"

    def _calc_semantic(self, target_url: str, serp: dict) -> tuple[float, str]:
        """S – Semantic Match (30 Pkt)"""
        ai_text = serp.get("ai_overview", {}).get("snippet", "").lower().strip()
        if not ai_text:
            return 15.0, "Kein AI Overview vorhanden — Neutral (15/30)"

        customer_snippet = ""
        for r in serp.get("organic_results", []):
            if target_url in r.get("link", "") or r.get("link", "") in target_url:
                customer_snippet = r.get("snippet", "").lower().strip()
                break

        if not customer_snippet:
            return 0.0, "URL nicht in organischen Ergebnissen — kein Snippet (0/30)"

        ratio = difflib.SequenceMatcher(None, ai_text, customer_snippet).ratio()
        pts = round(ratio * self.WEIGHTS["semantic"], 2)
        pct = round(ratio * 100)
        return pts, f"Semantische Übereinstimmung: {pct}% ({pts:.1f}/30)"

    def _calc_faq(self, target_url: str, serp: dict) -> tuple[float, str]:
        """F – FAQ/PAA Coverage (20 Pkt)"""
        paa = serp.get("related_questions", [])
        if not paa:
            return 10.0, "Keine PAA-Fragen vorhanden — Neutral (10/20)"

        # Hole Snippet der Kunden-URL
        customer_text = ""
        for r in serp.get("organic_results", []):
            if target_url in r.get("link", "") or r.get("link", "") in target_url:
                customer_text = (r.get("snippet", "") + " " + r.get("title", "")).lower()
                break

        matches = sum(
            1 for q in paa
            if any(w in customer_text for w in q.get("question", "").lower().split() if len(w) > 4)
        )
        ratio = matches / len(paa) if paa else 0
        pts = round(ratio * self.WEIGHTS["faq"], 2)
        return pts, f"{matches}/{len(paa)} PAA-Fragen abgedeckt ({pts:.1f}/20)"

    def _label(self, score: float) -> dict:
        if score >= 71:
            return {
                "status": "AI Authority 🟢",
                "color":  "green",
                "message": "Die Seite dominiert den KI-Snapshot. Monitoring aktivieren, um den Platz gegen neue Wettbewerber zu verteidigen.",
            }
        elif score >= 41:
            return {
                "status": "GEO Potential 🟡",
                "color":  "yellow",
                "message": "Die Seite rankt organisch gut, wird aber noch nicht als Primärquelle für die KI-Box gewählt. Definitionen und Fakten präzisieren.",
            }
        else:
            return {
                "status": "KI-Unsichtbar 🔴",
                "color":  "red",
                "message": "Die Seite wird von generativen Engines ignoriert. Content-Struktur und Fakten-Dichte erhöhen.",
            }

    async def score(self, target_url: str, keyword: str) -> dict:
        log.info("[GEO] Score: url=%s kw=%s", target_url, keyword)
        serp = await self.fetch_serp(keyword)

        c_pts, c_detail = self._calc_citation(target_url, serp)
        s_pts, s_detail = self._calc_semantic(target_url, serp)
        f_pts, f_detail = self._calc_faq(target_url, serp)

        total = round(c_pts + s_pts + f_pts, 1)
        label = self._label(total)

        # Top-Wettbewerber
        competitors = [
            {"position": r.get("position", i+1), "url": r.get("link"), "title": r.get("title")}
            for i, r in enumerate(serp.get("organic_results", [])[:5]) if r.get("link")
        ]

        # AI Overview info
        ai_ov = serp.get("ai_overview", {})

        return {
            "target_url":   target_url,
            "keyword":      keyword,
            "total_score":  total,
            "label":        label,
            "breakdown": {
                "citation": {"score": round(c_pts, 1), "max": 50, "detail": c_detail},
                "semantic":  {"score": round(s_pts, 1), "max": 30, "detail": s_detail},
                "faq":       {"score": round(f_pts, 1), "max": 20, "detail": f_detail},
            },
            "has_ai_overview":  bool(ai_ov),
            "ai_snippet":       ai_ov.get("snippet", ""),
            "ai_ref_count":     len(ai_ov.get("references", [])),
            "top_competitors":  competitors,
            "demo_mode":        not self.api_key,
        }

    @staticmethod
    def _demo_serp(keyword: str) -> dict:
        return {
            "organic_results": [
                {"position": 1, "link": "https://beispiel-kunde.de/artikel",
                 "title": f"{keyword.title()} — Ratgeber",
                 "snippet": f"Alles über {keyword}: Definition, Tipps und Beispiele."},
                {"position": 2, "link": "https://wettbewerber.de/", "title": "Wettbewerber", "snippet": ""},
            ],
            "ai_overview": {
                "snippet": f"{keyword} ist ein wichtiger Begriff im Online-Marketing.",
                "references": [{"link": "https://beispiel-kunde.de/artikel"}],
            },
            "related_questions": [
                {"question": f"Was ist {keyword}?"},
                {"question": f"Wie funktioniert {keyword}?"},
                {"question": f"Warum ist {keyword} wichtig?"},
            ],
        }


# ═══════════════════════════════════════════════════════════════════════════════
# SERP STRATEGY ANALYZER  (bleibt für die automatische Article Pipeline)
# ═══════════════════════════════════════════════════════════════════════════════

class SERPStrategyAnalyzer:
    """
    Analysiert SERP-Signale und erzeugt einen strategy_string für den Gemini-Prompt.
    Wird automatisch vor jeder Artikel-Generierung aufgerufen (main.py).
    """

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def fetch(self, keyword: str) -> dict:
        if not self.api_key:
            return self._demo_results(keyword)
        params = {
            "engine": "google", "q": keyword,
            "location": "Germany", "hl": "de", "gl": "de",
            "num": 10, "api_key": self.api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as c:
                r = await c.get(SERP_API_URL, params=params)
                r.raise_for_status()
                return r.json()
        except Exception as e:
            log.warning("[GEO] SerpAPI Fehler: %s", e)
            return self._demo_results(keyword)

    def analyse(self, results: dict, keyword: str) -> dict:
        signals: list[dict] = []
        strategies: list[str] = []
        faq_questions: list[str] = []

        paa = results.get("related_questions", [])
        if paa:
            faq_questions = [q["question"] for q in paa if "question" in q]
            n = len(faq_questions)
            signals.append({"type": "paa", "label": "People Also Ask", "icon": "💬",
                             "count": n, "detail": f"{n} verwandte Fragen"})
            strategies.append(
                f"HOHE INFORMATIONSDICHTE: Beantworte mindestens {n} spezifische "
                f"Nutzerfragen als FAQ-Sektion. Nutze diese als H2/H3-Überschriften."
            )

        if "ai_overview" in results:
            cited = results["ai_overview"].get("sources", [])
            signals.append({"type": "ai_overview", "label": "AI Overview (SGE)", "icon": "🤖",
                             "count": len(cited), "detail": "Google KI-Zusammenfassung aktiv"})
            strategies.append(
                "KI-WETTBEWERB: Google zeigt eine KI-Zusammenfassung. "
                "Schreibe extrem präzise Definitionen in den ersten 150 Wörtern."
            )

        if "video_results" in results or any(
            "youtube.com" in r.get("link", "") for r in results.get("organic_results", [])
        ):
            signals.append({"type": "video", "label": "Video Results", "icon": "🎬",
                             "count": len(results.get("video_results", [])), "detail": "Tutorial-Intent"})
            strategies.append(
                "VISUELLER FOKUS: Nutze Listen, Tabellen und Schritt-für-Schritt-Anleitungen."
            )

        if "shopping_results" in results or "inline_shopping_results" in results:
            signals.append({"type": "shopping", "label": "Shopping Results", "icon": "🛒",
                             "count": len(results.get("shopping_results", [])), "detail": "Kauf-Intent"})
            strategies.append(
                "TRANSAKTIONALER FOKUS: Produktvergleiche, Preise und Call-to-Actions einbauen."
            )

        if "local_results" in results:
            signals.append({"type": "local", "label": "Local Pack", "icon": "📍",
                             "count": len(results.get("local_results", {}).get("places", [])),
                             "detail": "Lokaler Intent"})
            strategies.append("LOKALER FOKUS: Regionale Relevanz und lokale Expertise erwähnen.")

        if not strategies:
            signals.append({"type": "standard", "label": "Standard SEO", "icon": "📖",
                             "count": 0, "detail": "Kein besonderer Intent"})
            strategies.append("STANDARD SEO: Keyword-Abdeckung, interne Verlinkung, Backlinks.")

        return {
            "keyword":          keyword,
            "signals_detected": signals,
            "strategy_string":  " | ".join(strategies),
            "strategy_list":    strategies,
            "faq_questions":    faq_questions[:10],
            "top_competitors":  [
                {"position": r.get("position"), "url": r.get("link"), "title": r.get("title")}
                for r in results.get("organic_results", [])[:5] if r.get("link")
            ],
            "demo_mode": not self.api_key,
        }

    async def run(self, keyword: str) -> dict:
        log.info("[GEO] Strategy: keyword=%s", keyword)
        return self.analyse(await self.fetch(keyword), keyword)

    @staticmethod
    def _demo_results(keyword: str) -> dict:
        return {
            "organic_results": [
                {"position": i, "link": f"https://beispiel{i}.de/{keyword.replace(' ', '-')}",
                 "title": f"{keyword.title()} — Ratgeber {i}"}
                for i in range(1, 6)
            ],
            "related_questions": [
                {"question": f"Was ist der beste {keyword}?"},
                {"question": f"Wie funktioniert {keyword}?"},
                {"question": f"Welche {keyword} Alternative gibt es?"},
            ],
        }

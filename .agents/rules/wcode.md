---
trigger: always_on
---

🔴 PERMANENTE REGEL: wcode.php Architektur (WP Shadow DOM Master)

Gilt für ALLES im Bereich WordPress-Publishing, Template-Generierung und Design-System-Updates. Die Datei wcode.php ist das absolute Master-Template. Jede Änderung, jede neue Komponente und jeder API-Push MUSS exakt der Architektur und den Sicherheitsstandards aus wcode.php folgen.
Die 5 unumstößlichen Säulen der wcode.php

Jedes Skript, das Content an WordPress sendet, muss diese Struktur aus der wcode.php adaptieren:
Säule	Prinzip (Wie in wcode.php definiert)
1. Shadow DOM & Breakout	WordPress-Themes werden isoliert und gesprengt. Das CSS muss zwingend auf den :host Selektor angewendet werden. Der Breakout-Trick (width: 100vw; margin-left: -50vw;) im :host ist Pflicht, um Theme-Container zu ignorieren.
2. Zentrales Variablen-System	Keine hardgecodeten Werte! Alle Farben, Radien und Abstände müssen als --ds- Variablen im :host definiert sein. Das Design wird ausschließlich über diese Variablen gesteuert (60-30-10 Regel).
3. Striktes Namespace-Präfix	Um Konflikte zu 100% zu vermeiden, MÜSSEN alle HTML-Klassen, IDs und CSS-Variablen das Präfix ds- tragen (z.B. .ds-hero, #ds-shadow-host).
4. Bombensichere Injektion	HTML- und CSS-Strings dürfen im JavaScript niemals manuell mit Backticks/Quotes eingefügt werden. Sie müssen serverseitig sicher escaped werden: $js_html = json_encode($html); – genau wie in der wcode.php vorgemacht.
5. Anti-FOUC (Skeleton Loader)	Kein Flackern beim Laden! Der JS-Payload muss zwingend mit dem Skeleton-Loader (<div id="ds-shadow-host"> mit ds-pulse Animation) starten, der erst vom JS geleert wird (host.innerHTML = '';), wenn das DOM bereit ist.
🛠 Checkliste bei Template- oder API-Änderungen

Wenn ein neues Layout entworfen oder der Code aus wcode.php in ein Python/Node.js-Backend übersetzt wird, MUSS die KI/der Entwickler folgende Punkte abhaken:

    Referenz-Check: Stimmt die Basis-Struktur mit wcode.php überein?
    -[ ] Variablen-Check: Liegen alle --ds- Variablen auf :host statt auf :root?

    DOM Queries: Nutzt das JS shadow.querySelector anstelle von document.querySelector für Inhalte innerhalb des Artikels?

    JSON-Escaping: Wurden die HTML/CSS-Blöcke vor der JS-Injektion durch json_encode() (bzw. json.dumps()) gejagt?

    Theme-Cleaner: Wird der hideJunk-Style (Verstecken von #comments, .entry-meta etc.) ins globale document.head injiziert?

🚫 Absolute Tabus (Führen zum sofortigen Abbruch)

    NIEMALS Standard-HTML-Klassen (wie .container, .button, .wrapper) verwenden. Immer .ds-container etc.

    NIEMALS JavaScript-Variablen mit un-escaped HTML füllen (z.B. const html = <div>${content}</div>;). Das führt zu Syntax-Errors, wenn der Text Quotes oder Zeilenumbrüche enthält.

    NIEMALS das Design direkt in den Elementen stylen (style="color: red;"). Alles muss auf die --ds- Variablen im :host der wcode.php zurückzuführen sein.
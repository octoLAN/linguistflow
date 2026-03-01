<?php
/**
 * ==============================================================================
 * 🔴 MASTER-VORLAGE: WordPress Shadow DOM Publisher & Design System
 * ==============================================================================
 * Architektur:
 * 1. Shadow DOM (Isolierung vor Theme-CSS)
 * 2. Breakout-Trick (100vw Breite unabhängig vom Theme-Container)
 * 3. Modulares Design System (CSS-Variablen auf :host, ds- Namespace)
 * 4. FOUC-Prevention (Skeleton Loader während des Renderns)
 * 5. Bulletproof Injection (json_encode für HTML/CSS)
 * ==============================================================================
 */

// ==============================================================================
// 1. KONFIGURATION (API & Zieldaten)
// ==============================================================================
$wp_url = 'https://deine-website.de/wp-json/wp/v2/posts';
$username = 'dein_benutzername';
$app_password = 'abcd efgh ijkl mnop qrst';
$post_title = 'Master-Vorlage: Shadow DOM & Design System';

// ==============================================================================
// 2. HTML: MODULARES DESIGN SYSTEM (Nur ds- Klassen erlaubt!)
// ==============================================================================
$html_content = <<<HTML
<!-- 0. Lese-Fortschrittsbalken -->
<div id="reading-progress"></div>

<!-- 1. HERO SEKTION -->
<section class="ds-hero">
    <div class="ds-hero-container">
        <!-- Text & Breadcrumbs -->
        <div class="ds-hero-content">
            <nav class="ds-breadcrumbs">
                <a href="#">Startseite</a> / <a href="#">Kategorie</a> / <span>Aktueller Artikel</span>
            </nav>
            <h1>Der perfekte Artikel ohne Theme-Ballast</h1>
            <p class="ds-hero-intro">Dieses Layout bricht aus dem WordPress-Theme aus, lädt rasend schnell und ist zu 100% vor CSS-Konflikten geschützt.</p>
            <div class="ds-hero-btns">
                <a href="#article-root" class="ds-btn-primary">Artikel lesen</a>
                <a href="#" class="ds-btn-text">Mehr erfahren &rarr;</a>
            </div>
        </div>
        <!-- Interaktive Vorschau-Karten -->
        <div class="ds-hero-visual">
            <div class="ds-preview-card"><strong>Zusammenfassung • 01</strong><br><span>Die Architektur hinter diesem System</span></div>
            <div class="ds-preview-card"><strong>Sicherheit • 02</strong><br><span>Warum json_encode() Abstürze verhindert</span></div>
            <div class="ds-preview-card"><strong>Design • 03</strong><br><span>Ein variables, modulares CSS-System</span></div>
        </div>
    </div>
</section>

<!-- 2. HAUPT-BEREICH (Grid) -->
<div class="ds-grid-container">
    
    <!-- LINKE SPALTE: Meta-Daten -->
    <aside class="ds-sidebar-left">
        <div class="ds-cta-box">
            <p>Abonniere den Newsletter für mehr Architektur-Tipps.</p>
            <a href="#">Jetzt eintragen</a>
        </div>
        <ul class="ds-info-list">
            <li><span class="ds-label">Status</span> Verifizierter Code</li>
            <li><span class="ds-label">Lesezeit</span> ca. 5 Minuten</li>
            <li><span class="ds-label">Technologie</span> Shadow DOM</li>
        </ul>
    </aside>

    <!-- MITTE: Content & Artikel -->
    <main class="ds-main-content">
        <!-- Autoren-Box -->
        <header class="ds-author-box">
            <div class="ds-profile">
                <img src="https://ui-avatars.com/api/?name=System+Admin&background=007AFF&color=fff" alt="Autor">
                <div><span>Publiziert von</span><br><strong>System Admin</strong></div>
            </div>
        </header>

        <!-- Dynamisches Inhaltsverzeichnis (Wird per JS befüllt) -->
        <nav class="ds-toc">
            <h5>Inhalt dieses Artikels</h5>
            <ul id="toc-list"></ul>
        </nav>

        <!-- Eigentlicher Content (KI / Manuell) -->
        <article class="ds-article" id="article-root">
            <h2 id="section-1">1. Die Macht des Breakout-Tricks</h2>
            <p>Normale WordPress-Themes zwingen Artikel in einen Container (oft 800px oder 1200px max-width). Mit dem Breakout-Trick (<code>width: 100vw; margin-left: -50vw;</code>) durchbricht dieses Layout jede Theme-Fessel und nutzt den gesamten Bildschirmrand.</p>
            
            <blockquote>"Die Kombination aus Shadow DOM und Breakout-Trick ist der Heilige Gral der konfliktfreien WordPress-Integration."</blockquote>
            
            <h2 id="section-2">2. Warum Shadow DOM?</h2>
            <p>Wenn ein Theme definiert: <code>h2 { color: red; font-size: 14px; }</code>, dann wird normalerweise jede H2 rot und winzig. Der Shadow DOM baut eine unsichtbare Mauer auf. Das Theme kann nicht hinein, unser Design System kann nicht hinaus.</p>

            <h2 id="section-3">3. Modulares CSS System</h2>
            <p>Über das <code>:host</code> Element steuern wir alle Variablen. Ändert man <code>--ds-color-primary</code> von Blau auf Grün, ändert sich das gesamte Layout (Links, Buttons, aktives Kapitel im Inhaltsverzeichnis) automatisch in Sekundenbruchteilen.</p>
        </article>
    </main>

    <!-- RECHTE SPALTE: Platzhalter -->
    <aside class="ds-sidebar-right">
        <div class="ds-ad-box">
            <p>Anzeigen / Widget<br>Platzhalter</p>
        </div>
    </aside>

</div>
HTML;

// ==============================================================================
// 3. CSS: DAS GLOBALE DESIGN SYSTEM (:host)
// ==============================================================================
$css_content = <<<CSS
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

/* --- 1. DAS GEHIRN (Variablen & Breakout) --- */
:host {
    /* STANDARD LAYOUT & BREAKOUT TRICK */
    display: block !important;
    position: relative !important;
    left: 50% !important;
    right: 50% !important;
    margin-left: -50vw !important;
    margin-right: -50vw !important;
    width: 100vw !important;
    max-width: 100vw !important;

    /* FARBEN (60-30-10 Regel) */
    --ds-color-primary: #007AFF;         /* Akzent */
    --ds-color-bg-main: #ffffff;         /* Basis */
    --ds-color-bg-sec:  #f5f5f7;         /* Sekundär-Fläche */
    --ds-color-bg-card: #ffffff;         /* Karten */
    --ds-color-text-main: #1d1d1f;       /* Überschriften */
    --ds-color-text-body: #424245;       /* Text */
    --ds-color-text-muted: #86868b;      /* Metadaten */
    --ds-color-border: #d2d2d7;          /* Rahmen */

    /* TYPOGRAFIE */
    --ds-font-family: 'Inter', -apple-system, sans-serif;
    --ds-text-h1: 3.5rem;
    --ds-text-h2: 1.9rem;
    --ds-text-body-large: 1.25rem;
    --ds-text-body: 1.1rem;
    --ds-text-small: 0.85rem;

    /* RADIUS & ABSTÄNDE */
    --ds-radius-sm: 8px;
    --ds-radius-md: 12px;
    --ds-radius-lg: 14px;
    --ds-radius-xl: 16px;
    --ds-spacing-sm: 20px;
    --ds-spacing-md: 30px;
    --ds-spacing-lg: 40px;
    --ds-spacing-xl: 60px;
    
    /* LAYOUT BEMASSUNG */
    --ds-container-width: 1400px;
    --ds-sidebar-width-left: 280px;
    --ds-sidebar-width-right: 240px;
    --ds-shadow-card: 0 10px 30px rgba(0,0,0,0.05);
    --ds-transition-speed: 0.3s;
}

/* RESPONSIVE VARIABLEN */
@media (max-width: 1000px) {
    :host { --ds-text-h1: 2.5rem; --ds-text-h2: 1.5rem; }
}

/* --- 2. BASIS-STYLES --- */
* { box-sizing: border-box; margin: 0; padding: 0; }
.ds-master-wrapper {
    font-family: var(--ds-font-family);
    color: var(--ds-color-text-body);
    background: var(--ds-color-bg-main);
    line-height: 1.6;
    text-align: left;
}

/* --- 3. KOMPONENTEN --- */
/* Fortschrittsbalken */
#reading-progress { position: fixed; top: 0; left: 0; width: 0%; height: 4px; background: var(--ds-color-primary); z-index: 10000; transition: width 0.1s; }

/* Hero */
.ds-hero { background-color: var(--ds-color-bg-sec); padding: var(--ds-spacing-xl) var(--ds-spacing-sm); border-bottom: 1px solid var(--ds-color-border); }
.ds-hero-container { max-width: var(--ds-container-width); margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-spacing-lg); align-items: center; }
.ds-breadcrumbs { font-size: var(--ds-text-small); color: var(--ds-color-text-muted); margin-bottom: var(--ds-spacing-sm); }
.ds-breadcrumbs a { text-decoration: none; color: inherit; }
.ds-breadcrumbs a:hover { color: var(--ds-color-primary); }
.ds-hero-content h1 { font-size: var(--ds-text-h1); font-weight: 800; line-height: 1.1; margin-bottom: var(--ds-spacing-sm); color: var(--ds-color-text-main); }
.ds-hero-intro { font-size: var(--ds-text-body-large); margin-bottom: var(--ds-spacing-md); max-width: 600px; }
.ds-hero-btns { display: flex; gap: 15px; flex-wrap: wrap; }
.ds-btn-primary { background: var(--ds-color-text-main); color: #fff; padding: 14px 28px; border-radius: var(--ds-radius-sm); text-decoration: none; font-weight: 600; transition: var(--ds-transition-speed); }
.ds-btn-primary:hover { transform: translateY(-2px); background: #000; }
.ds-btn-text { padding: 14px 28px; color: var(--ds-color-text-main); font-weight: 600; text-decoration: none; }

/* Hero Visual (Stapel-Karten) */
.ds-hero-visual { display: flex; flex-direction: column; gap: 15px; perspective: 1000px; }
.ds-preview-card { background: var(--ds-color-bg-card); padding: var(--ds-spacing-sm); border-radius: var(--ds-radius-lg); box-shadow: var(--ds-shadow-card); border: 1px solid var(--ds-color-border); max-width: 400px; }
.ds-preview-card:nth-child(1) { transform: rotate(-2deg) translateX(20px); z-index: 3; }
.ds-preview-card:nth-child(2) { transform: rotate(1deg) translateX(0px); z-index: 2; margin-top: -40px; opacity: 0.8; }
.ds-preview-card:nth-child(3) { transform: rotate(3deg) translateX(-20px); z-index: 1; margin-top: -40px; opacity: 0.5; }

/* Main Grid & Sidebars */
.ds-grid-container { display: grid; gap: 50px; max-width: var(--ds-container-width); margin: 0 auto; padding: var(--ds-spacing-lg) var(--ds-spacing-sm); align-items: start; grid-template-columns: var(--ds-sidebar-width-left) 1fr var(--ds-sidebar-width-right); }
.ds-sidebar-left { position: sticky; top: var(--ds-spacing-lg); font-size: var(--ds-text-small); }
.ds-cta-box { background: var(--ds-color-primary); color: white; padding: var(--ds-spacing-sm); border-radius: var(--ds-radius-md); margin-bottom: var(--ds-spacing-md); }
.ds-cta-box a { color: white; font-weight: 700; }
.ds-info-list { list-style: none; padding: 0; margin-bottom: var(--ds-spacing-md); border-bottom: 1px solid var(--ds-color-border); padding-bottom: var(--ds-spacing-sm); }
.ds-info-list li { margin-bottom: 12px; }
.ds-label { font-weight: 700; color: var(--ds-color-text-main); display: block; font-size: 0.7rem; text-transform: uppercase; }

/* Content & Inhaltsverzeichnis (TOC) */
.ds-main-content { max-width: 820px; }
.ds-author-box { display: flex; gap: var(--ds-spacing-lg); margin-bottom: var(--ds-spacing-lg); padding: 25px; background: var(--ds-color-bg-sec); border-radius: var(--ds-radius-xl); }
.ds-profile { display: flex; align-items: center; gap: 12px; }
.ds-profile img { width: 48px; height: 48px; border-radius: 50%; }

.ds-toc { margin: var(--ds-spacing-lg) 0; padding: var(--ds-spacing-md); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-xl); }
.ds-toc h5 { margin-bottom: 15px; font-size: 1.1rem; color: var(--ds-color-text-main); }
#toc-list { display: grid; grid-template-columns: 1fr 1fr; gap: 15px 30px; list-style: none; }
#toc-list a { text-decoration: none; color: var(--ds-color-primary); transition: var(--ds-transition-speed); font-size: 0.95rem; }
#toc-list a.active-chapter { color: var(--ds-color-text-main); font-weight: 800; border-left: 3px solid var(--ds-color-primary); padding-left: 12px; }

/* Artikel Typografie */
.ds-article h2 { font-size: var(--ds-text-h2); margin-top: 4rem; padding-bottom: 12px; border-bottom: 1px solid var(--ds-color-border); color: var(--ds-color-text-main); margin-bottom: 1rem;}
.ds-article p { font-size: var(--ds-text-body); margin-bottom: 1.8rem; }
.ds-article blockquote { margin: 45px 0; padding: 10px 0 10px 30px; border-left: 4px solid var(--ds-color-primary); font-style: italic; font-size: 1.3rem; }
.ds-article code { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 0.9rem; color: #d63384; }

.ds-sidebar-right { position: sticky; top: var(--ds-spacing-lg); }
.ds-ad-box { background: #fbfbfd; border: 1px dashed var(--ds-color-border); min-height: 500px; display: flex; align-items: center; justify-content: center; text-align: center; border-radius: var(--ds-radius-md); }

/* --- 4. RESPONSIVE BREAKPOINTS --- */
@media (max-width: 1200px) { .ds-grid-container { grid-template-columns: var(--ds-sidebar-width-left) 1fr; } .ds-sidebar-right { display: none; } }
@media (max-width: 1000px) { .ds-hero-container { grid-template-columns: 1fr; text-align: center; } .ds-hero-visual { display: none; } .ds-hero-intro { margin: 0 auto var(--ds-spacing-md) auto; } .ds-hero-btns { justify-content: center; } }
@media (max-width: 900px) { .ds-grid-container { grid-template-columns: 1fr; } .ds-sidebar-left { display: none; } #toc-list { grid-template-columns: 1fr; } }
CSS;

// ==============================================================================
// 4. JAVASCRIPT & SHADOW DOM INJECTION (Die Magie)
// ==============================================================================

// 🔴 WICHTIG: json_encode schützt vor Syntax-Errors durch Quotes oder Linebreaks!
$js_html = json_encode('<div class="ds-master-wrapper">' . $html_content . '</div>');
$js_css = json_encode($css_content);

$payload_script = <<<HTML
<!-- SKELETON LOADER (Wird angezeigt, solange das JS lädt) -->
<div id="ds-shadow-host" style="display: block !important; position: relative !important; left: 50% !important; right: 50% !important; margin-left: -50vw !important; margin-right: -50vw !important; width: 100vw !important; max-width: 100vw !important;">
    <style>@keyframes ds-pulse { 0% {opacity:0.5;} 50% {opacity:1;} 100% {opacity:0.5;} }</style>
    <div style="width: 100%; max-width: 1400px; margin: 0 auto; background: #f5f5f7; height: 500px; display: flex; align-items: center; justify-content: center;">
        <div style="width: 60%; height: 20px; background: #e5e5e7; border-radius: 10px; animation: ds-pulse 1.5s infinite;"></div>
    </div>
</div>

<script>
document.addEventListener("DOMContentLoaded", function() {
    
    // 1. Shadow DOM initialisieren & Skeleton entfernen
    const host = document.querySelector('#ds-shadow-host');
    if(!host) return;
    host.innerHTML = ''; 
    const shadow = host.attachShadow({mode: 'open'});

    // 2. Sicheres Injizieren von CSS & HTML (PHP Variablen interpoliert)
    const style = document.createElement('style');
    style.textContent = {$js_css}; 
    
    const container = document.createElement('div');
    container.innerHTML = {$js_html};

    shadow.appendChild(style);
    shadow.appendChild(container);

    // 3. JS LOGIK (Scoped auf `shadow.`)
    const tocTarget = shadow.querySelector("#toc-list");
    const sections = shadow.querySelectorAll("#article-root h2");
    const progressBar = shadow.querySelector("#reading-progress");
    const activeLinks =[];

    // Dynamisches Inhaltsverzeichnis generieren
    if(tocTarget && sections.length > 0) {
        sections.forEach((h2, index) => {
            const id = h2.id || 'section-' + index;
            h2.id = id;
            
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.textContent = h2.textContent;
            a.href = '#' + id;
            a.setAttribute("data-anchor", id);
            
            // Smooth Scroll Fix für Shadow DOM
            a.addEventListener('click', function(e) {
                e.preventDefault();
                h2.scrollIntoView({behavior: 'smooth', block: 'start'});
            });

            li.appendChild(a);
            tocTarget.appendChild(li);
            activeLinks.push(a);
        });
    }

    // Scroll-Fortschrittsbalken GLOBAL (außerhalb Shadow-DOM)
    let globalBar = document.getElementById('lf-reading-progress');
    if (!globalBar) {
        globalBar = document.createElement('div');
        globalBar.id = 'lf-reading-progress';
        globalBar.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 0% !important; height: 4px !important; background-color: var(--wp--preset--color--vivid-purple, #007AFF) !important; z-index: 2147483647 !important; transition: width 0.1s ease-out !important; pointer-events: none !important;';
        document.body.appendChild(globalBar);
    }

    window.addEventListener("scroll", function() {
        let winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        let height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        let scrolled = (winScroll / height) * 100;
        if (globalBar) globalBar.style.width = scrolled + "%";
        if (progressBar) progressBar.style.width = scrolled + "%"; // Fallback im Shadow DOM
    });

    // Intersection Observer (Aktives Kapitel "aufleuchten" lassen)
    if('IntersectionObserver' in window) {
        const observerOptions = { rootMargin: "-15% 0px -75% 0px", threshold: 0 };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    activeLinks.forEach(link => link.classList.remove("active-chapter"));
                    const targetLink = shadow.querySelector('#toc-list a[data-anchor="' + entry.target.id + '"]');
                    if (targetLink) targetLink.classList.add("active-chapter");
                }
            });
        }, observerOptions);
        sections.forEach(s => observer.observe(s));
    }

    // 4. THEME-MÜLL VERSTECKEN (Wird ins normale Document Head geschrieben)
    const hideJunk = document.createElement('style');
    hideJunk.innerHTML = `
        .entry-header, .entry-title, .page-title, .post-meta, .entry-meta, 
        .author-bio, #comments, .sharedaddy, .sd-like, .post-navigation,
        .wp-block-post-date, .posted-on, .post-date, time.published, time.updated 
        { display: none !important; }
        .entry-content, .post-content, .article-content 
        { margin-top: 0 !important; padding-top: 0 !important; }
    `;
    document.head.appendChild(hideJunk);

    // 5. JAVASCRIPT SCANNER: Löscht Elemente, die Theme-Müll enthalten (hartnäckige Themes)
    function cleanupThemeGarbage() {
        var terms = ['dilanhuetgens', 'Uncategorized', 'Nicht kategorisiert'];
        var elements = document.querySelectorAll('span, div, a, li, p');
        elements.forEach(function (el) {
            terms.forEach(function (term) {
                if (el.textContent && el.textContent.includes(term) && el.children.length === 0) {
                    var parent = el.parentElement;
                    if (parent) parent.style.display = 'none';
                    el.style.display = 'none';
                }
            });
        });
    }
    cleanupThemeGarbage();
    setTimeout(cleanupThemeGarbage, 1000);
});
</script>
HTML;

// ==============================================================================
// 5. WORDPRESS API REQUEST AUSFÜHREN
// ==============================================================================

// Auth-String generieren
$auth_string = base64_encode($username . ':' . $app_password);

// Payload schnüren (Nur der Script-Block wird als Content gesendet!)
$wp_data = [
    'title' => $post_title,
    'content' => "\n" . $payload_script . "\n",
    'status' => 'publish',
    'comment_status' => 'closed',
    'ping_status' => 'closed'
];

// cURL Request
$ch = curl_init($wp_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($wp_data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Basic ' . $auth_string
]);

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Auswertung
if ($http_code === 201 || $http_code === 200) {
    echo "✅ ERFOLG: Beitrag mit Master-Template wurde erfolgreich auf WordPress veröffentlicht!";
} else {
    echo "❌ FEHLER ($http_code): " . $response;
}
?>
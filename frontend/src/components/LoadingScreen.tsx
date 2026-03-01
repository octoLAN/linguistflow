import React, { useEffect, useState } from 'react'

interface LoadingScreenProps {
    /** Shown below the bar */
    label?: string
    /** 0–100 or undefined for indeterminate animation */
    progress?: number
    /** Force dark or light — defaults to system preference */
    theme?: 'dark' | 'light'
}

const LABELS = [
    'Initialisierung...',
    'Daten werden geladen...',
    'KI-Entwürfe werden abgerufen...',
    'Verbindung wird hergestellt...',
]

/**
 * Global Loading Screen — two variants:
 * Dark:  OLED black bg, thin gradient bar, muted white text
 * Light: Pure white bg, soft-blue bar on grey track, grey text
 */
export const LoadingScreen: React.FC<LoadingScreenProps> = ({
    label,
    progress,
    theme,
}) => {
    const [fakePct, setFakePct] = useState(8)
    const [labelIdx, setLabelIdx] = useState(0)

    const isDark =
        theme === 'dark'
            ? true
            : theme === 'light'
                ? false
                : window.matchMedia('(prefers-color-scheme: dark)').matches ||
                document.documentElement.classList.contains('dark')

    // Indeterminate fake progress crawl
    useEffect(() => {
        if (progress !== undefined) return
        const t = setInterval(() => {
            setFakePct(p => (p >= 88 ? 88 : p + Math.random() * 3))
        }, 600)
        return () => clearInterval(t)
    }, [progress])

    // Cycle status labels
    useEffect(() => {
        if (label) return
        const t = setInterval(() => {
            setLabelIdx(i => (i + 1) % LABELS.length)
        }, 2200)
        return () => clearInterval(t)
    }, [label])

    const pct = progress ?? fakePct

    /* ── styles ─────────────────────────────────────────────────────────── */
    const bg = isDark ? '#000000' : '#ffffff'
    const track = isDark ? 'rgba(255,255,255,0.08)' : '#ebebeb'
    const fill = isDark
        ? 'linear-gradient(90deg, #4aaaff 0%, #c8e8ff 100%)'
        : 'linear-gradient(90deg, #4f8ef7 0%, #8bc4ff 100%)'
    const txt = isDark ? 'rgba(255,255,255,0.45)' : '#b0b0b0'

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: bg,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}
        >
            {/* Track */}
            <div
                style={{
                    width: 280,
                    height: 4,
                    borderRadius: 999,
                    background: track,
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                {/* Fill */}
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${pct}%`,
                        borderRadius: 999,
                        background: fill,
                        transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                    }}
                />
            </div>

            {/* Label */}
            <p
                key={labelIdx}
                style={{
                    marginTop: 18,
                    fontSize: 13,
                    letterSpacing: '0.02em',
                    color: txt,
                    fontWeight: 400,
                    userSelect: 'none',
                    animation: 'lf-fadein 0.4s ease',
                }}
            >
                {label ?? LABELS[labelIdx]}
            </p>

            <style>{`
        @keyframes lf-fadein {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    )
}

/**
 * Compact inline variant — replaces spinner inside content areas
 */
export const LoadingBar: React.FC<{ label?: string }> = ({ label }) => {
    const [pct, setPct] = useState(10)
    useEffect(() => {
        const t = setInterval(() => setPct(p => p >= 85 ? 85 : p + Math.random() * 4), 500)
        return () => clearInterval(t)
    }, [])

    const isDark = document.documentElement.classList.contains('dark')
    const track = isDark ? 'rgba(255,255,255,0.08)' : '#ebebeb'
    const fill = isDark
        ? 'linear-gradient(90deg, #4aaaff 0%, #c8e8ff 100%)'
        : 'linear-gradient(90deg, #4f8ef7 0%, #8bc4ff 100%)'
    const txt = isDark ? 'rgba(255,255,255,0.35)' : '#b8b8b8'

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '80px 0',
            width: '100%',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            <div style={{ width: 200, height: 3, borderRadius: 999, background: track, overflow: 'hidden' }}>
                <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    borderRadius: 999,
                    background: fill,
                    transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                }} />
            </div>
            {label && (
                <p style={{ marginTop: 14, fontSize: 12.5, color: txt, letterSpacing: '0.02em' }}>
                    {label}
                </p>
            )}
        </div>
    )
}

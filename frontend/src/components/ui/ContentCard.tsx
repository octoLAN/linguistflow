import React from 'react';
import { MoreHorizontal } from 'lucide-react';

interface ContentCardProps {
    title: string;
    excerpt: string;
    date: string;
    statusText?: string;
    onClick?: () => void;
}

export function ContentCard({ title, excerpt, date, statusText = 'Entwurf', onClick }: ContentCardProps) {
    return (
        <article
            onClick={onClick}
            className="
        group relative block p-8 rounded-3xl cursor-pointer
        transition-all duration-300 ease-out
        /* Borderless Design: Keine Rahmen, Nutzung von Padding und Schatten/Bg-Kontrast */
        bg-surface-light dark:bg-surface-dark
        hover:bg-white dark:hover:bg-[#181818]
        shadow-soft-xl hover:shadow-2xl hover:-translate-y-1
      "
        >
            {/* Header Snippet with Context Menu Icon */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold tracking-wider uppercase text-primary">
                        {statusText}
                    </span>
                    <span className="text-sm text-ink-light/60 dark:text-ink-muted">
                        {date}
                    </span>
                </div>

                {/* Context Menu Icon (2D Outline, passt sich der Textfarbe an) */}
                <button className="text-ink-light/40 hover:text-ink-light dark:text-ink-muted dark:hover:text-ink-dark transition-colors">
                    <MoreHorizontal className="w-6 h-6 stroke-[1.5]" />
                </button>
            </div>

            {/* Content */}
            <h3 className="text-xl font-bold mb-3 text-ink-light dark:text-ink-dark">
                {title}
            </h3>
            <p className="text-ink-light/70 dark:text-ink-muted leading-relaxed line-clamp-3">
                {excerpt}
            </p>

            {/* Glassmorphism Hover Overlay (Optional / Example for "Milchglas") */}
            <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ring-1 ring-primary/10"></div>
        </article>
    );
}

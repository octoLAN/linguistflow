import React from 'react';

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    icon?: React.ReactNode;
}

export function PrimaryButton({ children, icon, className = '', ...props }: PrimaryButtonProps) {
    return (
        <button
            className={`lf-btn-primary ${className}`}
            {...props}
        >
            {icon && <span className="[&>svg]:w-4 [&>svg]:h-4 [&>svg]:stroke-[2]">{icon}</span>}
            <span>{children}</span>
        </button>
    );
}

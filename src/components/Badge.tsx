import React from 'react';
import { LucideIcon } from 'lucide-react';

interface BadgeProps {
    icon: LucideIcon;
    name: string;
    description: string;
    color?: string;
}

export const Badge: React.FC<BadgeProps> = ({ icon: Icon, name, description, color = '#ff9f43' }) => {
    return (
        <div
            title={`${name}: ${description}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                cursor: 'help',
                transition: 'all 0.2s ease',
                userSelect: 'none'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.transform = 'translateY(0)';
            }}
        >
            <Icon size={16} color={color} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#eee' }}>{name}</span>
        </div>
    );
};

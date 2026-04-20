import React from 'react';
import { useThemeColor } from '../hooks/use-theme-color';

interface ThemedTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
  numberOfLines?: number;
}

const typeStyles: Record<string, React.CSSProperties> = {
  default: { fontSize: 16, lineHeight: '24px' },
  title: { fontSize: 32, fontWeight: 'bold', lineHeight: '32px' },
  defaultSemiBold: { fontSize: 16, lineHeight: '24px', fontWeight: 600 },
  subtitle: { fontSize: 20, fontWeight: 'bold' },
  link: { lineHeight: '30px', fontSize: 16, color: '#0a7ea4' },
};

export function ThemedText({ style, lightColor, darkColor, type = 'default', numberOfLines, children, ...rest }: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const lineClamp: React.CSSProperties = numberOfLines
    ? { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: numberOfLines, WebkitBoxOrient: 'vertical' as any }
    : {};

  return (
    <span style={{ color, ...typeStyles[type], ...lineClamp, ...(style as React.CSSProperties) }} {...rest}>
      {children}
    </span>
  );
}

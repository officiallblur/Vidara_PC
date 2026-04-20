import React from 'react';
import { useThemeColor } from '../hooks/use-theme-color';

interface ThemedViewProps extends React.HTMLAttributes<HTMLDivElement> {
  lightColor?: string;
  darkColor?: string;
}

export function ThemedView({ style, lightColor, darkColor, children, ...rest }: ThemedViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');
  return (
    <div style={{ backgroundColor, ...(style as React.CSSProperties) }} {...rest}>
      {children}
    </div>
  );
}

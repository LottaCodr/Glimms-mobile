import { useTheme } from '@/provider/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface SettingsSectionProps {
    title: string;
    children: React.ReactNode;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ title, children }) => {
    const theme = useTheme();

    return (
        <View style={styles.container}>
            <Text style={[theme.typography.caption, styles.title, { color: theme.colors.brand.primary }]}>
                {title.toUpperCase()}
            </Text>
            <View style={[styles.content, { backgroundColor: theme.colors.neutral[50], borderRadius: theme.radius.md || 12 }]}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    title: {
        marginBottom: 8,
        marginLeft: 4,
        fontWeight: '600',
        letterSpacing: 1,
    },
    content: {
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
});

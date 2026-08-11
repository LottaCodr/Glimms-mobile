import { useTheme } from '@/provider/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

interface SettingsItemProps {
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    value?: boolean;
    onValueChange?: (value: boolean) => void;
    onPress?: () => void;
    type?: 'toggle' | 'navigation' | 'info';
    rightText?: string;
}

export const SettingsItem: React.FC<SettingsItemProps> = ({
    label,
    icon,
    value,
    onValueChange,
    onPress,
    type = 'navigation',
    rightText
}) => {
    const theme = useTheme();

    return (
        <TouchableOpacity
            style={[styles.container, { borderBottomColor: theme.colors.neutral[200] }]}
            onPress={onPress}
            disabled={type === 'info' && !onPress}
        >
            <View style={styles.leftContent}>
                {icon && (
                    <View style={[styles.iconContainer, { backgroundColor: theme.colors.neutral[100] }]}>
                        <Ionicons name={icon} size={20} color={theme.colors.brand.primary} />
                    </View>
                )}
                <Text style={[theme.typography.body, styles.label]}>{label}</Text>
            </View>

            <View style={styles.rightContent}>
                {type === 'toggle' && (
                    <Switch
                        value={value}
                        onValueChange={onValueChange}
                        trackColor={{ false: theme.colors.neutral[300], true: theme.colors.brand.primary }}
                    />
                )}
                {type === 'navigation' && (
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.neutral[400]} />
                )}
                {type === 'info' && rightText && (
                    <Text style={[theme.typography.caption, { color: theme.colors.neutral[500] }]}>{rightText}</Text>
                )}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 0.5,
    },
    leftContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    label: {
        fontWeight: '500',
    },
    rightContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});

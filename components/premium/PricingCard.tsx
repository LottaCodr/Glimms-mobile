import { SubscriptionPlan } from '@/hooks/useSubscription';
import { useTheme } from '@/provider/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PricingCardProps {
    plan: SubscriptionPlan;
    onSelect: (id: string) => void;
    loading?: boolean;
}

export const PricingCard: React.FC<PricingCardProps> = ({ plan, onSelect, loading }) => {
    const theme = useTheme();

    return (
        <View style={[
            styles.container,
            {
                backgroundColor: theme.colors.neutral[0],
                borderColor: plan.isPopular ? theme.colors.brand.primary : theme.colors.neutral[200],
                borderWidth: plan.isPopular ? 2 : 1,
                borderRadius: theme.radius.lg || 20
            }
        ]}>
            {plan.isPopular && (
                <View style={[styles.badge, { backgroundColor: theme.colors.brand.primary }]}>
                    <Text style={styles.badgeText}>MOST POPULAR</Text>
                </View>
            )}

            <Text style={[theme.typography.h3, styles.title]}>{plan.name}</Text>

            <View style={styles.priceContainer}>
                <Text style={[theme.typography.h1, { color: theme.colors.brand.primary }]}>{plan.price}</Text>
                <Text style={[theme.typography.caption, styles.interval]}>/{plan.interval}</Text>
            </View>

            <View style={styles.featureList}>
                {plan.features.map((feature, index) => (
                    <View key={index} style={styles.featureItem}>
                        <Ionicons name="checkmark-circle" size={20} color={theme.colors.brand.secondary} />
                        <Text style={[theme.typography.body, styles.featureText]}>{feature}</Text>
                    </View>
                ))}
            </View>

            <TouchableOpacity
                style={[
                    styles.button,
                    { backgroundColor: plan.isPopular ? theme.colors.brand.primary : theme.colors.neutral[900] }
                ]}
                onPress={() => onSelect(plan.id)}
                disabled={loading}
            >
                <Text style={[theme.typography.button, styles.buttonText]}>
                    {loading ? 'Processing...' : 'Choose Plan'}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 24,
        marginBottom: 20,
        width: '100%',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    badge: {
        position: 'absolute',
        top: -12,
        right: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '800',
    },
    title: {
        marginBottom: 8,
    },
    priceContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 24,
    },
    interval: {
        marginLeft: 4,
    },
    featureList: {
        marginBottom: 24,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    featureText: {
        marginLeft: 10,
        fontSize: 14,
    },
    button: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonText: {
        fontWeight: '700',
    },
});

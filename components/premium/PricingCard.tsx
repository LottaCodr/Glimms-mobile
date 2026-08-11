import { SubscriptionPlan } from '@/hooks/useSubscription';
import { Colors, Radius, Spacing, Typography } from '@/theme';
import { AppIcon } from '@/components/ui/Icon';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface PricingCardProps {
    plan: SubscriptionPlan;
    onSelect: (id: string) => void;
    loading?: boolean;
}

export const PricingCard: React.FC<PricingCardProps> = ({ plan, onSelect, loading }) => {
    const isFree = plan.id === 'free';
    const purchasable = !!plan.priceId;

    return (
        <View
            style={[
                styles.container,
                {
                    borderColor: plan.isPopular ? Colors.gold : Colors.border,
                    borderWidth: plan.isPopular ? 1.5 : 1,
                },
            ]}
        >
            {plan.isPopular && (
                <LinearGradient
                    colors={[Colors.gold, Colors.goldL]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.badge}
                >
                    <Text style={styles.badgeText}>MOST POPULAR</Text>
                </LinearGradient>
            )}

            <Text style={styles.title}>{plan.name}</Text>

            <View style={styles.priceContainer}>
                <Text style={styles.price}>{plan.price}</Text>
                <Text style={styles.interval}>/{plan.interval}</Text>
            </View>

            <View style={styles.featureList}>
                {plan.features.map((feature, index) => (
                    <View key={index} style={styles.featureItem}>
                        <AppIcon name="checkmark-circle" size={17} color={Colors.gold} />
                        <Text style={styles.featureText}>{feature}</Text>
                    </View>
                ))}
            </View>

            <TouchableOpacity
                style={[
                    styles.button,
                    { backgroundColor: plan.isPopular ? Colors.gold : Colors.card2 },
                    (!purchasable || loading) && { opacity: 0.55 },
                ]}
                onPress={() => purchasable && onSelect(plan.id)}
                disabled={!purchasable || loading}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${plan.name} plan`}
            >
                {loading ? (
                    <ActivityIndicator color={plan.isPopular ? Colors.black : Colors.text} size="small" />
                ) : (
                    <Text
                        style={[
                            styles.buttonText,
                            { color: plan.isPopular ? Colors.black : Colors.text },
                        ]}
                    >
                        {isFree ? 'Current plan' : purchasable ? 'Choose Plan' : 'Coming soon'}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 22,
        marginBottom: 16,
        width: '100%',
        position: 'relative',
        backgroundColor: Colors.card,
        borderRadius: Radius.lg,
        marginTop: 8,
    },
    badge: {
        position: 'absolute',
        top: -11,
        right: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: Radius.full,
    },
    badgeText: {
        color: Colors.black,
        fontSize: 9.5,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    title: {
        fontFamily: Typography.serif,
        fontSize: 20,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 6,
    },
    priceContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: Spacing.md,
    },
    price: {
        fontFamily: Typography.serif,
        fontSize: 34,
        fontWeight: '700',
        color: Colors.gold,
    },
    interval: {
        marginLeft: 4,
        color: Colors.mid,
        fontSize: 13,
    },
    featureList: {
        marginBottom: Spacing.md,
        gap: 10,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    featureText: {
        color: Colors.mid,
        fontSize: 13.5,
        flex: 1,
    },
    button: {
        height: 48,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        fontWeight: '700',
        fontSize: 14,
    },
});

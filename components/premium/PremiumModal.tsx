import { useSubscription } from '@/hooks/useSubscription';
import { useTheme } from '@/provider/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PricingCard } from './PricingCard';

interface PremiumModalProps {
    visible: boolean;
    onClose: () => void;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ visible, onClose }) => {
    const theme = useTheme();
    const { plans, loading, subscribe } = useSubscription();

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={[styles.container, { backgroundColor: theme.colors.neutral[50] }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={24} color={theme.colors.neutral[900]} />
                    </TouchableOpacity>
                    <Text style={[theme.typography.h2, styles.headerTitle]}>Upgrade to Glimms Pro</Text>
                    <Text style={[theme.typography.body, styles.subtitle]}>
                        Unlock personalized AI insights and unlimited style suggestions.
                    </Text>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {plans.map((plan) => (
                        <PricingCard
                            key={plan.id}
                            plan={plan}
                            onSelect={subscribe}
                            loading={loading}
                        />
                    ))}

                    <TouchableOpacity style={styles.restoreButton}>
                        <Text style={[theme.typography.caption, { color: theme.colors.neutral[500] }]}>
                            Restore Purchases
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 24,
        paddingTop: 40,
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 20,
        right: 20,
        zIndex: 10,
    },
    headerTitle: {
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        textAlign: 'center',
        color: '#666',
        paddingHorizontal: 20,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    restoreButton: {
        alignItems: 'center',
        marginTop: 8,
    },
});

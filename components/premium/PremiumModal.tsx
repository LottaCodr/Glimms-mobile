import { useSubscription } from '@/hooks/useSubscription';
import { Colors, Spacing, Typography } from '@/theme';
import { IconButton } from '@/components/ui/IconButton';
import { useAuthStore } from '@/store/auth.store';
import React, { useEffect } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PricingCard } from './PricingCard';

interface PremiumModalProps {
    visible: boolean;
    onClose: () => void;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ visible, onClose }) => {
    const { plans, loading, error, subscribe } = useSubscription();
    const insets = useSafeAreaInsets();
    const [notice, setNotice] = React.useState<string | null>(null);
    const user = useAuthStore((s) => s.user);

    useEffect(() => {
        if (user && user.tier !== 'free' && visible) {
            const t = setTimeout(() => {
                setNotice(`Welcome to ${String(user.tier).toUpperCase()} — enjoy your expanded limits.`);
                onClose();
            }, 1400);
            return () => clearTimeout(t);
        }
    }, [user, visible, onClose]);

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
                <View style={styles.header}>
                    <View style={styles.closeWrap}>
                        <IconButton icon="close" accessibilityLabel="Close paywall" onPress={onClose} />
                    </View>
                    <Text style={styles.label}>GLIMMS PLANS</Text>
                    <Text style={styles.headerTitle}>Upgrade to Glimms</Text>
                    <Text style={styles.subtitle}>
                        Unlock higher scan limits, priority AI processing and climate-aware styling.
                    </Text>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {plans.map((plan) => (
                        <PricingCard
                            key={plan.id}
                            plan={plan}
                            onSelect={async (id) => {
                                setNotice(null);
                                const result = await subscribe(id);
                                if (result === 'cancelled') setNotice('Checkout closed — no charge was made.');
                                if (result === 'pending') setNotice('Confirming your payment… this can take a minute.');
                            }}
                            loading={loading}
                        />
                    ))}

                    {loading && (
                        <View style={styles.statusRow}>
                            <ActivityIndicator color={Colors.gold} />
                            <Text style={styles.statusText}>Opening secure checkout…</Text>
                        </View>
                    )}
                    {!!error && <Text style={styles.error}>{error}</Text>}
                    {!!notice && <Text style={styles.notice}>{notice}</Text>}

                    <TouchableOpacity style={styles.maybeLaterButton} onPress={onClose}>
                        <Text style={styles.maybeLaterText}>Maybe later</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.bg,
    },
    header: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
        alignItems: 'center',
    },
    closeWrap: {
        position: 'absolute',
        top: 0,
        right: Spacing.lg,
        zIndex: 10,
    },
    label: { fontSize: 11, letterSpacing: 2, color: Colors.gold, marginBottom: 6 },
    headerTitle: {
        textAlign: 'center',
        fontFamily: Typography.serif,
        fontSize: 26,
        fontWeight: '600',
        color: Colors.text,
    },
    subtitle: {
        textAlign: 'center',
        color: Colors.mid,
        fontSize: 13,
        lineHeight: 19,
        marginTop: 6,
        paddingHorizontal: Spacing.md,
    },
    scrollContent: {
        padding: Spacing.lg,
        paddingTop: 12,
        paddingBottom: 44,
    },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 4 },
    statusText: { color: Colors.mid, fontSize: 13 },
    error: { color: Colors.error, fontSize: 13, textAlign: 'center', marginTop: 12 },
    notice: { color: '#F59E0B', fontSize: 13, textAlign: 'center', marginTop: 12 },
    maybeLaterButton: {
        marginTop: Spacing.md,
        alignItems: 'center',
        padding: 10,
    },
    maybeLaterText: {
        color: Colors.mid,
        fontSize: 13,
        fontWeight: '500',
    },
});

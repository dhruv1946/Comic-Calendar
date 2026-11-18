import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { sendEmailVerification } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PULL_LIST_CACHE_KEY, usePullList } from '../../constants/PullListContext';
import { Colors, SharedStyles } from '../../constants/styles';
import { useAppTheme } from '../../hooks/useTheme';
import { useThemedAlert } from '../../components/ThemedAlertProvider';
import { auth, db } from '../../firebase';

export default function Home() {
    const { colors } = useAppTheme();
    const { showAlert } = useThemedAlert();
    const {
        series, setSeries,
        nextIssueDates,
        loading, refreshingDates,
        fetchPullList, forceRefreshDates,
    } = usePullList();

    const nextIssueDatesRef = useRef(nextIssueDates);
    nextIssueDatesRef.current = nextIssueDates;

    const [emailVerified, setEmailVerified] = useState(() => auth.currentUser?.emailVerified ?? true);
    const [bannerDismissed, setBannerDismissed] = useState(false);

    const hasInitiallyLoaded = useRef(false);
    const needsRefreshOnFocus = useRef(false);

    useFocusEffect(
        useCallback(() => {
            checkEmailVerification();
            if (!hasInitiallyLoaded.current || needsRefreshOnFocus.current) {
                hasInitiallyLoaded.current = true;
                needsRefreshOnFocus.current = false;
                fetchPullList();
            }
        }, [])
    );

    useEffect(() => {
        needsRefreshOnFocus.current = true;
    }, [series.length]);

    const checkEmailVerification = async () => {
        const user = auth.currentUser;
        if (user && !user.emailVerified) {
            await user.reload();
            setEmailVerified(user.emailVerified);
        }
    };

    const handleResendVerification = async () => {
        const user = auth.currentUser;
        if (user) {
            try {
                await sendEmailVerification(user);
                showAlert('Email Sent', 'Verification email has been resent. Check your inbox.');
            } catch {
                showAlert('Error', 'Could not send verification email. Please try again later.');
            }
        }
    };

    const removeSeries = useCallback((id: string, title: string) => {
        showAlert(
            "Remove Comic",
            `Are you sure you want to drop "${title}" from your Pull List?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await deleteDoc(doc(db, 'series', id));
                            setSeries((prevSeries) => {
                                const updated = prevSeries.filter((item) => item.id !== id);
                                AsyncStorage.setItem(PULL_LIST_CACHE_KEY, JSON.stringify(updated)).catch(() => {});
                                return updated;
                            });
                        } catch (error) {
                            console.error('Error deleting series:', error);
                            showAlert('Error', 'Could not remove the series from your list.');
                        }
                    }
                }
            ]
        );
    }, [showAlert, setSeries]);

    const renderItem = useCallback(({ item }: { item: typeof series[0] }) => {
        const dates = nextIssueDatesRef.current;
        return (
        <View style={SharedStyles.gridCard}>
            <View style={SharedStyles.imagePlaceholder}>
                {item.image_url ? (
                    <Image
                        source={{ uri: item.image_url }}
                        style={SharedStyles.coverImage}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                        recyclingKey={item.id}
                    />
                ) : (
                    <Text style={{ color: Colors.textMuted, fontFamily: 'PlusJakartaSans_400Regular' }}>No Cover</Text>
                )}
                <TouchableOpacity
                    style={[SharedStyles.deleteButton, { backgroundColor: colors.primary }]}
                    onPress={() => removeSeries(item.id, item.title)}
                >
                    <Text style={[SharedStyles.deleteButtonText, { color: colors.onPrimary }]}>✕</Text>
                </TouchableOpacity>
            </View>
            <View style={[SharedStyles.textContainer, { backgroundColor: colors.surfaceContainer }]}>
                <Text style={[SharedStyles.gridTitle, { color: colors.onSurface }]} numberOfLines={2}>
                    {item.title}
                </Text>
                <Text style={[
                    styles.nextIssueDate, { color: colors.primary, fontWeight: '600' }
                ]} numberOfLines={1}>
                    {dates[item.id]
                        ? `${dates[item.id].label === 'next' ? 'Next' : 'Latest'}: ${dates[item.id].issueNumber ? `#${String(dates[item.id].issueNumber).replace(/^#/, '').trim()}: ` : ''}${new Date(dates[item.id].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : 'Next: —'}
                </Text>
            </View>
        </View>
        );
    }, [colors, removeSeries]);

    const keyExtractor = useCallback((item: typeof series[0]) => item.id, []);

    const showBanner = !emailVerified && !bannerDismissed;

    return (
        <View style={[SharedStyles.screenContainer, { backgroundColor: colors.background }]}>
            {showBanner && (
                <View style={[styles.verificationBanner, { backgroundColor: colors.tertiaryContainer, borderBottomColor: colors.outlineVariant }]}>
                    <View style={styles.bannerContent}>
                        <Text style={[styles.bannerText, { color: colors.onTertiaryContainer }]}>📧 Please verify your email</Text>
                        <TouchableOpacity onPress={handleResendVerification}>
                            <Text style={[styles.resendText, { color: colors.tertiary }]}>Resend</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => setBannerDismissed(true)} style={styles.bannerClose}>
                        <Text style={[styles.bannerCloseText, { color: colors.onTertiaryContainer }]}>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
            ) : series.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: colors.onSurface }]}>Your Pull List is empty.</Text>
                    <Text style={[styles.subText, { color: colors.onSurfaceVariant }]}>Tap the search icon below to start tracking.</Text>
                </View>
            ) : (
                <FlatList
                    data={series}
                    extraData={nextIssueDates}
                    keyExtractor={keyExtractor}
                    numColumns={2}
                    contentContainerStyle={styles.listContent}
                    columnWrapperStyle={styles.columnWrapper}
                    renderItem={renderItem}
                    initialNumToRender={6}
                    maxToRenderPerBatch={4}
                    windowSize={5}
                    removeClippedSubviews={true}
                    onRefresh={forceRefreshDates}
                    refreshing={refreshingDates}
                />
            )}

        </View>
    );
}

const styles = StyleSheet.create({
    listContent: { padding: 10, paddingBottom: 120 },
    columnWrapper: { justifyContent: 'space-between', paddingHorizontal: 5 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: Colors.textPrimary, fontSize: 18, fontWeight: 'bold', fontFamily: 'PlusJakartaSans_700Bold' },
    subText: { color: Colors.textSecondary, fontSize: 14, marginTop: 8, fontFamily: 'PlusJakartaSans_400Regular' },
    nextIssueDate: {
        fontSize: 11,
        marginTop: 3,
        fontWeight: '600',
        fontFamily: 'PlusJakartaSans_500Medium',
    },
    verificationBanner: {
        borderBottomWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    bannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    bannerText: { fontSize: 13, fontWeight: '500', fontFamily: 'PlusJakartaSans_500Medium' },
    resendText: { fontSize: 13, fontWeight: 'bold', textDecorationLine: 'underline', fontFamily: 'PlusJakartaSans_700Bold' },
    bannerClose: { padding: 4, marginLeft: 8 },
    bannerCloseText: { fontSize: 16, fontFamily: 'PlusJakartaSans_400Regular' },
});

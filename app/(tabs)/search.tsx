import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { addDoc, collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedAlert } from '../../components/ThemedAlertProvider';
import { batchParallel, fetchIssueCover, searchSeries } from '../../constants/metron';
import { Colors, SharedStyles } from '../../constants/styles';
import { auth, db } from '../../firebase';
import { useAppTheme } from '../../hooks/useTheme';

const HISTORY_KEY = 'comic_cal_search_history';

interface SearchResult {
    id: number;
    name: string;
    publisher?: { name: string };
    year_began?: number;
    series_type?: { name: string };
    status?: string;
    image_url?: string;
    [key: string]: any;
}

interface HistoryEntry {
    query: string;
    results: { id: number; name: string; image_url?: string; year_began?: number }[];
    timestamp: number;
}

export default function Search() {
    const { colors } = useAppTheme();
    const { showAlert } = useThemedAlert();
    const [queryText, setQueryText] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [history, setHistory] = useState<HistoryEntry[]>([]);

    const router = useRouter();
    const inputRef = useRef<TextInput>(null);

    // Use a ref to always have the latest history in async callbacks
    const historyRef = useRef<HistoryEntry[]>([]);
    historyRef.current = history;

    // Debounce guard
    const lastSearchTime = useRef(0);
    const DEBOUNCE_MS = 1000;

    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(HISTORY_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        setHistory(parsed.filter(entry => entry && typeof entry === 'object' && Array.isArray(entry.results)));
                    }
                }
            } catch { /* ignore */ }
        })();
    }, []);

    /**
     * Persist the top 3 results from a search into history.
     * Uses historyRef so the closure always sees the latest data.
     */
    const saveToHistory = async (searchQuery: string, finalResults: SearchResult[]) => {
        try {
            const entry: HistoryEntry = {
                query: searchQuery.trim(),
                results: finalResults.slice(0, 3).map((r) => ({
                    id: r.id,
                    name: r.name || 'Unknown',
                    image_url: r.image_url,
                    year_began: r.year_began,
                })),
                timestamp: Date.now(),
            };

            setHistory((prevHistory) => {
                const updated = [
                    entry,
                    ...prevHistory.filter((h) => h.query.toLowerCase() !== searchQuery.trim().toLowerCase()),
                ].slice(0, 2);

                // Fire and forget storage update
                AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated)).catch(() => { });

                return updated;
            });
        } catch { /* non-critical */ }
    };

    const clearSearch = () => {
        setQueryText('');
        setResults([]);
        setHasSearched(false);
        inputRef.current?.focus();
    };

    const clearHistory = async () => {
        setHistory([]);
        await AsyncStorage.removeItem(HISTORY_KEY).catch(() => { });
    };

    const removeHistoryEntry = (queryToRemove: string) => {
        setHistory((prevHistory) => {
            const updated = prevHistory.filter(h => h.query !== queryToRemove);
            AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated)).catch(() => { });
            return updated;
        });
    };

    const handleSearch = async (overrideQuery?: string) => {
        const searchText = (overrideQuery ?? queryText).trim();
        if (!searchText) return;

        const now = Date.now();
        if (now - lastSearchTime.current < DEBOUNCE_MS) return;
        lastSearchTime.current = now;

        setLoading(true);
        setHasSearched(true);

        try {
            const allResults = await searchSeries(searchText);

            const normalized: SearchResult[] = allResults
                .sort((a: any, b: any) => (b.year_began ?? 0) - (a.year_began ?? 0))
                .slice(0, 10)
                .map((item: any) => ({
                    ...item,
                    name: item.name || item.series || 'Unknown',
                    image_url: item.image || item.image_url || undefined,
                }));

            setResults(normalized);
            setLoading(false);

            // Fetch missing covers into a plain JS map (not React state)
            // so we can reliably merge them into history afterwards
            const coverMap = new Map<number, string>();
            const needsCovers = normalized.filter((r) => !r.image_url).slice(0, 8);

            if (needsCovers.length > 0) {
                await batchParallel(
                    needsCovers,
                    async (item) => {
                        try {
                            const url = await fetchIssueCover(item.id);
                            if (url) {
                                coverMap.set(item.id, url);
                                // Update visible results immediately
                                setResults((prev) =>
                                    prev.map((r) => r.id === item.id ? { ...r, image_url: url } : r),
                                );
                            }
                        } catch { /* skip */ }
                    },
                    1, // Sequential — 1 at a time to stay well clear of rate limits
                );
            }

            // Build final list with all covers merged, then save to history
            const withCovers = normalized.map((r) => ({
                ...r,
                image_url: coverMap.get(r.id) || r.image_url,
            }));
            await saveToHistory(searchText, withCovers);
        } catch (error: any) {
            console.error('Search error:', error);
            showAlert(
                'Database Offline',
                'The comic database is currently experiencing issues. Please try again later.',
            );
            setResults([]);
            setLoading(false);
        }
    };

    const addSeries = async (item: SearchResult | HistoryEntry['results'][0]) => {
        try {
            setLoading(true);
            const user = auth.currentUser;
            if (!user) {
                setLoading(false);
                showAlert('Error', 'You must be logged in to add series.');
                return;
            }

            const dupSnap = await getDocs(
                query(collection(db, 'series'), where('user_id', '==', user.uid), where('metron_id', '==', item.id)),
            );
            if (!dupSnap.empty) {
                setLoading(false);
                showAlert('Already Tracked', 'This series is already in your list!');
                return;
            }

            const coverUrl = item.image_url || await fetchIssueCover(item.id);

            await addDoc(collection(db, 'series'), {
                user_id: user.uid,
                metron_id: item.id,
                title: item.name || 'Unknown',
                publisher: ('publisher' in item && item.publisher)
                    ? (typeof item.publisher === 'string' ? item.publisher : item.publisher?.name || 'Unknown')
                    : 'Unknown',
                image_url: coverUrl,
                created_at: Timestamp.now(),
            });

            showAlert('Great Choice!', `${item.name || 'Series'} added to your Pull List.\n\nPull down to fetch date.`, [
                { text: 'OK', onPress: () => router.replace('/') },
            ]);
        } catch (error) {
            console.error(error);
            showAlert('Error', 'Failed to fetch cover art or save series.');
        } finally {
            setLoading(false);
        }
    };

    const replaySearch = (historyQuery: string) => {
        setQueryText(historyQuery);
        setHasSearched(false);
        setResults([]);
        setTimeout(() => {
            lastSearchTime.current = 0;
            handleSearch(historyQuery);
        }, 50);
    };

    const showHistory = !hasSearched && !loading && results.length === 0 && history.length > 0;

    return (
        <View collapsable={false} style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Search bar */}
            <View style={styles.searchHeader}>
                <View style={styles.inputWrapper}>
                    <TextInput
                        ref={inputRef}
                        style={[styles.input, { backgroundColor: colors.surfaceContainer, color: colors.onSurface, borderColor: colors.outline }]}
                        placeholder="Search for an ongoing run..."
                        placeholderTextColor={colors.onSurfaceVariant}
                        value={queryText}
                        onChangeText={setQueryText}
                        onSubmitEditing={() => handleSearch()}
                    />
                    {queryText.length > 0 && (
                        <TouchableOpacity style={[styles.clearBtn, { backgroundColor: colors.surfaceContainerHigh }]} onPress={clearSearch}>
                            <Text style={[styles.clearBtnText, { color: colors.onSurfaceVariant }]}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity style={[styles.searchBtn, { backgroundColor: colors.primary }]} onPress={() => handleSearch()} disabled={loading}>
                    <Text style={[SharedStyles.buttonText, { color: colors.onPrimary }]}>Search</Text>
                </TouchableOpacity>
            </View>

            {/* Body */}
            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : showHistory ? (
                /* ── Recent searches ── */
                <ScrollView style={styles.historyContainer}>
                    <View style={styles.historyHeader}>
                        <Text style={[styles.historyTitle, { color: colors.onSurfaceVariant }]}>Recent Searches</Text>
                        <TouchableOpacity onPress={clearHistory}>
                            <Text style={[styles.clearHistoryText, { color: colors.primary }]}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                    {history.map((entry) => (
                        <View key={entry.query + entry.timestamp} style={{ marginBottom: 20 }}>
                            <View style={styles.historyQueryRow}>
                                <TouchableOpacity style={{ flex: 1 }} onPress={() => replaySearch(entry.query)}>
                                    <Text style={[styles.historyQueryText, { color: colors.onSurface }]} numberOfLines={1}>{entry.query}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => removeHistoryEntry(entry.query)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <Text style={[styles.historyArrow, { color: colors.onSurfaceVariant }]}>✕</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.historyCardsRow}>
                                {(entry.results || []).map((item) => (
                                    <TouchableOpacity
                                        key={`h-${item.id}`}
                                        style={[styles.historyCard, { backgroundColor: colors.surfaceContainer }]}
                                        onPress={() => addSeries(item)}
                                    >
                                        <View style={[styles.historyImage, { backgroundColor: colors.surfaceContainerHighest }]}>
                                            {item.image_url ? (
                                                <Image
                                                    source={{ uri: item.image_url }}
                                                    style={{ width: '100%', height: '100%' }}
                                                    contentFit="cover"
                                                    transition={200}
                                                    cachePolicy="memory-disk"
                                                />
                                            ) : (
                                                <Text style={{ color: colors.onSurfaceVariant, fontSize: 11, fontFamily: 'PlusJakartaSans_400Regular' }}>No Cover</Text>
                                            )}
                                        </View>
                                        <Text style={[styles.historyItemName, { color: colors.onSurface }]} numberOfLines={2}>
                                            {item.name || 'Unknown'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    ))}
                </ScrollView>
            ) : (
                <FlatList
                    data={results}
                    keyExtractor={(item) => item.id.toString()}
                    numColumns={2}
                    columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 10 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={[SharedStyles.gridCard, { backgroundColor: colors.surfaceContainer }]} onPress={() => addSeries(item)}>
                            <View style={SharedStyles.imagePlaceholder}>
                                {item.image_url ? (
                                    <Image
                                        source={{ uri: item.image_url }}
                                        style={{ width: '100%', height: '100%' }}
                                        contentFit="cover"
                                        transition={200}
                                        cachePolicy="memory-disk"
                                        recyclingKey={`search-${item.id}`}
                                    />
                                ) : (
                                    <Text style={{ color: colors.onSurfaceVariant, fontFamily: 'PlusJakartaSans_400Regular' }}>No Cover</Text>
                                )}
                            </View>
                            <View style={[styles.cardTextContainer, { backgroundColor: colors.surfaceContainer }]}>
                                <Text style={[SharedStyles.gridTitle, { color: colors.onSurface }]} numberOfLines={2}>
                                    {item.name || 'Unknown'}
                                </Text>
                                <Text style={[styles.gridSubText, { color: colors.onSurfaceVariant }]}>{item.year_began}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        hasSearched ? (
                            <Text style={styles.emptyText}>No results found.</Text>
                        ) : null
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background, padding: 10 },
    searchHeader: { flexDirection: 'row', gap: 10, marginBottom: 20, paddingHorizontal: 5 },
    inputWrapper: { flex: 1, position: 'relative', justifyContent: 'center' },
    input: {
        backgroundColor: Colors.surface,
        color: Colors.textPrimary,
        paddingHorizontal: 15,
        paddingVertical: 12,
        paddingRight: 40,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    clearBtn: {
        position: 'absolute',
        right: 12,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: Colors.surfaceAlt,
        justifyContent: 'center',
        alignItems: 'center',
    },
    clearBtnText: { color: Colors.textSecondary, fontSize: 12, fontWeight: 'bold', fontFamily: 'PlusJakartaSans_700Bold' },
    searchBtn: {
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    cardTextContainer: { flex: 1, padding: 10, minHeight: 70, backgroundColor: Colors.surface },
    gridSubText: { color: Colors.textSecondary, fontSize: 11, marginTop: 4, fontFamily: 'PlusJakartaSans_400Regular' },
    emptyText: { color: Colors.textSecondary, textAlign: 'center', marginTop: 40, fontFamily: 'PlusJakartaSans_400Regular' },

    // ── History ──
    historyContainer: { flex: 1, paddingHorizontal: 5 },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    historyTitle: {
        color: Colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
        fontFamily: 'PlusJakartaSans_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    clearHistoryText: {
        color: Colors.primary,
        fontSize: 13,
        fontWeight: '600',
        fontFamily: 'PlusJakartaSans_700Bold',
    },
    historyQueryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 8,
        marginBottom: 10,
    },
    historyIcon: { fontSize: 14 },
    historyQueryText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1, fontFamily: 'PlusJakartaSans_700Bold' },
    historyArrow: { color: Colors.textSecondary, fontSize: 16 },
    historyCardsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    historyCard: {
        width: 110,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: Colors.surface,
    },
    historyImage: {
        width: 110,
        height: 160,
        backgroundColor: Colors.surfaceAlt,
        justifyContent: 'center',
        alignItems: 'center',
    },
    historyItemName: {
        color: Colors.textPrimary,
        fontSize: 11,
        fontWeight: '600',
        fontFamily: 'PlusJakartaSans_700Bold',
        padding: 8,
        lineHeight: 14,
    },
});
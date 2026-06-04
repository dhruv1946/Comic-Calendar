import { encode } from 'base-64';
import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';
interface Series {
    id: string;
    title: string;
    created_at: string;
    [key: string]: any;
}

export default function Home() {
    const [series, setSeries] = useState<Series[]>([]);
    const [loading, setLoading] = useState(true);
    const [nextIssueDates, setNextIssueDates] = useState<Record<string, { date: string; label: 'next' | 'latest' }>>({});

    const metronUser = 'anon';
    const metronPass = '***REDACTED_METRON_PASS***';

    useFocusEffect(
        useCallback(() => {
            fetchPullList();
        }, [])
    );
    const fetchPullList = async () => {
        try {
            const { data, error } = await supabase
                .from('series')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) {
                setSeries(data);
                await repairMissingCovers(data);
                await fetchNextIssueDates(data);
            }
        } catch (error) {
            console.error('Error fetching series:', error);
        } finally {
            setLoading(false);
        }
    };

    const repairMissingCovers = async (seriesList: Series[]) => {
        const headers = {
            'Authorization': 'Basic ' + encode(`${metronUser}:${metronPass}`),
        };

        for (const s of seriesList) {
            if (s.image_url || !s.metron_id) continue;
            console.log(`[Cover Repair] Fetching cover for "${s.title}" (metron_id: ${s.metron_id})...`);
            try {
                const resp = await fetch(
                    `https://metron.cloud/api/issue/?series_id=${s.metron_id}&number=1`,
                    { headers }
                );
                console.log(`[Cover Repair] Response status: ${resp.status}`);
                if (!resp.ok) continue;
                const json = await resp.json();
                console.log(`[Cover Repair] Results count: ${json.count}, image: ${json.results?.[0]?.image}`);
                const coverUrl = json.results?.[0]?.image || null;
                if (coverUrl) {
                    const { error: updateError } = await supabase
                        .from('series')
                        .update({ image_url: coverUrl })
                        .eq('id', s.id);
                    console.log(`[Cover Repair] DB update result:`, updateError ? updateError.message : 'success');
                    setSeries((prev) =>
                        prev.map((item) =>
                            item.id === s.id ? { ...item, image_url: coverUrl } : item
                        )
                    );
                }
            } catch (e: any) {
                console.log(`[Cover Repair] ERROR for ${s.title}:`, e?.message || e);
            }
        }
    };

    const fetchNextIssueDates = async (seriesList: Series[]) => {
        const headers = {
            'Authorization': 'Basic ' + encode(`${metronUser}:${metronPass}`),
        };
        const today = new Date().toISOString().split('T')[0];
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        const futureDateStr = futureDate.toISOString().split('T')[0];

        for (const s of seriesList) {
            if (!s.metron_id) continue;
            try {
                const resp = await fetch(
                    `https://metron.cloud/api/issue/?series_id=${s.metron_id}&store_date_range_after=${today}&store_date_range_before=${futureDateStr}&ordering=store_date`,
                    { headers }
                );
                if (!resp.ok) {
                    console.log(`Next issue API failed for ${s.title}: ${resp.status}`);
                    continue;
                }
                const json = await resp.json();
                console.log(`Next issue for ${s.title}:`, json.count, 'results');
                const nextIssue = json.results?.[0];
                if (nextIssue?.store_date) {
                    setNextIssueDates((prev) => ({
                        ...prev,
                        [s.id]: { date: nextIssue.store_date, label: 'next' },
                    }));
                    continue;
                }

                const fallbackResp = await fetch(
                    `https://metron.cloud/api/issue/?series_id=${s.metron_id}&ordering=-store_date`,
                    { headers }
                );
                if (!fallbackResp.ok) continue;
                const fallbackJson = await fallbackResp.json();
                const latestIssue = fallbackJson.results?.[0];
                if (latestIssue?.store_date) {
                    console.log(`Using latest issue date for ${s.title}: ${latestIssue.store_date}`);
                    setNextIssueDates((prev) => ({
                        ...prev,
                        [s.id]: { date: latestIssue.store_date, label: 'latest' },
                    }));
                }
            } catch (_e) {
                console.log(`Next issue fetch error for ${s.title}:`, _e);
            }
        }
    };
    const removeSeries = (id: string, title: string) => {
        Alert.alert(
            "Remove Comic",
            `Are you sure you want to drop "${title}" from your Pull List?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from('series')
                                .delete()
                                .eq('id', id);

                            if (error) throw error;

                            setSeries((prevSeries) => prevSeries.filter((item) => item.id !== id));

                        } catch (error) {
                            console.error('Error deleting series:', error);
                            Alert.alert('Error', 'Could not remove the series from your list.');
                        }
                    }
                }
            ]
        );
    };

    const renderItem = useCallback(({ item }: { item: Series }) => (
        <View style={styles.gridCard}>
            <View style={styles.imagePlaceholder}>
                {item.image_url ? (
                    <Image
                        source={{ uri: item.image_url }}
                        style={styles.coverImage}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                        recyclingKey={item.id}
                        placeholder={{ uri: undefined }}
                        placeholderContentFit="cover"
                    />
                ) : (
                    <Text style={{ color: '#444' }}>No Cover</Text>
                )}
                <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => removeSeries(item.id, item.title)}
                >
                    <Text style={styles.deleteButtonText}>✕</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.gridTitle} numberOfLines={2}>
                    {item.title}
                </Text>
                <Text style={[
                    styles.nextIssueDate,
                    nextIssueDates[item.id]?.label === 'latest' && styles.latestIssueDate,
                ]}>
                    {nextIssueDates[item.id]
                        ? `${nextIssueDates[item.id].label === 'next' ? 'Next' : 'Latest'}: ${new Date(nextIssueDates[item.id].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : 'Next: —'}
                </Text>
            </View>
        </View>
    ), [nextIssueDates]);

    const keyExtractor = useCallback((item: Series) => item.id, []);

    return (
        <View style={styles.container}>
            {loading ? (
                <ActivityIndicator size="large" color="#ffffff" style={{ marginTop: 50 }} />
            ) : series.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>Your Pull List is empty.</Text>
                    <Text style={styles.subText}>Tap the button below to start tracking.</Text>
                </View>
            ) : (
                <FlatList
                    data={series}
                    extraData={nextIssueDates}
                    keyExtractor={keyExtractor}
                    numColumns={2}
                    contentContainerStyle={{ padding: 10 }}
                    columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 5 }}
                    renderItem={renderItem}
                    initialNumToRender={6}
                    maxToRenderPerBatch={4}
                    windowSize={5}
                    removeClippedSubviews={true}
                    getItemLayout={undefined}
                />
            )}

            <Link href="/search" asChild>
                <TouchableOpacity style={styles.fab}>
                    <Text style={styles.fabText}>+ Add Series</Text>
                </TouchableOpacity>
            </Link>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
    subText: { color: '#888888', fontSize: 14, marginTop: 8 },
    gridCard: {
        backgroundColor: '#1e1e1e',
        width: '48%',
        borderRadius: 12,
        marginBottom: 15,
        overflow: 'hidden',
        elevation: 3,
    },
    imagePlaceholder: {
        width: '100%',
        aspectRatio: 2 / 3,
        backgroundColor: '#2a2a2a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    coverImage: {
        width: '100%',
        height: '100%',
    },
    textContainer: {
        padding: 10,
        minHeight: 50,
        backgroundColor: '#1e1e1e',
    },
    gridTitle: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold',
        lineHeight: 18,
    },
    nextIssueDate: {
        color: '#ff4757',
        fontSize: 11,
        marginTop: 3,
        fontWeight: '600',
    },
    latestIssueDate: {
        color: '#ffa502',
    },
    deleteButton: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    deleteButtonText: {
        color: '#ff4757',
        fontSize: 14,
        fontWeight: 'bold',
        marginTop: -2,
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 20,
        backgroundColor: '#ff4757',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 30,
        elevation: 5,
    },
    fabText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
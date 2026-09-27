import { Stack, useRouter } from 'expo-router';
import { signOut, updateProfile } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { Colors, SharedStyles } from '../constants/styles';
import { scheduleReleaseNotifications } from '../constants/notifications';
import { useAppTheme, ThemePreference, ColorMode, PREVIEW_COLORS } from '../hooks/useTheme';
import { useThemedAlert } from '../components/ThemedAlertProvider';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default function Profile() {
    const { preference, setPreference, colorMode, setColorMode, colors } = useAppTheme();
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Default to 9:00 AM
    const [notificationTime, setNotificationTime] = useState(new Date(new Date().setHours(9, 0, 0, 0)));
    const [showPicker, setShowPicker] = useState(false);
    
    const { showAlert } = useThemedAlert();

    const router = useRouter();

    useEffect(() => {
        loadProfile();
    }, []);

    async function loadProfile() {
        const user = auth.currentUser;
        if (user) {
            setName(user.displayName || '');
        }

        try {
            const savedTime = await AsyncStorage.getItem('notificationTime');
            if (savedTime) {
                setNotificationTime(new Date(savedTime));
            }
        } catch (e) {
            console.error('Failed to load notification time', e);
        }

        setLoading(false);
    }

    const handleTimeChange = async (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') setShowPicker(false);
        if (selectedDate) {
            setNotificationTime(selectedDate);
        }
    };

    async function handleSaveChanges() {
        const user = auth.currentUser;
        if (!user) return;

        setSaving(true);
        try {
            await updateProfile(user, { displayName: name.trim() });
            
            // Persist Themes
            await AsyncStorage.setItem('theme_preference', preference);
            await AsyncStorage.setItem('color_mode', colorMode);

            // Persist Notifications
            await AsyncStorage.setItem('notificationTime', notificationTime.toISOString());
            const seriesQuery = query(collection(db, 'series'), where('user_id', '==', user.uid));
            const snapshot = await getDocs(seriesQuery);
            const pullList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            
            const rawDates = await AsyncStorage.getItem('comic_calendar_issue_dates_v2');
            const datesMap = rawDates ? JSON.parse(rawDates).data : {};
            
            await scheduleReleaseNotifications(pullList, datesMap, { 
                hours: notificationTime.getHours(), 
                minutes: notificationTime.getMinutes() 
            });

            showAlert('Success', 'All changes saved!');
        } catch (error: any) {
            showAlert('Error', error.message);
        }
        setSaving(false);
    }

    async function handleSignOut() {
        try {
            await signOut(auth);
        } catch (error: any) {
            showAlert('Error', 'Could not sign out. Please try again.');
        }
    }

    if (loading) {
        return <View style={SharedStyles.centeredContainer}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    }

    return (
        <>
            <Stack.Screen 
                options={{
                    headerStyle: { backgroundColor: colors.surface },
                    headerTintColor: colors.onSurface,
                }} 
            />
            <ScrollView 
                style={[styles.container, { backgroundColor: colors.background }]} 
                contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
            >
            <View style={styles.infoSection}>
                <View style={[styles.avatarCircle, { backgroundColor: colors.primary, borderColor: colors.outline }]}>
                    <Text style={[styles.avatarInitial, { color: colors.onPrimary }]}>
                        {name ? name.charAt(0).toUpperCase() : '?'}
                    </Text>
                </View>
                <Text style={[styles.emailText, { color: colors.onSurfaceVariant }]}>{auth.currentUser?.email || ''}</Text>
            </View>

            <View style={styles.inputSection}>
                <Text style={[styles.label, { color: colors.onSurface }]}>Full Name</Text>
                <TextInput
                    style={[SharedStyles.input, { color: colors.onSurface, borderColor: colors.outline, backgroundColor: colors.surfaceContainer }]}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your Name"
                    placeholderTextColor={colors.onSurfaceVariant}
                />
            </View>

            <View style={[styles.inputSection, { marginTop: 30 }]}>
                <Text style={[styles.label, { color: colors.onSurface }]}>Notification Time</Text>
                
                {Platform.OS === 'ios' ? (
                    <View style={[styles.pickerContainer, { backgroundColor: colors.surfaceContainer }]}>
                        <DateTimePicker
                            value={notificationTime}
                            mode="time"
                            display="spinner"
                            onValueChange={handleTimeChange}
                            textColor={colors.onSurface}
                        />
                    </View>
                ) : (
                    <>
                        <TouchableOpacity style={[SharedStyles.input, { justifyContent: 'center', borderColor: colors.outline, backgroundColor: colors.surfaceContainer }]} onPress={() => setShowPicker(true)}>
                            <Text style={{ color: colors.onSurface, fontSize: 16, fontFamily: 'PlusJakartaSans_400Regular' }}>
                                {notificationTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </TouchableOpacity>
                        {showPicker && (
                            <DateTimePicker
                                value={notificationTime}
                                mode="time"
                                display="spinner"
                                onValueChange={handleTimeChange}
                                onDismiss={() => setShowPicker(false)}
                            />
                        )}
                    </>
                )}
                

            </View>

            <View style={[styles.inputSection, { marginTop: 30 }]}>
                <Text style={[styles.label, { color: colors.onSurface }]}>Appearance</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {(['system', 'light', 'dark'] as ColorMode[]).map(mode => (
                        <TouchableOpacity
                            key={mode}
                            onPress={() => setColorMode(mode, false)}
                            style={{
                                paddingHorizontal: 15,
                                paddingVertical: 8,
                                borderRadius: 20,
                                backgroundColor: colorMode === mode ? colors.primary : colors.surfaceContainer,
                                borderWidth: 1,
                                borderColor: colorMode === mode ? colors.primary : colors.outline,
                            }}
                        >
                            <Text style={{ 
                                color: colorMode === mode ? colors.onPrimary : colors.onSurface,
                                textTransform: 'capitalize',
                                fontWeight: '600',
                                fontFamily: 'PlusJakartaSans_700Bold'
                            }}>
                                {mode}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={[styles.inputSection, { marginTop: 30 }]}>
                <Text style={[styles.label, { color: colors.onSurface }]}>Theme Colors</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 15 }}>
                    {(['system', 'pine', 'mocha', 'obsidian', 'navy', 'coral', 'forest', 'teal', 'indigo', 'plum', 'matcha', 'noir'] as ThemePreference[]).map(pref => {
                        let fgCol, bgCol, label;
                        
                        if (pref === 'system') {
                            fgCol = '#8BB0F5'; // Static preview color for System
                            bgCol = colorMode === 'dark' ? '#1A212E' : '#E8F0FE';
                            label = 'System';
                        } else {
                            fgCol = PREVIEW_COLORS[pref].fg;
                            bgCol = colorMode === 'dark' ? PREVIEW_COLORS[pref].bgDark : PREVIEW_COLORS[pref].bgLight;
                            label = pref.charAt(0).toUpperCase() + pref.slice(1);
                        }

                        return (
                            <TouchableOpacity
                                key={pref}
                                onPress={() => setPreference(pref, false)}
                                style={{ width: '25%', alignItems: 'center', marginBottom: 25 }}
                            >
                                <View style={{
                                    width: 50,
                                    height: 50,
                                    borderRadius: 25,
                                    overflow: 'hidden',
                                    borderWidth: preference === pref ? 2 : 1,
                                    borderColor: preference === pref ? colors.primary : colors.outlineVariant,
                                    transform: [{ rotate: '-45deg' }]
                                }}>
                                    <View style={{ flex: 1, backgroundColor: fgCol }} />
                                    <View style={{ flex: 1, backgroundColor: bgCol }} />
                                    
                                    {preference === pref && (
                                        <View style={{ 
                                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                                            justifyContent: 'center', alignItems: 'center',
                                            transform: [{ rotate: '45deg' }]
                                        }}>
                                            <Ionicons name="checkmark" size={24} color="#ffffff" style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }} />
                                        </View>
                                    )}
                                </View>
                                <Text style={{ 
                                    marginTop: 8,
                                    color: preference === pref ? colors.primary : colors.onSurfaceVariant,
                                    fontSize: 12,
                                    fontWeight: preference === pref ? 'bold' : 'normal',
                                    fontFamily: preference === pref ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_400Regular'
                                }}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <TouchableOpacity style={[SharedStyles.primaryButton, { backgroundColor: colors.primary, marginTop: 40 }]} onPress={handleSaveChanges} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[SharedStyles.buttonText, { color: colors.onPrimary }]}>Save All Changes</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.logoutButton, { borderColor: colors.primary }]} onPress={handleSignOut}>
                <Text style={[styles.logoutText, { color: colors.primary }]}>Log Out</Text>
            </TouchableOpacity>
        </ScrollView>
        </>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    infoSection: { width: '100%', alignItems: 'center', marginTop: 40, marginBottom: 40 },
    avatarCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: Colors.border,
    },
    avatarInitial: { color: '#fff', fontSize: 48, fontWeight: 'bold', fontFamily: 'PlusJakartaSans_700Bold' },
    emailText: { color: Colors.textSecondary, fontSize: 14, marginTop: 12, fontFamily: 'PlusJakartaSans_400Regular' },
    inputSection: { gap: 10 },
    pickerContainer: { alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 8, overflow: 'hidden' },
    label: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginLeft: 4, fontFamily: 'PlusJakartaSans_700Bold' },
    logoutButton: { marginTop: 20, marginBottom: 20, padding: 16, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary },
    logoutText: { color: Colors.primary, fontWeight: 'normal', fontSize: 16, fontFamily: 'SpaceGrotesk_700Bold' },
});
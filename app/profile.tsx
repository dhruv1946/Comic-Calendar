import { useRouter } from 'expo-router';
import { signOut, updateProfile } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, SharedStyles } from '../constants/styles';
import { sendTestNotification, scheduleReleaseNotifications } from '../constants/notifications';
import { auth, db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default function Profile() {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Default to 9:00 AM
    const [notificationTime, setNotificationTime] = useState(new Date(new Date().setHours(9, 0, 0, 0)));
    const [showPicker, setShowPicker] = useState(false);

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
            try {
                await AsyncStorage.setItem('notificationTime', selectedDate.toISOString());
                
                // Immediately reschedule all notifications with the new time
                const user = auth.currentUser;
                if (user) {
                    const seriesQuery = query(collection(db, 'series'), where('user_id', '==', user.uid));
                    const snapshot = await getDocs(seriesQuery);
                    const pullList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    
                    const rawDates = await AsyncStorage.getItem('comic_calendar_issue_dates_v2');
                    const datesMap = rawDates ? JSON.parse(rawDates).data : {};
                    
                    await scheduleReleaseNotifications(pullList, datesMap, { 
                        hours: selectedDate.getHours(), 
                        minutes: selectedDate.getMinutes() 
                    });
                }
            } catch (e) {
                console.error('Failed to save time', e);
            }
        }
    };

    async function handleSaveName() {
        const user = auth.currentUser;
        if (!user) return;

        setSaving(true);
        try {
            await updateProfile(user, { displayName: name.trim() });
            Alert.alert('Success', 'Profile updated!');
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
        setSaving(false);
    }

    async function handleSignOut() {
        try {
            await signOut(auth);
        } catch (error: any) {
            Alert.alert('Error', 'Could not sign out. Please try again.');
        }
    }

    if (loading) {
        return <View style={SharedStyles.centeredContainer}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    }

    return (
        <View style={styles.container}>
            <View style={styles.infoSection}>
                <View style={[styles.avatarCircle]}>
                    <Text style={styles.avatarInitial}>
                        {name ? name.charAt(0).toUpperCase() : '?'}
                    </Text>
                </View>
                <Text style={styles.emailText}>{auth.currentUser?.email || ''}</Text>
            </View>

            <View style={styles.inputSection}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                    style={SharedStyles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your Name"
                    placeholderTextColor={Colors.textSecondary}
                />

                <TouchableOpacity style={SharedStyles.primaryButton} onPress={handleSaveName} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={SharedStyles.buttonText}>Save Changes</Text>}
                </TouchableOpacity>
            </View>

            <View style={[styles.inputSection, { marginTop: 30 }]}>
                <Text style={styles.label}>Notification Time</Text>
                
                {Platform.OS === 'ios' ? (
                    <View style={styles.pickerContainer}>
                        <DateTimePicker
                            value={notificationTime}
                            mode="time"
                            display="spinner"
                            onValueChange={handleTimeChange}
                            textColor={Colors.textPrimary}
                        />
                    </View>
                ) : (
                    <>
                        <TouchableOpacity style={[SharedStyles.input, { justifyContent: 'center' }]} onPress={() => setShowPicker(true)}>
                            <Text style={{ color: Colors.textPrimary, fontSize: 16 }}>
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
                
                <TouchableOpacity style={[SharedStyles.secondaryButton, { marginTop: 10 }]} onPress={sendTestNotification}>
                    <Text style={SharedStyles.secondaryButtonText}>Send Test Notification</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
                <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background, padding: 20 },
    infoSection: { alignItems: 'center', marginTop: 40, marginBottom: 40 },
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
    avatarInitial: { color: '#fff', fontSize: 48, fontWeight: 'bold' },
    emailText: { color: Colors.textSecondary, fontSize: 14, marginTop: 12 },
    inputSection: { gap: 10 },
    pickerContainer: { alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 8, overflow: 'hidden' },
    label: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginLeft: 4 },
    logoutButton: { marginTop: 'auto', marginBottom: 20, padding: 16, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary },
    logoutText: { color: Colors.primary, fontWeight: 'bold', fontSize: 16 },
});
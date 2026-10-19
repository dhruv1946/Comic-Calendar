import { Stack, useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/styles';
import { auth } from '../firebase';
import { requestNotificationPermissions } from '../constants/notifications';
import { ThemeProvider, useAppTheme } from '../hooks/useTheme';
import { ThemedAlertProvider } from '../components/ThemedAlertProvider';
import { useFonts, Syne_700Bold } from '@expo-google-fonts/syne';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import * as SplashScreen from 'expo-splash-screen';

// Prevent the native splash screen from hiding before initial assets and auth are ready
SplashScreen.preventAutoHideAsync();

// ── Error Boundary ───────────────────────────────────────────────────
// Expo Router uses this export to wrap screens automatically
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
    return (
        <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', padding: 30 }}>
            <Text style={{ color: Colors.primary, fontSize: 48, marginBottom: 20 }}>⚠️</Text>
            <Text style={{ color: Colors.textPrimary, fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', fontFamily: 'PlusJakartaSans_700Bold' }}>
                Something went wrong
            </Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 30, fontFamily: 'PlusJakartaSans_400Regular' }}>
                {error.message}
            </Text>
            <TouchableOpacity
                onPress={retry}
                style={{ backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 30, borderRadius: 8 }}
            >
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16, fontFamily: 'PlusJakartaSans_700Bold' }}>Try Again</Text>
            </TouchableOpacity>
        </View>
    );
}

// ── Root Layout ──────────────────────────────────────────────────────
function RootLayoutNav({ initialRoute }: { initialRoute: string }) {
    const { colors } = useAppTheme();
    return (
        <ThemedAlertProvider>
            <Stack
                initialRouteName={initialRoute}
                screenOptions={{
                    headerStyle: { backgroundColor: colors.surface },
                    headerTintColor: colors.onSurface,
                    contentStyle: { backgroundColor: colors.background },
                }}
            >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="signup" options={{ headerShown: false }} />
                <Stack.Screen name="profile" options={{ title: 'Your Profile', presentation: 'modal' }} />
            </Stack>
        </ThemedAlertProvider>
    );
}

export default function Layout() {
    const router = useRouter();
    const segments = useSegments();
    const [isReady, setIsReady] = useState(false);
    const [user, setUser] = useState<User | null>(null);

    // Optimized font loading: only load the font weights actually used
    const [fontsLoaded] = useFonts({
        Syne_700Bold,
        SpaceGrotesk_700Bold,
        PlusJakartaSans_400Regular,
        PlusJakartaSans_500Medium,
        PlusJakartaSans_700Bold,
    });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setIsReady(true);
        });

        return () => unsubscribe();
    }, []);

    // Defer notification permissions until after app is interactive to avoid startup delay
    useEffect(() => {
        if (isReady && fontsLoaded) {
            const timer = setTimeout(() => {
                requestNotificationPermissions();
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [isReady, fontsLoaded]);

    // Handle subsequent auth state changes (login / logout)
    useEffect(() => {
        if (!isReady) return;

        const inLoginScreen = segments[0] === 'login';

        if (!user && !inLoginScreen) {
            router.replace('/login');
        } else if (user && inLoginScreen) {
            router.replace('/');
        }
    }, [isReady, user]);

    // Dismiss the native splash screen only after the initial screen has mounted and painted
    const onLayoutRootView = useCallback(() => {
        if (isReady && fontsLoaded) {
            requestAnimationFrame(async () => {
                try {
                    await SplashScreen.hideAsync();
                } catch {
                    // Ignore any native dismiss race conditions
                }
            });
        }
    }, [isReady, fontsLoaded]);

    // Keep native splash screen visible while loading (no second screen / no flashing)
    if (!isReady || !fontsLoaded) {
        return null;
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#000000' }} onLayout={onLayoutRootView}>
            <ThemeProvider>
                <RootLayoutNav initialRoute={user ? '(tabs)' : 'login'} />
            </ThemeProvider>
        </View>
    );
}
import { Tabs, Link } from 'expo-router';
import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import Animated, { LinearTransition, FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../hooks/useTheme';
import { Colors as StaticColors } from '../../constants/styles';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function CustomTabBar({ state, descriptors, navigation, colors }: BottomTabBarProps & { colors: any }) {
    return (
        <View style={styles.tabBarWrapper}>
            <View style={[styles.tabBar, { backgroundColor: colors.surfaceContainerHigh || '#2a2a2a' }]}>
                {state.routes.map((route, index) => {
                    const isFocused = state.index === index;
                    const onPress = () => {
                        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                        if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
                    };

                    const iconName = route.name === 'index'
                        ? (isFocused ? 'home' : 'home-outline')
                        : (isFocused ? 'search' : 'search-outline');
                    const label = route.name === 'index' ? 'Home' : 'Search';

                    return (
                        <AnimatedTouchable
                            key={route.key}
                            onPress={onPress}
                            activeOpacity={0.8}
                            layout={LinearTransition.springify().damping(14).stiffness(100)}
                            style={[
                                styles.tabItem,
                                {
                                    flex: isFocused ? 1.5 : 1,
                                    backgroundColor: isFocused ? (colors.secondaryContainer || '#ff4757') : 'transparent'
                                }
                            ]}
                        >
                            <Ionicons name={iconName as any} size={20} color={isFocused ? (colors.onSecondaryContainer || '#ffffff') : (colors.onSurfaceVariant || '#888888')} />
                            {isFocused && (
                                <Animated.Text
                                    entering={FadeIn.duration(200)}
                                    exiting={FadeOut.duration(200)}
                                    numberOfLines={1}
                                    style={{ color: colors.onSecondaryContainer || '#ffffff', fontWeight: 'bold', fontSize: 14, marginLeft: 6 }}
                                >
                                    {label}
                                </Animated.Text>
                            )}
                        </AnimatedTouchable>
                    );
                })}
            </View>
        </View>
    );
}

export default function TabLayout() {
    const { colors } = useAppTheme();

    return (
        <Tabs
            detachInactiveScreens={false}
            tabBar={(props: any) => <CustomTabBar {...props} colors={colors} />}
            screenOptions={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.onSurface || StaticColors.textPrimary,
                sceneStyle: { flex: 1, backgroundColor: colors.surface },
                animation: 'shift',
                lazy: false,
                freezeOnBlur: false,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Pull List',
                    headerRight: () => (
                        <Link href="/profile" asChild>
                            <TouchableOpacity style={{ marginRight: 15 }}>
                                <Text style={{ color: colors.primary, fontWeight: 'bold' }}>Profile</Text>
                            </TouchableOpacity>
                        </Link>
                    ),
                }}
            />
            <Tabs.Screen
                name="search"
                options={{
                    title: 'Search Database',
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    tabBarWrapper: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 35 : 20,
        left: 0,
        right: 0,
        alignItems: 'center',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    tabBar: {
        flexDirection: 'row',
        height: 64,
        borderRadius: 32,
        paddingHorizontal: 6,
        paddingVertical: 6,
        alignItems: 'center',
        justifyContent: 'center',
        width: 240,
    },
    tabItem: {
        flexDirection: 'row',
        height: '100%',
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 2,
    },
});

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Set global notification handler
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const existingStatus = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus.status !== 'granted') {
    const status = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus.status !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return false;
  }
  return true;
}

export async function scheduleReleaseNotifications(
  pullList: any[],
  datesMap: Record<string, { date: string; label: 'next' | 'latest'; issueNumber?: string }>,
  preferredTime: { hours: number; minutes: number }
) {
  if (Platform.OS === 'web') return;

  // Cancel all existing scheduled notifications
  await Notifications.cancelAllScheduledNotificationsAsync();

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const now = new Date();
  const dateCounts: Record<string, number> = {};

  for (const series of pullList) {
    const issueDateInfo = datesMap[series.id];
    if (!issueDateInfo || issueDateInfo.label !== 'next' || !issueDateInfo.date) continue;

    // Parse the date (assuming 'YYYY-MM-DD' format)
    const [year, month, day] = issueDateInfo.date.split('-').map(Number);
    if (!year || !month || !day) continue;
    
    const dateKey = `${year}-${month}-${day}`;
    if (!dateCounts[dateKey]) dateCounts[dateKey] = 0;
    
    // Stagger multiple releases on the same day by 2 seconds each
    // so they pop up as distinct, separate notifications instead of clashing
    const staggerSeconds = dateCounts[dateKey] * 2;
    dateCounts[dateKey]++;

    // Create target date at the user's preferred time, plus stagger
    const targetDate = new Date(year, month - 1, day, preferredTime.hours, preferredTime.minutes, staggerSeconds);

    // Only schedule if it's in the future
    if (targetDate > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "𝗧𝗼𝗱𝗮𝘆'𝘀 𝗰𝗼𝗺𝗶𝗰 𝗳𝗼𝗿𝗲𝗰𝗮𝘀𝘁!!",
          body: `${series.title} #${issueDateInfo.issueNumber || '1'} drops today`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: targetDate,
        },
      });
    }
  }
}

export async function sendTestNotification() {
  if (Platform.OS === 'web') {
    alert("Test Notification: (Push notifications are not supported in this environment)");
    return;
  }

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "𝗧𝗼𝗱𝗮𝘆'𝘀 𝗰𝗼𝗺𝗶𝗰 𝗳𝗼𝗿𝗲𝗰𝗮𝘀𝘁!!",
      body: 'Batman #15 drops today',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
    },
  });
}

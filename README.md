# Comic Calendar

<div align="center">

![Comic Calendar Banner](assets/images/icon.png)

### Never miss another comic release day.
A sleek, modern comic book tracker and pull-list manager built with React Native and Expo.

[![React Native](https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react&logoColor=black)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-SDK_57-000000?logo=expo&logoColor=white)](https://expo.dev)
[![Platform](https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white)](https://www.android.com/)
[![Version](https://img.shields.io/badge/Release-v1.0.0-blueviolet)](https://github.com/dhruv1946/Comic-Calendar/releases/latest)

[**Download APK (v1.0.0)**](https://github.com/dhruv1946/Comic-Calendar/releases/latest) | [**Features**](#features) | [**Tech Stack**](#tech-stack) | [**Getting Started**](#getting-started) | [**Building from Source**](#building-the-apk)

</div>

---

## Overview

**Comic Calendar** is designed specifically for comic book readers, collectors, and Wednesday warriors. It helps you effortlessly track ongoing comic series, view precise upcoming issue numbers and release dates, and keep your pull list synced across devices without hassle.

---

## Features

- **Instant Offline-First Boot**: 
  - Sub-15ms cold start with local caching.
  - Pull list and release schedules load immediately from disk with background asynchronous refresh.
- **Smart Issue Release Tracking**:
  - Highlights upcoming issues formatted cleanly: `Next: #<issue>: <date>`.
  - Automatically displays past issues as: `Latest: #<issue>: <date>`.
  - Distinguishes upcoming releases with high-contrast accent highlights.
- **Metron Catalog Integration**:
  - Search across thousands of publishers, imprints, and series powered by the [Metron](https://metron.cloud) database.
  - View series publisher, volume years, issue counts, and cover art thumbnails.
- **Cloud Sync & Account Authentication**:
  - Secure account authentication with email verification.
  - Cloud synchronization ensures your pull list is safely backed up and available across devices.
- **Release Notifications**:
  - Timely reminders scheduled for new comic book release days so you never miss a trip to your local comic shop.
- **Premium Dark Aesthetic**:
  - Clean, distraction-free dark interface.
  - Expressive typography combining **Space Grotesk**, **Syne**, and **Plus Jakarta Sans**.
  - Fluid micro-animations with React Native Reanimated and tactile haptic feedback.

---

## Download

The standalone APK for Android is available under GitHub Releases:

**[Download Comic Calendar v1.0.0 APK](https://github.com/dhruv1946/Comic-Calendar/releases/latest)**

### Installation:
1. Download `Comic-Calendar-v1.0.0.apk` onto your Android device.
2. Follow on-device prompts to install the package.
3. Open **Comic Calendar** and start building your pull list!

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Core Framework** | [React Native 0.86](https://reactnative.dev), [Expo SDK 57](https://expo.dev) |
| **Routing** | [Expo Router v57](https://docs.expo.dev/router/introduction/) (File-based navigation) |
| **Authentication & Database** | [Firebase Auth](https://firebase.google.com/products/auth) & [Cloud Firestore](https://firebase.google.com/products/firestore) |
| **Comic Metadata** | [Metron API](https://metron.cloud) |
| **Local Storage** | [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/) |
| **Typography** | Space Grotesk, Syne, Plus Jakarta Sans (`@expo-google-fonts`) |
| **Animations & Gestures** | [React Native Reanimated 4](https://docs.swmansion.com/react-native-reanimated/), Gesture Handler |
| **Notifications** | [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) |

---

## Project Structure

```text
Comic-Calendar/
|-- app/                      # Application screens and navigation layouts
|   |-- (tabs)/               # Bottom tab navigation (Pull List, Search)
|   |-- _layout.tsx           # Root navigation, theme & auth state wrapper
|   `-- ...                   # Authentication and profile views
|-- assets/                   # App icons, splash screens, and images
|-- components/               # Reusable UI components & providers
`-- constants/                # Design tokens, theme, and configuration
```

---

## Getting Started

### Prerequisites
- **Node.js** (v18.x or later)
- **npm** or **yarn**
- **Android Studio** & **Android SDK** (for local Android emulation / native builds)
- **Java Development Kit** (JDK 17, 21, or 25)

### 1. Clone the Repository
```bash
git clone https://github.com/dhruv1946/Comic-Calendar.git
cd Comic-Calendar
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Ensure your application configuration is present in `constants/config.ts` prior to starting the development build or bundling.

### 4. Run the Development Server
```bash
npx expo start
```
- Press `a` in the terminal to launch on a connected Android device or emulator.

---

## Building the APK

To generate a standalone release APK for Android locally:

### 1. Generate Native Android Project
```bash
npx expo prebuild --platform android
```

### 2. Build Release APK via Gradle
```powershell
cd android

# If building with JDK 25:
$env:_JAVA_OPTIONS = "--enable-native-access=ALL-UNNAMED"

.\gradlew assembleRelease
```

The compiled APK will be located at:
`android/app/build/outputs/apk/release/app-release.apk`

---

## Acknowledgements

- Comic metadata provided by the [Metron](https://metron.cloud) community database.
- Built with the [Expo](https://expo.dev) ecosystem and [React Native](https://reactnative.dev).
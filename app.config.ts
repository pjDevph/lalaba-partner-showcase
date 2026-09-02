import { ExpoConfig, ConfigContext } from "expo/config";

const ENV = process.env.EXPO_PUBLIC_ENV ?? "development";
const ENV_LABELS: Record<string, string> = { development: "Dev", staging: "Staging" };
const ENV_LABEL = ENV_LABELS[ENV] ?? ENV;

const appIds: Record<string, string> = {
  development: "com.lalaba.merchant.dev",
  staging: "com.lalaba.merchant.stg",
  production: "com.lalaba.merchant",
};

// EXPO_PUBLIC_API_BASE_URL is auto-detected from LAN IP by start.js (no .env edit needed).
// The NestJS backend (LALABA_BE_DEV) listens on port 3001; GraphQL is at <base>/graphql.
// Physical Android:  http://<your-LAN-IP>:3001  (auto-set by start.js)
// Android AVD:       http://10.0.2.2:3001
// iOS Simulator:     http://localhost:3001
const apiBaseUrls: Record<string, string> = {
  production:  "https://api.lalaba.ph/v1",
  staging:     "https://api-stg.lalaba.ph/v1",
  development: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
};

const firebaseConfigs: Record<string, object> = {
  development: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY_DEV ?? "",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN_DEV ?? "",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID_DEV ?? "",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET_DEV ?? "",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID_DEV ?? "",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID_DEV ?? "",
  },
  staging: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY_STG ?? "",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN_STG ?? "",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID_STG ?? "",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET_STG ?? "",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID_STG ?? "",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID_STG ?? "",
  },
  production: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID ?? "",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
  },
};

const buildConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: ENV === "production" ? "Lalaba Partner" : `Lalaba Partner(${ENV_LABEL})`,
  slug: "lalaba-merchant-app",
  version: "1.0.0",
  orientation: "default", // allow auto-rotate (portrait + landscape)
  icon: "./assets/icon.png",
  scheme: "lalaba-merchant",
  userInterfaceStyle: "light",
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: "https://u.expo.dev/d3312a03-69e5-4337-9657-e7b701fa4166",
  },
  splash: {
    image: "./assets/splash-icon-white.png",
    resizeMode: "contain",
    backgroundColor: "#00AEEF",   // brand sky-blue — matches the JS loading screen
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: appIds[ENV] ?? appIds.development,
    googleServicesFile: "./GoogleService-Info.plist",
    infoPlist: {
      NSCameraUsageDescription: "Used to scan customer claim QR codes",
      NSPhotoLibraryUsageDescription: "Not required",
      NSLocationWhenInUseUsageDescription: "Used to pre-fill your branch address from your current location.",
      // Required for Face ID — iOS crashes at first Face ID prompt without it.
      NSFaceIDUsageDescription: "Use Face ID to sign in to Lalaba Merchant securely.",
    },
    config: {
      // Maps keys are split per platform: each Google Cloud key carries only one
      // application-restriction type, so Android (package + SHA-1) and iOS
      // (bundle id) need separate keys. Must be a static literal — Metro inlines
      // EXPO_PUBLIC_* by exact name, so a computed lookup resolves to undefined.
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS ?? "",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#1e78d2",   // brand blue — matches logo-mark icon colour
    },
    package: appIds[ENV] ?? appIds.development,
    // google-services.json is gitignored, so EAS Build's cloud checkout never
    // has it — GOOGLE_SERVICES_JSON (an EAS file env var) supplies it there;
    // local builds fall back to the file already on disk.
    "googleServicesFile": process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    permissions: [
      "CAMERA",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "BLUETOOTH",
      "BLUETOOTH_ADMIN",
      "BLUETOOTH_CONNECT",
      "BLUETOOTH_SCAN",
      "USE_BIOMETRIC",
      "USE_FINGERPRINT",
    ],
    softwareKeyboardLayoutMode: "resize",
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID ?? "",
      },
    },
  },
  androidStatusBar: {
    translucent: true,
    barStyle: "dark-content",
  },
  plugins: [
    "expo-router",
    "expo-sharing",
    "expo-mail-composer",
    [
      "expo-build-properties",
      {
        ios: {
          useFrameworks: "static",
          buildReactNativeFromSource: true,
          // 15.5, not the RN 0.83 default of 15.1: react-native-vision-camera-face-detector's
          // podspec pins GoogleMLKit/FaceDetection 9.0.0, whose own floor is 15.5. At 15.1
          // CocoaPods cannot resolve VisionCameraFaceDetector at all and `pod install` fails
          // with "required a higher minimum deployment target".
          deploymentTarget: "15.5",
        },
      },
    ],
    "@react-native-google-signin/google-signin",
    "@react-native-firebase/app",
    "@react-native-firebase/auth",
      "@react-native-firebase/messaging",
    "@react-native-firebase/app-check",
    [
      "expo-camera",
      {
        cameraPermission: "Allow Lalaba Merchant to scan QR codes.",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "Allow Lalaba Partner to use your location to pre-fill your branch address.",
      },
    ],
    "./plugins/withAllowNonModularIncludes.js",
    // Lets Android/iOS resolve waze:// etc for Profile → Preferred navigation.
    "./plugins/withNavAppQueries.js",
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    env: ENV,
    firebaseConfig: firebaseConfigs[ENV] ?? firebaseConfigs.development,
    apiBaseUrl: apiBaseUrls[ENV] ?? apiBaseUrls.development,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
    googleMapsApiKeyAndroid: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID ?? "",
    googleMapsApiKeyIos: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS ?? "",
    eas: {
      projectId: "d3312a03-69e5-4337-9657-e7b701fa4166",
    },
  },
});

export default buildConfig;
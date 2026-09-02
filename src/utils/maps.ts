// src/utils/maps.ts
// Hand off turn-by-turn navigation to the rider's preferred maps app. Shared by
// the courier task detail and the courier map, so the deep-link formats live in
// one place rather than being re-derived per screen.

import { Linking, Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import { notify } from "../stores/notificationStore";
import { useCourierPrefsStore, NAV_APP_LABEL, type NavApp } from "../stores/courierPrefsStore";
import type { LatLng } from "../services/graphql/onlineOrders";

// Explicit Android components, so a launch goes straight to the chosen app and
// never raises a chooser. Both activities are exported; verified with
//   adb shell cmd package query-activities -a android.intent.action.VIEW -d <uri>
//
// A package name alone is NOT enough: expo-intent-launcher only sets a component
// when className is also supplied (it never calls Intent.setPackage), so passing
// just the package leaves the intent implicit and Android still disambiguates.
const ANDROID_TARGET: Partial<Record<NavApp, { pkg: string; cls: string }>> = {
  google: { pkg: "com.google.android.apps.maps", cls: "com.google.android.maps.MapsActivity" },
  waze: { pkg: "com.waze", cls: "com.waze.FreeMapAppActivity" },
};

// Waze and Apple Maps take lat/lng as separate params and have no address form
// that reliably starts navigation, so each app gets its own builder rather than
// one URL with the destination swapped in.
function buildUrl(app: NavApp, address: string, at: LatLng | null): string {
  const q = encodeURIComponent(at ? `${at.latitude},${at.longitude}` : address);

  if (app === "waze") {
    // navigate=yes starts guidance immediately instead of only dropping a pin.
    return at
      ? `waze://?ll=${at.latitude},${at.longitude}&navigate=yes`
      : `waze://?q=${q}&navigate=yes`;
  }
  if (app === "apple") {
    return `http://maps.apple.com/?daddr=${q}&dirflg=d`;
  }
  // Google. The android-only `google.navigation:` scheme jumps straight into
  // turn-by-turn; elsewhere fall back to the universal web URL, which opens the
  // app when installed.
  return Platform.OS === "android"
    ? `google.navigation:q=${q}`
    : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

/**
 * The rider's chosen app, minus options the platform can't service.
 *
 * Exported (and pure) so UI can label the button with what will actually open —
 * a screen promising "Open Apple Maps" on Android would be lying. Callers pass
 * the stored value in rather than reading the store here, so a component can
 * subscribe and re-render when the preference changes.
 */
export function effectiveNavApp(chosen: NavApp): NavApp {
  if (chosen === "apple" && Platform.OS !== "ios") return "google";
  return chosen;
}

function resolveNavApp(): NavApp {
  return effectiveNavApp(useCourierPrefsStore.getState().navApp);
}

/**
 * Launch one specific app, rejecting if it isn't installed.
 *
 * On Android `Linking.openURL` is not enough: once Waze is installed it
 * registers for `google.navigation:` and `geo:` as well, so those intents match
 * two activities and the OS shows a disambiguation chooser — silently
 * overriding the rider's stored preference. RN builds a plain
 * `Intent(ACTION_VIEW, uri)` with no way to name a target, so target the
 * component explicitly instead. iOS needs none of this: a scheme belongs to one
 * app, so there is nothing to disambiguate.
 */
async function launch(app: NavApp, url: string): Promise<void> {
  const target = Platform.OS === "android" ? ANDROID_TARGET[app] : undefined;

  if (target) {
    try {
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: url,
        packageName: target.pkg,
        className: target.cls,
      });
      return;
    } catch {
      // Either the app isn't installed, or it renamed the activity in an
      // update. Retry implicitly: worse UX (a chooser may appear) but the rider
      // still gets directions, and if it's genuinely absent this throws too and
      // openMaps() falls back to Google with an explanation.
    }
  }
  await Linking.openURL(url);
}

/**
 * Open turn-by-turn directions to a stop.
 *
 * Prefers the customer's drop pin over the address text: a free-form address
 * makes the maps app re-geocode, which routinely lands on the wrong end of a
 * long street. `address` is the fallback for orders with no usable pin.
 *
 * Falls back to Google when the preferred app isn't installed — a rider mid-run
 * needs directions more than they need their preference honoured. The fallback
 * is announced rather than silent: landing in Google Maps after choosing Waze
 * otherwise reads as the setting being broken.
 */
export function openMaps(address: string, at: LatLng | null): void {
  const app = resolveNavApp();

  void launch(app, buildUrl(app, address, at)).catch(() => {
    if (app === "google") {
      notify.error("Couldn't open Maps");
      return;
    }
    launch("google", buildUrl("google", address, at))
      .then(() =>
        notify.info(
          `${NAV_APP_LABEL[app]} isn't installed`,
          "Opened Google Maps instead. Change this in Profile → Preferred navigation.",
        ),
      )
      .catch(() => notify.error("Couldn't open Maps"));
  });
}

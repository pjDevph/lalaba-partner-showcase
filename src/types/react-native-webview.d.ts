// Minimal type stub for react-native-webview (sandbox — package not installed here).
// The real package must be installed on the dev machine via `npx expo install react-native-webview`.
declare module "react-native-webview" {
  import { ComponentType } from "react";
  import { StyleProp, ViewStyle } from "react-native";

  export interface WebViewMessageEvent {
    nativeEvent: {
      data: string;
      url: string;
      loading: boolean;
      title: string;
      canGoBack: boolean;
      canGoForward: boolean;
    };
  }

  export interface WebViewSource {
    html?: string;
    uri?: string;
    baseUrl?: string;
    headers?: Record<string, string>;
  }

  export interface WebViewProps {
    source: WebViewSource;
    style?: StyleProp<ViewStyle>;
    javaScriptEnabled?: boolean;
    domStorageEnabled?: boolean;
    originWhitelist?: string[];
    mixedContentMode?: "always" | "never" | "compatibility";
    onMessage?: (event: WebViewMessageEvent) => void;
    onLoad?: () => void;
    onLoadEnd?: () => void;
    onError?: (event: unknown) => void;
    scrollEnabled?: boolean;
    bounces?: boolean;
  }

  export const WebView: ComponentType<WebViewProps>;
  export default WebView;
}

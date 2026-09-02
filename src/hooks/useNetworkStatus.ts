import { useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

type NetworkStatus = {
  isOffline: boolean;
  justReconnected: boolean;
};

export function useNetworkStatus(): NetworkStatus {
  const [isOffline, setIsOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOffline = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;

      if (!offline && wasOffline.current) {
        setJustReconnected(true);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => setJustReconnected(false), 3000);
      }

      wasOffline.current = offline;
      setIsOffline(offline);
    });

    return () => {
      unsub();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  return { isOffline, justReconnected };
}

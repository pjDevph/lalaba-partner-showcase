// src/components/AddressPicker.tsx
// Shared address picker used by onboarding and register.
//
// Features:
//   • Nominatim (OpenStreetMap) autocomplete — real Philippine addresses, no API key
//   • "My location" GPS button (expo-location)
//   • "Pin on map" Leaflet WebView modal (react-native-webview)
//   • PSGC cascading dropdowns: Region → Province → City/Municipality → Barangay
//   • Free-text fields: unit, street, ZIP code, landmark

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Modal,
  FlatList,
  useWindowDimensions,
} from "react-native";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchRegions,
  fetchProvinces,
  fetchCitiesMunicipalities,
  fetchBarangays,
  isNcr,
  NCR_PROVINCE_NAME,
} from "../utils/psgc";
import { C, RADIUS, SP } from "../theme/tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StructuredAddress {
  displayName: string;    // FE-only: Nominatim display text (search field)
  latitude:    number | null;
  longitude:   number | null;
  // Free text (combined into streetAddress on send)
  unit:    string;
  street:  string;
  zipCode: string;
  // AddressInput fields — match BE schema exactly
  barangayName:         string;
  barangayCode:         string;
  cityMunicipalityName: string;
  cityMunicipalityCode: string;
  provinceName:         string;
  provinceCode:         string;
  regionName:           string;
  regionCode:           string;
}

export const EMPTY_ADDRESS: StructuredAddress = {
  displayName: "", latitude: null, longitude: null,
  unit: "", street: "", zipCode: "",
  barangayName: "", barangayCode: "",
  cityMunicipalityName: "", cityMunicipalityCode: "",
  provinceName: "", provinceCode: "",
  regionName: "", regionCode: "",
};

export function formatStructuredAddress(a: StructuredAddress): string {
  const parts = [a.unit, a.street, a.barangayName, a.cityMunicipalityName, a.provinceName].filter(Boolean);
  return parts.join(", ") || a.displayName;
}

// ─── Nominatim helpers ────────────────────────────────────────────────────────

const NOMINATIM_UA = "LalabaPartnerApp/1.0 (support@lalaba.ph)";

interface NominatimResult {
  place_id:     string;
  display_name: string;
  lat:          string;
  lon:          string;
  address?: {
    house_number?: string;
    road?:         string;
    pedestrian?:   string;
    suburb?:       string;
    village?:      string;
    neighbourhood?: string;
    quarter?:      string;
    city?:         string;
    town?:         string;
    municipality?: string;
    county?:       string;
    // Above city level — what disambiguates same-named municipalities.
    province?:     string;
    state?:        string;
    region?:       string;
  };
}

// Nominatim is a third-party service on the public internet, so it fails in
// ways that have nothing to do with what the user typed: DNS down, offline,
// rate-limited (429), or UA-blocked (403 — their policy rejects generic
// browser agents, which is why NOMINATIM_UA is set explicitly). All of those
// used to be swallowed into an empty result list, so a partner saw "no
// matches for my street" and had no idea the lookup never happened.
//
// A 10s cap matters as much as the message: a stalled DNS resolver can hang a
// fetch for far longer, leaving the spinner up with no way out.
const LOOKUP_TIMEOUT_MS = 10_000;

export type LookupFailure = "offline" | "rate-limited" | "unavailable";

export const LOOKUP_FAILURE_TEXT: Record<LookupFailure, string> = {
  offline:       "Can't reach the address service. Check your connection, or enter the address manually below.",
  "rate-limited": "The address service is busy. Wait a moment and try again, or enter the address manually below.",
  unavailable:   "Address lookup is unavailable right now. Enter the address manually below.",
};

async function nominatimFetch<T>(url: string): Promise<{ data: T | null; failure: LookupFailure | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_UA },
      signal:  controller.signal,
    });
    if (!res.ok) {
      return { data: null, failure: res.status === 429 ? "rate-limited" : "unavailable" };
    }
    return { data: (await res.json()) as T, failure: null };
  } catch {
    // AbortError and DNS/socket errors are indistinguishable to the user and
    // have the same remedy, so both read as "offline".
    return { data: null, failure: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

export async function searchAddress(
  query: string,
): Promise<{ results: NominatimResult[]; failure: LookupFailure | null }> {
  if (query.trim().length < 3) return { results: [], failure: null };
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=json&q=${encodeURIComponent(query)}&countrycodes=ph` +
    `&limit=6&addressdetails=1&accept-language=en`;
  const { data, failure } = await nominatimFetch<NominatimResult[]>(url);
  return { results: Array.isArray(data) ? data : [], failure };
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ result: NominatimResult | null; failure: LookupFailure | null }> {
  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=17&accept-language=en`;
  const { data, failure } = await nominatimFetch<NominatimResult>(url);
  return { result: data?.display_name ? data : null, failure };
}

// A pin with no reverse-geocoded name is still a usable pin — it is what the
// service radius is measured from. Showing the coordinates proves the location
// was captured; showing nothing (the old behaviour) is indistinguishable from
// the button having done nothing at all.
export function formatCoords(lat: number, lng: number): string {
  return `Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// Nominatim provides only display text — PSGC codes are set via the cascading dropdowns.
function parseNominatim(r: NominatimResult): Partial<StructuredAddress> {
  const a = r.address ?? {};
  return {
    displayName: r.display_name,
    latitude:      parseFloat(r.lat),
    longitude:      parseFloat(r.lon),
    street:      a.road ?? a.pedestrian ?? "",
    barangayName:         a.suburb ?? a.village ?? a.neighbourhood ?? a.quarter ?? "",
    cityMunicipalityName: a.city ?? a.town ?? a.municipality ?? a.county ?? "",
    // Carried so the PSGC lookup can tell San Juan, NCR from San Juan, Ilocos
    // Sur. Overwritten with the resolved PSGC province the moment the lookup
    // succeeds; until then it is display text with no code, same as the rest.
    provinceName:         a.province ?? a.state ?? "",
    regionName:           a.region ?? "",
  };
}

// ─── Leaflet map HTML ─────────────────────────────────────────────────────────

function buildMapHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#map{width:100%;height:calc(100vh - 132px)}
#panel{position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:20px 20px 0 0;
  padding:16px 16px 28px;box-shadow:0 -4px 24px rgba(0,0,0,.18);z-index:999}
#addr-label{font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
#addr-text{font-size:14px;font-weight:600;color:#111827;margin-bottom:14px;min-height:18px;line-height:20px}
#btn{width:100%;background:#00AEEF;color:#fff;border:none;border-radius:14px;height:50px;
  font-size:16px;font-weight:700;cursor:pointer;letter-spacing:-.3px}
#hint{position:fixed;top:calc(50% - 70px);left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,.62);color:#fff;padding:7px 16px;border-radius:20px;font-size:13px;
  z-index:998;pointer-events:none;white-space:nowrap;transition:opacity .4s}
</style>
</head>
<body>
<div id="map"></div>
<div id="hint">Drag the pin or tap the map</div>
<div id="panel">
  <div id="addr-label">Selected location</div>
  <div id="addr-text">Getting address…</div>
  <button id="btn" onclick="confirmPin()">Use this location</button>
</div>
<script>
var lat=${lat},lng=${lng},addrData=null;
var map=L.map('map',{zoomControl:true}).setView([lat,lng],17);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var marker=L.marker([lat,lng],{draggable:true}).addTo(map);
function geocode(lt,ln){
  document.getElementById('addr-text').innerText='Getting address…';
  fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lt+'&lon='+ln+'&addressdetails=1&zoom=17&accept-language=en',
    {headers:{'User-Agent':'LalabaPartnerApp/1.0'}})
  .then(function(r){return r.json()})
  .then(function(d){
    addrData=d;
    var txt=(d.display_name||'').replace(', Philippines','').replace(', Metro Manila',', MM');
    document.getElementById('addr-text').innerText=txt||lt.toFixed(5)+', '+ln.toFixed(5);
  }).catch(function(){
    addrData=null;
    document.getElementById('addr-text').innerText=lt.toFixed(5)+', '+ln.toFixed(5);
  });
}
geocode(lat,lng);
marker.on('dragend',function(){var p=marker.getLatLng();geocode(p.lat,p.lng)});
map.on('click',function(e){marker.setLatLng(e.latlng);geocode(e.latlng.lat,e.latlng.lng)});
function confirmPin(){
  var p=marker.getLatLng();
  window.ReactNativeWebView.postMessage(JSON.stringify({lat:p.lat,lng:p.lng,nominatim:addrData}));
}
setTimeout(function(){var h=document.getElementById('hint');if(h)h.style.opacity='0'},2800);
</script>
</body>
</html>`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SearchIcon({ color = C.gray400 }: Readonly<{ color?: string }>) {
  return <Ionicons name="search" size={18} color={color} />;
}

function LocationIcon({ color = C.brand500 }: Readonly<{ color?: string }>) {
  return <Ionicons name="locate" size={16} color={color} />;
}

function MapPinIcon({ color = C.brand500 }: Readonly<{ color?: string }>) {
  return <Ionicons name="map-outline" size={16} color={color} />;
}

function PinMarkerIcon({ color = C.gray400, size = 16 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="location-outline" size={size} color={color} />;
}

function CheckCircleIcon({ color = C.success500, size = 16 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="checkmark-circle-outline" size={size} color={color} />;
}

function ChevronIcon({ color = C.gray400 }: Readonly<{ color?: string }>) {
  return <Ionicons name="chevron-down" size={16} color={color} />;
}

// ─── MapPickerModal ───────────────────────────────────────────────────────────

function MapPickerModal({
  visible,
  initialLat,
  initialLng,
  onConfirm,
  onClose,
}: Readonly<{
  visible:    boolean;
  initialLat: number;
  initialLng: number;
  onConfirm:  (r: { lat: number; lng: number; nominatim: NominatimResult | null }) => void;
  onClose:    () => void;
}>) {
  const html = visible ? buildMapHtml(initialLat, initialLng) : "";

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={AP.mapRoot} edges={["top", "bottom"]}>
        <View style={AP.mapHeader}>
          <TouchableOpacity onPress={onClose} style={AP.mapClose}>
            <Text style={AP.mapCloseText}>✕ Cancel</Text>
          </TouchableOpacity>
          <Text style={AP.mapTitle}>Pin your location</Text>
          <View style={{ width: 72 }} />
        </View>

        {visible && (
          <WebView
            style={{ flex: 1 }}
            source={{ html }}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={["*"]}
            mixedContentMode="always"
            onMessage={(e) => {
              try {
                const data = JSON.parse(e.nativeEvent.data);
                onConfirm({ lat: data.lat, lng: data.lng, nominatim: data.nominatim ?? null });
              } catch {
                onClose();
              }
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── PSGC List Modal ──────────────────────────────────────────────────────────

interface PsgcItem { code: string; name: string }

function PsgcListModal({
  visible,
  title,
  items,
  loading,
  onSelect,
  onClose,
}: Readonly<{
  visible:  boolean;
  title:    string;
  items:    PsgcItem[];
  loading:  boolean;
  onSelect: (item: PsgcItem) => void;
  onClose:  () => void;
}>) {
  const [search, setSearch] = useState("");
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;

  useEffect(() => {
    if (!visible) setSearch("");
  }, [visible]);

  const filtered = search.trim().length === 0
    ? items
    : items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const innerContent = (
    <>
      <View style={AP.mapHeader}>
        <TouchableOpacity onPress={onClose} style={AP.mapClose}>
          <Text style={AP.mapCloseText}>✕ Cancel</Text>
        </TouchableOpacity>
        <Text style={AP.mapTitle}>{title}</Text>
        <View style={{ width: 72 }} />
      </View>

      <View style={AP.psgcSearchWrap}>
        <View style={AP.psgcSearch}>
          <SearchIcon color={C.gray400} />
          <TextInput
            style={AP.psgcSearchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={`Search ${title.toLowerCase()}…`}
            placeholderTextColor={C.gray400}
            autoCorrect={false}
          />
        </View>
      </View>

      {loading ? (
        <View style={AP.psgcLoading}>
          <ActivityIndicator size="large" color={C.brand500} />
          <Text style={AP.psgcLoadingText}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.code}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={AP.psgcDivider} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={AP.psgcRow}
              onPress={() => onSelect(item)}
              activeOpacity={0.7}
            >
              <Text style={AP.psgcRowText}>{item.name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={AP.psgcEmpty}>No results for &quot;{search}&quot;</Text>
          }
        />
      )}
    </>
  );

  if (isTablet) {
    return (
      <Modal supportedOrientations={["portrait", "landscape"]} visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <View style={AP.psgcTabletOverlay}>
          <View style={AP.psgcTabletCard}>
            {innerContent}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={AP.mapRoot} edges={["top", "bottom"]}>
        {innerContent}
      </SafeAreaView>
    </Modal>
  );
}

// ─── PSGC Dropdown Row ────────────────────────────────────────────────────────

function PsgcDropdownRow({
  label,
  selected,
  placeholder,
  disabled,
  onPress,
}: Readonly<{
  label:       string;
  selected:    string;
  placeholder: string;
  disabled:    boolean;
  onPress:     () => void;
}>) {
  return (
    <View style={AP.psgcField}>
      <Text style={AP.detailLabel}>{label}</Text>
      <TouchableOpacity
        style={[AP.psgcDropdown, disabled && AP.psgcDropdownDisabled]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.75}
      >
        <Text
          style={[
            AP.psgcDropdownText,
            !selected && AP.psgcDropdownPlaceholder,
            disabled && AP.psgcDropdownTextDisabled,
          ]}
          numberOfLines={1}
        >
          {selected || placeholder}
        </Text>
        <ChevronIcon color={disabled ? C.gray300 : C.gray400} />
      </TouchableOpacity>
    </View>
  );
}

// ─── AddressPickerSection ─────────────────────────────────────────────────────

export interface AddressPickerProps {
  value:          StructuredAddress;
  onChange:       (addr: StructuredAddress) => void;
  requireDetails?: boolean;
  label?:          string;
  error?:          string;
  detailsCollapsible?: boolean;
  detailsLabel?: string;
  /**
   * "full"    (default) — Nominatim/GPS/pin section + PSGC mailing section
   * "map"     — Nominatim/GPS/pin only (for lat/lng business location)
   * "mailing" — PSGC dropdowns + free text only (for rider/mailing address)
   */
  variant?: "full" | "map" | "mailing";
}

type PsgcModal = "region" | "province" | "city" | "barangay" | null;

export function AddressPickerSection({
  value,
  onChange,
  requireDetails     = false,
  label,
  error,
  detailsCollapsible = false,
  detailsLabel,
  variant            = "full",
}: Readonly<AddressPickerProps>) {
  const showMapSection     = variant !== "mailing";
  const showMailingSection = variant !== "map";

  // Default labels per variant
  const mailingOrFullLabel = variant === "mailing" ? "Branch Address" : "Business Address *";
  const defaultLabel       = variant === "map"     ? "Map Location *" : mailingOrFullLabel;
  const resolvedLabel      = label ?? defaultLabel;

  // Nominatim state
  const [results,          setResults]        = useState<NominatimResult[]>([]);
  const [searching,        setSearching]      = useState(false);
  const [gpsLoading,       setGpsLoading]     = useState(false);
  const [showMap,          setShowMap]        = useState(false);
  const [pinConfirmed,     setPinConfirmed]   = useState(false);
  // Why the last lookup produced nothing. Distinct from the `error` prop,
  // which is the parent's validation message.
  const [lookupError,      setLookupError]    = useState<string | null>(null);
  const [detailsExpanded,  setDetailsExpanded] = useState(variant === "mailing" ? true : !detailsCollapsible);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PSGC state
  const [psgcModal,   setPsgcModal]   = useState<PsgcModal>(null);
  const [psgcLoading, setPsgcLoading] = useState(false);
  const [regions,     setRegions]     = useState<PsgcItem[]>([]);
  const [provinces,   setProvinces]   = useState<PsgcItem[]>([]);
  const [cities,      setCities]      = useState<PsgcItem[]>([]);
  const [barangays,   setBarangays]   = useState<PsgcItem[]>([]);

  const mapLat = value.latitude ?? 14.6760;
  const mapLng = value.longitude ?? 121.0437;

  // ── Nominatim search ──────────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    onChange({ ...value, displayName: text });
    setPinConfirmed(false);
    setLookupError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { results: found, failure } = await searchAddress(text);
      setResults(found);
      // "No matches" and "the lookup never ran" look the same on screen unless
      // the failure is named.
      setLookupError(failure ? LOOKUP_FAILURE_TEXT[failure] : null);
      setSearching(false);
    }, 450);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange]);

  // For variant="map", pass text names from Nominatim through so the parent can
  // use them for PSGC auto-fill. PSGC codes are never set here — only the text.
  const applyNominatim = useCallback((parsed: Partial<StructuredAddress>) => {
    if (variant === "map") {
      onChange({
        ...value,
        displayName:          parsed.displayName          ?? value.displayName,
        latitude:             parsed.latitude             ?? value.latitude,
        longitude:            parsed.longitude            ?? value.longitude,
        street:               parsed.street               ?? value.street,
        barangayName:         parsed.barangayName         ?? value.barangayName,
        cityMunicipalityName: parsed.cityMunicipalityName ?? value.cityMunicipalityName,
      });
    } else {
      onChange({ ...value, ...parsed });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange, variant]);

  const handleSelectResult = useCallback((r: NominatimResult) => {
    applyNominatim(parseNominatim(r));
    setResults([]);
    setPinConfirmed(true);
    Keyboard.dismiss();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyNominatim]);

  // ── GPS ───────────────────────────────────────────────────────────────────
  const handleUseLocation = useCallback(async () => {
    setGpsLoading(true);
    setLookupError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLookupError("Location permission is off. Enable it in Settings, or use Pin on map instead.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = loc.coords;
      const { result: geo, failure } = await reverseGeocode(lat, lng);
      if (geo) {
        applyNominatim(parseNominatim(geo));
      } else {
        // The coordinates are the part that matters — the service radius is
        // measured from them. Keep them, name the pin by its coordinates so
        // the confirmation pill has something to show, and say why there is
        // no street name.
        onChange({ ...value, latitude: lat, longitude: lng, displayName: formatCoords(lat, lng) });
        setLookupError(
          failure
            ? `Location captured, but ${LOOKUP_FAILURE_TEXT[failure].charAt(0).toLowerCase()}${LOOKUP_FAILURE_TEXT[failure].slice(1)}`
            : "Location captured, but we couldn't find a street address for it. Fill in the address below.",
        );
      }
      setPinConfirmed(true);
      setResults([]);
    } catch {
      setLookupError("Couldn't get a GPS fix. Try again outdoors, or use Pin on map.");
    } finally {
      setGpsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange, applyNominatim]);

  // ── Map pin ───────────────────────────────────────────────────────────────
  const handleMapConfirm = useCallback(
    async (result: { lat: number; lng: number; nominatim: NominatimResult | null }) => {
      setShowMap(false);
      setLookupError(null);
      let geo = result.nominatim;
      let failure: LookupFailure | null = null;
      if (!geo) ({ result: geo, failure } = await reverseGeocode(result.lat, result.lng));
      if (geo) {
        applyNominatim(parseNominatim(geo));
      } else {
        // Same reasoning as handleUseLocation: a hand-placed pin is the most
        // deliberate input there is, so never discard it just because the
        // reverse lookup could not name it.
        onChange({
          ...value,
          latitude:    result.lat,
          longitude:   result.lng,
          displayName: formatCoords(result.lat, result.lng),
        });
        setLookupError(
          failure
            ? `Pin saved, but ${LOOKUP_FAILURE_TEXT[failure].charAt(0).toLowerCase()}${LOOKUP_FAILURE_TEXT[failure].slice(1)}`
            : "Pin saved, but we couldn't find a street address for it. Fill in the address below.",
        );
      }
      setPinConfirmed(true);
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [value, onChange, applyNominatim]);

  // ── PSGC openers ─────────────────────────────────────────────────────────

  const openRegion = useCallback(async () => {
    setPsgcModal("region");
    if (regions.length > 0) return;
    setPsgcLoading(true);
    try {
      const data = await fetchRegions();
      setRegions(data.map((r) => ({ code: r.code, name: r.name })));
    } catch { /* leave empty */ }
    setPsgcLoading(false);
  }, [regions.length]);

  const openProvince = useCallback(async () => {
    if (!value.regionCode) return;
    setPsgcModal("province");
    if (provinces.length > 0) return;
    setPsgcLoading(true);
    try {
      const data = await fetchProvinces(value.regionCode);
      setProvinces(data.map((p) => ({ code: p.code, name: p.name })));
    } catch { /* leave empty */ }
    setPsgcLoading(false);
  }, [value.regionCode, provinces.length]);

  const openCity = useCallback(async () => {
    const parentCode = isNcr(value.regionCode) ? value.regionCode : value.provinceCode;
    if (!parentCode) return;
    setPsgcModal("city");
    if (cities.length > 0) return;
    setPsgcLoading(true);
    try {
      const data = await fetchCitiesMunicipalities(parentCode, isNcr(value.regionCode));
      setCities(data.map((c) => ({ code: c.code, name: c.name })));
    } catch { /* leave empty */ }
    setPsgcLoading(false);
  }, [value.regionCode, value.provinceCode, cities.length]);

  const openBarangay = useCallback(async () => {
    if (!value.cityMunicipalityCode) return;
    setPsgcModal("barangay");
    if (barangays.length > 0) return;
    setPsgcLoading(true);
    try {
      const data = await fetchBarangays(value.cityMunicipalityCode);
      setBarangays(data.map((b) => ({ code: b.code, name: b.name })));
    } catch { /* leave empty */ }
    setPsgcLoading(false);
  }, [value.cityMunicipalityCode, barangays.length]);

  // ── PSGC selections ───────────────────────────────────────────────────────

  const selectRegion = useCallback((item: PsgcItem) => {
    setProvinces([]); setCities([]); setBarangays([]);
    onChange({
      ...value,
      regionName: item.name, regionCode: item.code,
      // NCR has no province row to fill this in — see NCR_PROVINCE_NAME.
      provinceName: isNcr(item.code) ? NCR_PROVINCE_NAME : "", provinceCode: "",
      cityMunicipalityName: "", cityMunicipalityCode: "",
      barangayName: "", barangayCode: "",
    });
    setPsgcModal(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange]);

  const selectProvince = useCallback((item: PsgcItem) => {
    setCities([]); setBarangays([]);
    onChange({
      ...value,
      provinceName: item.name, provinceCode: item.code,
      cityMunicipalityName: "", cityMunicipalityCode: "",
      barangayName: "", barangayCode: "",
    });
    setPsgcModal(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange]);

  const selectCity = useCallback((item: PsgcItem) => {
    setBarangays([]);
    onChange({ ...value, cityMunicipalityName: item.name, cityMunicipalityCode: item.code, barangayName: "", barangayCode: "" });
    setPsgcModal(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange]);

  const selectBarangay = useCallback((item: PsgcItem) => {
    onChange({ ...value, barangayName: item.name, barangayCode: item.code });
    setPsgcModal(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange]);

  // Province row hidden for NCR (which has no provinces in PSGC)
  const showProvince = value.regionCode ? !isNcr(value.regionCode) : true;
  // City enabled once region is set (and province set for non-NCR regions)
  const cityEnabled  = value.regionCode
    ? (isNcr(value.regionCode) || !!value.provinceCode)
    : false;

  const modalTitleByCityOrBarangay   = psgcModal === "city"     ? "City / Municipality" : "Barangay";
  const modalTitleByProvinceOrBelow  = psgcModal === "province" ? "Province"            : modalTitleByCityOrBarangay;
  const modalTitle                   = psgcModal === "region"   ? "Region"              : modalTitleByProvinceOrBelow;

  const modalItemsByCityOrBarangay   = psgcModal === "city"     ? cities     : barangays;
  const modalItemsByProvinceOrBelow  = psgcModal === "province" ? provinces  : modalItemsByCityOrBarangay;
  const modalItems                   = psgcModal === "region"   ? regions    : modalItemsByProvinceOrBelow;

  const handleByCityOrBarangay       = psgcModal === "city"     ? selectCity     : selectBarangay;
  const handleByProvinceOrBelow      = psgcModal === "province" ? selectProvince : handleByCityOrBarangay;
  const handlePsgcSelect             = psgcModal === "region"   ? selectRegion   : handleByProvinceOrBelow;

  const cityDisabledPlaceholder = showProvince ? "Select province first" : "Select region first";

  return (
    <View>
      <Text style={AP.label}>{resolvedLabel}</Text>

      {/* ── Map section: Nominatim search + GPS + Pin (variant="full"|"map") ── */}
      {showMapSection && (
        <>
          <View style={[AP.searchBox, error ? AP.searchBoxError : undefined]}>
            <View style={AP.searchIconWrap}>
              <SearchIcon color={searching ? C.brand500 : C.gray400} />
            </View>
            <TextInput
              style={AP.searchInput}
              value={value.displayName}
              onChangeText={handleSearchChange}
              placeholder="Search barangay, street, city…"
              placeholderTextColor={C.gray400}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searching && <ActivityIndicator size="small" color={C.brand500} style={{ marginRight: 10 }} />}
          </View>
          {error && <Text style={AP.errorText}>{error}</Text>}
          {lookupError && <Text style={AP.noticeText}>{lookupError}</Text>}

          {results.length > 0 && (
            <View style={AP.dropdown}>
              {results.map((r, i) => {
                const a    = r.address ?? {};
                const main = a.suburb ?? a.village ?? a.neighbourhood ?? a.road ?? r.display_name.split(",")[0];
                const sub  = r.display_name.replace(main + ", ", "").replace(", Philippines", "");
                return (
                  <TouchableOpacity
                    key={r.place_id}
                    style={[AP.dropdownRow, i < results.length - 1 && AP.dropdownDivider]}
                    onPress={() => handleSelectResult(r)}
                    activeOpacity={0.7}
                  >
                    <View style={AP.dropdownPin}><PinMarkerIcon color={C.gray400} size={16} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={AP.dropdownMain} numberOfLines={1}>{main}</Text>
                      <Text style={AP.dropdownSub}  numberOfLines={1}>{sub}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={AP.actionRow}>
            <TouchableOpacity
              style={[AP.actionBtn, gpsLoading && { opacity: 0.6 }]}
              onPress={handleUseLocation}
              disabled={gpsLoading}
              activeOpacity={0.8}
            >
              {gpsLoading
                ? <ActivityIndicator size="small" color={C.brand500} />
                : <LocationIcon />}
              <Text style={AP.actionBtnText}>My location</Text>
            </TouchableOpacity>

            <TouchableOpacity style={AP.actionBtn} onPress={() => setShowMap(true)} activeOpacity={0.8}>
              <MapPinIcon />
              <Text style={AP.actionBtnText}>Pin on map</Text>
            </TouchableOpacity>
          </View>

          {/* Gate on the coordinates, not the name. A pin whose reverse lookup
              failed has no displayName, and gating on that made a successful
              capture render as nothing at all. */}
          {pinConfirmed && value.latitude != null && value.longitude != null && (
            <View style={AP.confirmedPill}>
              <CheckCircleIcon color={C.success500} size={16} />
              <Text style={AP.confirmedText} numberOfLines={2}>
                {value.displayName.trim().length > 0
                  ? value.displayName.replace(", Philippines", "")
                  : formatCoords(value.latitude, value.longitude)}
              </Text>
              <TouchableOpacity onPress={() => {
                onChange(EMPTY_ADDRESS);
                setPinConfirmed(false);
                setLookupError(null);
              }}>
                <Text style={AP.confirmedClear}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* ── Mailing section: PSGC dropdowns + free text (variant="full"|"mailing") ── */}
      {showMailingSection && (
      <View style={AP.detailsBox}>
        <TouchableOpacity
          style={AP.detailsHeader}
          onPress={() => detailsCollapsible && setDetailsExpanded((e) => !e)}
          activeOpacity={detailsCollapsible ? 0.7 : 1}
          disabled={!detailsCollapsible || variant === "mailing"}
        >
          <Text style={AP.detailsTitle}>
            {detailsLabel ?? (requireDetails ? "Address Details *" : "Address Details (optional)")}
          </Text>
          {detailsCollapsible && variant !== "mailing" && (
            <Text style={AP.detailsChevron}>{detailsExpanded ? "▲" : "▼"}</Text>
          )}
        </TouchableOpacity>

        {detailsExpanded && (
          <>
            {/* PSGC cascading dropdowns */}
            <PsgcDropdownRow
              label="Region"
              selected={value.regionName}
              placeholder="Select region"
              disabled={false}
              onPress={openRegion}
            />

            {showProvince && (
              <PsgcDropdownRow
                label="Province"
                selected={value.provinceName}
                placeholder={value.regionCode ? "Select province" : "Select region first"}
                disabled={!value.regionCode}
                onPress={openProvince}
              />
            )}

            <PsgcDropdownRow
              label="City / Municipality"
              selected={value.cityMunicipalityName}
              placeholder={cityEnabled ? "Select city / municipality" : cityDisabledPlaceholder}
              disabled={!cityEnabled}
              onPress={openCity}
            />

            <PsgcDropdownRow
              label="Barangay"
              selected={value.barangayName}
              placeholder={value.cityMunicipalityCode ? "Select barangay" : "Select city first"}
              disabled={!value.cityMunicipalityCode}
              onPress={openBarangay}
            />

            {/* Free text fields */}
            <Text style={AP.detailLabel}>House No. / Unit / Floor</Text>
            <TextInput
              style={AP.detailInput}
              value={value.unit}
              onChangeText={(t) => onChange({ ...value, unit: t })}
              placeholder="e.g. Unit 2B, 3rd Floor, House 14"
              placeholderTextColor={C.gray400}
              returnKeyType="next"
            />

            <Text style={AP.detailLabel}>Street / Road / Building</Text>
            <TextInput
              style={AP.detailInput}
              value={value.street}
              onChangeText={(t) => onChange({ ...value, street: t })}
              placeholder="e.g. 123 Sampaguita St, Torres Bldg"
              placeholderTextColor={C.gray400}
              returnKeyType="next"
            />

            <Text style={AP.detailLabel}>ZIP / Postal Code</Text>
            <TextInput
              style={AP.detailInput}
              value={value.zipCode}
              onChangeText={(t) => onChange({ ...value, zipCode: t })}
              placeholder="e.g. 1100"
              placeholderTextColor={C.gray400}
              keyboardType="numeric"
              maxLength={4}
              returnKeyType="next"
            />

          </>
        )}
      </View>
      )}

      {/* PSGC list modal */}
      <PsgcListModal
        visible={psgcModal !== null}
        title={modalTitle}
        items={modalItems}
        loading={psgcLoading}
        onSelect={handlePsgcSelect}
        onClose={() => setPsgcModal(null)}
      />

      {/* Map modal */}
      {showMapSection && (
        <MapPickerModal
          visible={showMap}
          initialLat={mapLat}
          initialLng={mapLng}
          onConfirm={handleMapConfirm}
          onClose={() => setShowMap(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const AP = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: C.gray700,
    marginBottom: 6,
    letterSpacing: 0.2,
  },

  // Search box
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C.gray200,
    borderRadius: RADIUS.md,
    backgroundColor: C.gray50,
    paddingHorizontal: SP._12,
    marginBottom: SP._4,
  },
  searchBoxError: {
    borderColor: C.error500,
    backgroundColor: "#fff5f5",
  },
  searchIconWrap: { marginRight: SP._8 },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: C.gray900,
  },
  errorText: { fontSize: 11, color: C.error500, marginBottom: 4 },
  // A lookup outage is not the partner's mistake, so it reads as a notice
  // rather than a validation error — and always names the manual way out.
  noticeText: { fontSize: 11, color: C.warning700, marginTop: 2, marginBottom: 4, lineHeight: 15 },

  // Autocomplete dropdown
  dropdown: {
    backgroundColor: C.white,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: C.gray200,
    marginBottom: SP._8,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  dropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP._12,
    paddingVertical: SP._10,
    gap: SP._10,
  },
  dropdownDivider: { borderBottomWidth: 1, borderBottomColor: C.gray100 },
  dropdownPin:  { width: 24, alignItems: "center", justifyContent: "center" },
  dropdownMain: { fontSize: 14, fontWeight: "600", color: C.gray900 },
  dropdownSub:  { fontSize: 12, color: C.gray500, marginTop: 2 },

  // Action buttons (GPS + Map)
  actionRow: {
    flexDirection: "row",
    gap: SP._8,
    marginTop: SP._6,
    marginBottom: SP._8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP._6,
    paddingVertical: SP._10,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: C.brand300,
    backgroundColor: C.brand50,
  },
  actionBtnText: { fontSize: 13, fontWeight: "600", color: C.brand700 },

  // Confirmed pill
  confirmedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._8,
    backgroundColor: C.success100,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.success500,
    paddingHorizontal: SP._12,
    paddingVertical: SP._10,
    marginBottom: SP._8,
  },
  confirmedText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: C.success700,
    lineHeight: 18,
  },
  confirmedClear: { fontSize: 15, color: C.gray400, fontWeight: "700", paddingHorizontal: SP._4 },

  // Detail fields card
  detailsBox: {
    backgroundColor: C.gray50,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.gray200,
    padding: SP._14,
    marginBottom: SP._8,
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SP._8,
  },
  detailsTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: C.gray500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailsChevron: {
    fontSize: 10,
    color: C.gray400,
    fontWeight: "700",
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: C.gray600,
    marginBottom: 4,
    marginTop: SP._10,
  },
  detailInput: {
    borderWidth: 1.5,
    borderColor: C.gray200,
    borderRadius: RADIUS.md,
    paddingHorizontal: SP._12,
    paddingVertical: SP._10,
    fontSize: 14,
    color: C.gray900,
    backgroundColor: C.white,
  },

  // PSGC dropdown rows
  psgcField: {
    marginTop: SP._10,
  },
  psgcDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: C.gray200,
    borderRadius: RADIUS.md,
    paddingHorizontal: SP._12,
    paddingVertical: SP._12,
    backgroundColor: C.white,
  },
  psgcDropdownDisabled: {
    backgroundColor: C.gray100,
    borderColor: C.gray200,
  },
  psgcDropdownText: {
    flex: 1,
    fontSize: 14,
    color: C.gray900,
    marginRight: SP._8,
  },
  psgcDropdownPlaceholder: {
    color: C.gray400,
  },
  psgcDropdownTextDisabled: {
    color: C.gray300,
  },

  // PSGC list modal — tablet centered dialog
  psgcTabletOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  psgcTabletCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "75%",
    backgroundColor: C.white,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
  },

  // PSGC list modal
  psgcSearchWrap: {
    padding: SP._14,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  psgcSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._8,
    borderWidth: 1.5,
    borderColor: C.gray200,
    borderRadius: RADIUS.md,
    paddingHorizontal: SP._12,
    backgroundColor: C.gray50,
  },
  psgcSearchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: C.gray900,
  },
  psgcRow: {
    paddingHorizontal: SP._16,
    paddingVertical: SP._14,
  },
  psgcRowText: {
    fontSize: 15,
    color: C.gray900,
  },
  psgcDivider: {
    height: 1,
    backgroundColor: C.gray100,
    marginHorizontal: SP._16,
  },
  psgcLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SP._12,
  },
  psgcLoadingText: {
    fontSize: 14,
    color: C.gray500,
  },
  psgcEmpty: {
    padding: SP._24,
    textAlign: "center",
    fontSize: 14,
    color: C.gray400,
  },

  // Map modal
  mapRoot: { flex: 1, backgroundColor: C.white },
  mapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP._16,
    paddingVertical: SP._12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
    backgroundColor: C.white,
  },
  mapClose: { paddingVertical: SP._6, paddingHorizontal: SP._8 },
  mapCloseText: { fontSize: 14, fontWeight: "600", color: C.gray500 },
  mapTitle: { fontSize: 15, fontWeight: "700", color: C.gray900 },
});

// Step 1 — role picker (Merchant / Washer) + Google sign-up. Extracted from app/register.tsx.
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { C } from "../../theme/tokens";
import type { GqlSignupRole } from "../../services/graphql/auth";
import { I } from "./shared";
import { S } from "./styles";

export function RoleStep({
  roles, rolesError, onRetry, selectedRoleId, setSelectedRoleId, roleError,
  isGoogleFlow, googleLoading, onGoogleSignIn,
}: Readonly<{
  roles: GqlSignupRole[];
  rolesError: "network" | "rate-limited" | null;
  onRetry: () => void;
  selectedRoleId: string;
  setSelectedRoleId: (id: string) => void;
  roleError?: string;
  isGoogleFlow: boolean;
  googleLoading: boolean;
  onGoogleSignIn: () => void;
}>) {
  return (
        <View>
          <Text style={S.stepTitle}>I am a…</Text>
          <Text style={S.stepSub}>Choose the role that best describes you.</Text>

          {rolesError ? (
            <View style={{ alignItems: "center", paddingVertical: 28, gap: 10 }}>
              <Text style={{ fontSize: 13, color: C.gray500, textAlign: "center", lineHeight: 19 }}>
                {rolesError === "rate-limited"
                  ? <>Too many attempts.{"\n"}Please wait a moment and try again.</>
                  : <>Could not load roles.{"\n"}Check your connection and try again.</>}
              </Text>
              <TouchableOpacity onPress={() => onRetry()} style={{ paddingVertical: 8, paddingHorizontal: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.brand500 }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : roles.length === 0 ? (
            <View className="flex-row gap-3 mt-1">
              {[0, 1].map((i) => (
                <View key={i} className="flex-1 rounded-2xl h-[130px] bg-[#F1F5F9]" />
              ))}
            </View>
          ) : (
            <View className="flex-row gap-3 mt-1">
              {/* Phase 1: only merchant + washer visible; admin/customer/staff hidden */}
              {roles.filter((r) => r.roleId === "merchant" || r.roleId === "washer").map((r) => {
                const isMerchant = r.roleId === "merchant";
                const isComingSoon = false;
                const selected = selectedRoleId === r._id;
                const selectedIconColor = selected ? C.white : C.brand500;
                const iconColor = isComingSoon ? C.gray400 : selectedIconColor;
                const description = isMerchant
                  ? "Owns and manages a laundry shop"
                  : "Offers laundry service from home";

                const cardBorderClass = isComingSoon ? "border-[#CBD5E1] bg-[#F8FAFC]" : "border-[#CBD5E1] bg-white";
                const cardClassName = selected ? "border-[#00AEEF] bg-[#E6F7FE]" : cardBorderClass;
                const iconBgClass = isComingSoon ? "bg-[#E2E8F0]" : "bg-[#F1F5F9]";
                const iconWrapClass = selected ? "bg-[#00AEEF]" : iconBgClass;
                const roleNameColorClass = isComingSoon ? "text-[#94A3B8]" : "text-[#334155]";
                const roleNameClass = selected ? "text-[#0066A0]" : roleNameColorClass;
                const descColorClass = isComingSoon ? "text-[#94A3B8]" : "text-[#64748B]";
                const descClass = selected ? "text-[#0088CC]" : descColorClass;
                return (
                  <TouchableOpacity
                    key={r._id}
                    className={`flex-1 rounded-2xl border-[1.5px] ${isComingSoon ? "pt-8 pb-5" : "py-5"} px-3 items-center gap-2 relative ${cardClassName}`}
                    onPress={() => !isComingSoon && setSelectedRoleId(r._id)}
                    activeOpacity={isComingSoon ? 1 : 0.8}
                    disabled={isComingSoon}
                  >
                    {isComingSoon && (
                      <View className="absolute top-[8px] left-[8px] bg-[#E2E8F0] rounded-full px-2 py-[3px]">
                        <Text className="text-[9px] font-semibold text-[#64748B] tracking-[0.3px]">Coming Soon</Text>
                      </View>
                    )}
                    <View className={`w-[48px] h-[48px] rounded-full items-center justify-center ${iconWrapClass}`}>
                      <Ionicons
                        name={isMerchant ? "storefront-outline" : "shirt-outline"}
                        size={24}
                        color={iconColor}
                      />
                    </View>
                    <Text className={`text-[13px] font-bold text-center ${roleNameClass}`}>
                      {r.roleName.toUpperCase()}
                    </Text>
                    <Text className={`text-[11px] text-center leading-[15px] ${descClass}`}>
                      {description}
                    </Text>
                    {selected && (
                      <View className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#00AEEF] items-center justify-center">
                        <I.Check s={10} c={C.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {roleError ? <Text style={S.fieldError}>{roleError}</Text> : null}

          {/* Google sign-up option — only for email flow (not already in Google flow) */}
          {!isGoogleFlow && (
            <>
              <Text style={S.socialHint}>Or use an existing Google or Apple account</Text>
              <View style={S.dividerRow}>
                <View style={S.dividerLine} />
                <Text style={S.dividerText}>or</Text>
                <View style={S.dividerLine} />
              </View>
              <TouchableOpacity
                style={[S.googleBtn, (googleLoading || !selectedRoleId) && { opacity: 0.5 }]}
                onPress={onGoogleSignIn}
                disabled={googleLoading || !selectedRoleId}
                activeOpacity={0.8}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </Svg>
                <Text style={S.googleBtnText}>Continue with Google</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[S.appleBtn, { opacity: 0.5 }]}
                disabled
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                activeOpacity={0.8}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24">
                  <Path
                    fill={C.gray900}
                    d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
                  />
                </Svg>
                <Text style={S.appleBtnText}>Continue with Apple</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
  );
}

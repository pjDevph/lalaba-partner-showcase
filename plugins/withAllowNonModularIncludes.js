const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// react-native-firebase's ObjC headers import React Native headers
// (RCTConvert.h, RCTBridgeModule.h, ...) directly, which aren't modular.
// Under ios.useFrameworks: "static", Xcode treats that as a hard error
// (-Werror,-Wnon-modular-include-in-framework-module). Disable it per pod
// target in post_install, since ios/Podfile is regenerated on every prebuild.
const withAllowNonModularIncludes = (config) => {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      const contents = fs.readFileSync(podfilePath, "utf-8");

      if (!contents.includes("CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES")) {
        const patched = contents.replace(
          "post_install do |installer|\n",
          "post_install do |installer|\n" +
            "    installer.pods_project.targets.each do |target|\n" +
            "      target.build_configurations.each do |build_config|\n" +
            "        build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'\n" +
            "      end\n" +
            "    end\n"
        );
        fs.writeFileSync(podfilePath, patched);
      }

      return config;
    },
  ]);
};

module.exports = withAllowNonModularIncludes;

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Firebase packages ship both CJS and ESM builds. Force every import to resolve
// to the same CJS file to avoid a split component registry ("Component auth has
// not been registered yet").
const firebaseRoot = path.resolve(projectRoot, "node_modules");

config.resolver.sourceExts = [...config.resolver.sourceExts, "mjs", "cjs"];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@firebase/app") {
    return { filePath: path.join(firebaseRoot, "@firebase/app/dist/index.cjs.js"), type: "sourceFile" };
  }
  if (moduleName === "@firebase/auth") {
    return { filePath: path.join(firebaseRoot, "@firebase/auth/dist/rn/index.js"), type: "sourceFile" };
  }
  if (moduleName === "@firebase/firestore") {
    return { filePath: path.join(firebaseRoot, "@firebase/firestore/dist/index.rn.js"), type: "sourceFile" };
  }
  if (moduleName === "@firebase/component") {
    return { filePath: path.join(firebaseRoot, "@firebase/component/dist/index.cjs.js"), type: "sourceFile" };
  }
  if (moduleName === "@firebase/util") {
    return { filePath: path.join(firebaseRoot, "@firebase/util/dist/index.cjs.js"), type: "sourceFile" };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./src/styles/global.css" });

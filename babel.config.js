module.exports = function (api) {
  // In Jest (NODE_ENV=test), skip nativewind's jsxImportSource and babel preset
  // so that JSX does not get transformed to _ReactNativeCSSInterop.createInteropElement
  // which is out-of-scope inside jest.mock() factories.
  const isTest = api.env("test");
  api.cache(!isTest);

  if (isTest) {
    return {
      presets: [
        // Plain expo preset without nativewind jsxImportSource
        "babel-preset-expo",
      ],
    };
  }

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};

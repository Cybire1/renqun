module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Keep class static blocks compatible with packages that ship modern syntax.
    plugins: ['@babel/plugin-transform-class-static-block'],
  };
};

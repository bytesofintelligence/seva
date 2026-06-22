const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.projectRoot = __dirname;
config.resolver.extraNodeModules = {
  '@': path.resolve(__dirname, 'src'),
};

module.exports = config;

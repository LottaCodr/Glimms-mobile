// https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// backend/* are separate server projects living in the same repository. Keep
// Metro from crawling and watching them (and their node_modules). Anchored to
// this directory so that packages which merely contain a "backend" folder
// are unaffected.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const backend = new RegExp(`^${escapeRegExp(path.join(__dirname, 'backend'))}[\\\\/].*`);
const existing = config.resolver.blockList;
config.resolver.blockList = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), backend];

module.exports = config;

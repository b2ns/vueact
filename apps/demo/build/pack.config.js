import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  jsxLoader,
  cssLoader,
  styleLoader,
  copyPlugin,
  injectJSXFactoryPlugin,
} from '@vueact/pack';

const __dirname = dirname(fileURLToPath(import.meta.url));
const r = (p = './') => resolve(__dirname, '..', p);

export default {
  root: r(),
  entry: './src/main.js',
  output: './dist',
  resolve: {
    alias: {
      '#': './src',
    },
  },
  loaders: [
    {
      test: /\.css$/,
      use: [styleLoader, cssLoader],
    },
    {
      test: /\.js$/,
      exclude: [/node_modules/],
      use: [],
    },
    {
      test: /\.jsx$/,
      exclude: [/node_modules/],
      use: [jsxLoader],
    },
  ],
  plugins: [
    [copyPlugin, { from: r('./index.html'), to: r('./dist/index.html') }],
    injectJSXFactoryPlugin,
  ],
};

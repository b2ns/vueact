import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  jsLoader,
  jsxLoader,
  cssLoader,
  styleLoader,
  copyPlugin,
} from '@vueact/pack';

const __dirname = dirname(fileURLToPath(import.meta.url));
const r = (p = './') => resolve(__dirname, '..', p);

export default {
  root: r(),
  entry: './src/main.js',
  output: './dist',
  resolve: {
    alias: {
      '@': './src',
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
      use: [jsLoader],
    },
    {
      test: /\.jsx$/,
      exclude: [/node_modules/],
      use: [jsxLoader],
    },
  ],
  plugins: [
    [copyPlugin, { from: r('./index.html'), to: r('./dist/index.html') }],
  ],
};

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import jsLoader from './loaders/jsLoader.js';
import jsxLoader from './loaders/jsxLoader.js';
import cssLoader from './loaders/cssLoader.js';
import styleLoader from './loaders/styleLoader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const r = (p = './') => resolve(__dirname, '..', p);

export default {
  root: r(),
  entry: './demo/main.js',
  output: './dist',
  resolve: {
    alias: {
      '@': './demo',
      vueact: './src',
    },
  },
  loaders: [
    {
      test: /\.css$/,
      use: [
        styleLoader,
        cssLoader
      ],
    },
    {
      test: /\.js$/,
      exclude: [new RegExp(`${r('src')}`)],
      use: [jsLoader],
    },
    {
      test: /\.jsx$/,
      exclude: [new RegExp(`${r('src')}`)],
      use: [jsxLoader],
    },
  ],
  plugins: [],
};

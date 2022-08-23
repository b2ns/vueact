import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const r = (p = './') => resolve(__dirname, p);

export default {
  root: r(),
  entry: 'src/main.js',
  output: 'dist',
  resolve: {
    alias: {
      '@/': './src/',
    },
  },
  loaders: [
    {
      test: /\.css$/,
      use: ['css-loader'],
    },
    {
      test: /\.jsx$/,
      exclude: /node_modules/,
      use: ['jsx-loader'],
    },
  ],
  plugins: [
    [
      'html-plugin',
      {
        template: r('./index.html'),
        define: {
          title: 'vueact-demo',
        },
      },
    ],
    'inject-jsx-factory-plugin',
  ],
};

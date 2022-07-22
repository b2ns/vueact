import jsLoader from './loaders/jsLoader.js';
import jsxLoader from './loaders/jsxLoader.js';

export default {
  // mode: 'development',
  entry: './demo/main.js',
  output: './dist',
  resolve: {
    // extensions: ['js', 'jsx', 'css'],
    alias: {
      '@': './demo',
      vueact: './src',
    },
  },
  loaders: [
    {
      test: /\.css$/,
      use: [
        // styleLoader,
        // [cssLoader, {minify: true}]
      ],
    },
    {
      test: /\.js$/,
      use: [jsLoader],
    },
    {
      test: /\.jsx$/,
      use: [jsxLoader],
    },
  ],
  plugins: [],
};

import HtmlWebpackPlugin from 'html-webpack-plugin';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// recriando __dirname e __filename no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commonConfig = {
  mode: 'development',
  output: {
    path: resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    globalObject: 'this',
  },
  target: 'electron-renderer',
  module: {
    rules: [
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      { test: /\.ttf$/, type: 'asset/resource' }
    ],
  },
  devtool: 'source-map'
};

const mainAppConfig = {
  ...commonConfig,
  entry: {
    main: './src/renderer/index.js',
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html',
      chunks: ['main'],
      meta: {
        'Content-Security-Policy': { 
          'http-equiv': 'Content-Security-Policy', 
          'content': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:; img-src 'self' data:;"
        },
      },
    }),
    new MonacoWebpackPlugin({
      languages: ['javascript', 'typescript', 'html', 'css', 'json', 'markdown', 'shell', 'python', 'php', 'sql', 'yaml'],
    }),
  ],
};

const welcomeConfig = {
  ...commonConfig,
  entry: {
    welcome: './src/renderer/welcome.js'
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/welcome.html',
      filename: 'welcome.html',
      chunks: ['welcome']
    })
  ]
};

export default [mainAppConfig, welcomeConfig];

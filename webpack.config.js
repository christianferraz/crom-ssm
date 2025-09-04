const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './src/renderer/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    // Adicionado para corrigir o erro 'global is not defined'
    globalObject: 'this',
  },
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.ttf$/,
        type: 'asset/resource'
      }
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      // Adicionado para injetar a Política de Segurança de Conteúdo (CSP)
      meta: {
        'Content-Security-Policy': { 
          'http-equiv': 'Content-Security-Policy', 
          'content': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:;"
        },
      },
    }),
    new MonacoWebpackPlugin({
      languages: ['javascript', 'typescript', 'html', 'css', 'json', 'markdown', 'shell', 'python', 'php', 'sql', 'yaml'],
    }),
  ],
  devtool: 'source-map'
};
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'; // 使用 Vite 官方的 React 插件
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'), // 确保路径别名正确指向 src 文件夹
      // 移除版本号的别名配置，保留指向实际路径的配置
    },
  },
  build: {
    target: 'esnext', // 保持 esnext 以确保使用最新的 JavaScript 特性
    outDir: 'build', // 输出目录，确保与项目结构一致
  },
  server: {
    port: 3000, // 设置开发服务器端口
    open: true, // 启动时自动打开浏览器
  },
});

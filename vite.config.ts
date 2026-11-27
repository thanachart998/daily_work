import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// หน้าเว็บอยู่ใน client/ และ build ไปที่ dist/ ให้ Express เสิร์ฟ
export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  test: {
    root: __dirname,
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    poolOptions: {
      threads: { execArgv: ['--experimental-sqlite', '--no-warnings'] },
      forks: { execArgv: ['--experimental-sqlite', '--no-warnings'] },
    },
  },
} as never);

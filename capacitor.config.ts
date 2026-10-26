import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 配置。
 *
 * 两个关键点，都是踩过坑才写下来的：
 *
 * 1. `androidScheme: 'https'`
 *    App 内页面 origin 为 https://localhost，属于安全上下文，
 *    crypto.randomUUID()（指令幂等键）才能正常用；换成 http 会静默失效。
 *
 * 2. `allowMixedContent` + `cleartext`
 *    后端是内网 http，页面是 https，属于混合内容，默认会被 WebView 拦掉。
 *    这两个开关一起放开，手机才能真的连上局域网后端。
 */
const config: CapacitorConfig = {
  appId: 'com.eado.carcontrol',
  appName: '逸动PLUS管家',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;

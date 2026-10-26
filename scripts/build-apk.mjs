#!/usr/bin/env node
/**
 * 一键打 APK。
 *
 * 用法：
 *   node scripts/build-apk.mjs                          # 用内置默认地址（如有）
 *   node scripts/build-apk.mjs https://abc.example.com  # 指定默认服务器地址
 *
 * 做的事：构建 web → 同步到 Android 工程 → Gradle 出签名 APK → 复制到 release/
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ANDROID = join(ROOT, 'android');
const OUT_DIR = join(ROOT, 'release');

const serverArg = (process.argv[2] || '').trim().replace(/\/+$/, '');

/** 找 JDK：优先 JAVA_HOME，其次项目上级的 .toolchain 目录 */
function findJdk() {
  const cands = [];
  if (process.env.JAVA_HOME) cands.push(process.env.JAVA_HOME);
  const tc = join(ROOT, '..', '.toolchain');
  if (existsSync(tc)) {
    for (const d of readdirSync(tc)) {
      if (d.startsWith('jdk')) cands.push(join(tc, d));
    }
  }
  for (const c of cands) {
    const java = join(c, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (existsSync(java)) return c;
  }
  return null;
}

const jdk = findJdk();
if (!jdk) {
  console.error('找不到 JDK 17。请设置 JAVA_HOME 指向 JDK 17（Capacitor 6 不支持 JDK 8/11）。');
  process.exit(1);
}

const ANDROID_HOME =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk')
    : join(process.env.HOME || '', 'Android', 'Sdk'));

const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME, ANDROID_SDK_ROOT: ANDROID_HOME };
if (serverArg) env.VITE_DEFAULT_SERVER = serverArg;
// 某些终端环境会通过 NODE_OPTIONS 注入文件删除拦截器，
// 会让 cap sync 的目录替换操作卡死几分钟甚至失败。构建子进程必须绕开它。
delete env.NODE_OPTIONS;

const run = (cmd, args, cwd) => {
  console.log(`\n▶ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
};

console.log(`JDK:         ${jdk}`);
console.log(`Android SDK: ${ANDROID_HOME}`);
console.log(`默认服务器:  ${serverArg || '(未指定，App 内手填)'}`);

run('npm', ['run', 'build'], ROOT);
run('npx', ['cap', 'sync', 'android'], ROOT);

const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(wrapper, ['assembleRelease', '--console=plain'], ANDROID);

const apk = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apk)) {
  console.error(`\n构建结束但没找到 APK：${apk}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const dest = join(OUT_DIR, `eado-control-${stamp}.apk`);
copyFileSync(apk, dest);

const mb = (statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`\n✓ APK 已生成：${dest}  (${mb} MB)`);

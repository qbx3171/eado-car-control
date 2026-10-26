/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 打包时注入的默认后端地址，例：https://xxx.trycloudflare.com */
  readonly VITE_DEFAULT_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

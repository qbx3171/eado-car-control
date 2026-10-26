# 逸动PLUS 车辆管家（eado-control）

车主自己的车辆管家：车况监控、行程报告、告警提醒、**12 项远程控车**（锁车/解锁/后备箱/远程启动/熄火/空调/开关窗/通风/鸣笛/寻车）、**360° 环视远程拍照**，Web 与移动端同源。

> 当前版本运行在**本地模拟网关**上，不连接任何车厂服务器。接入真车的方式见下文「三条路」。

## 快速开始

```bash
npm install

# 终端 1：后端（默认 8787 端口，数据落在 data/eado.db）
npm run dev:api

# 终端 2：前端（默认 5173 端口，API 已配置代理）
npm run dev:web
```

打开 http://localhost:5173

- 演示账号：`13800138000`，验证码：`123456`（演示环境固定码，生产必须接真实短信）
- 生产构建：`npm run build`，构建产物由后端直接托管，访问 http://localhost:8787 即可

### 上手 30 秒

1. 登录后进入「车辆」页，看到车辆俯视图与实时车况。
2. 点「我的」→ 模拟控制台 → 把车速拉到 60 km/h 并应用。
3. 回「车辆」页点「解锁」→ 确认 → 观察 `车辆行驶中，该操作已禁止` 的拦截提示。
4. 把车速归零再解锁，观察指令从「正在下发 → 等待车辆响应 → 已执行」的完整回执链路。
5. 切到「全景」页 → 点「远程拍照」→ 等待约 2 秒 → 四路鱼眼画面拼合成环视鸟瞰图；把车速拉高再拍，会被安全规则拦下。

## 360° 环视远程拍照

真车的 360 环视是四个鱼眼摄像头同时曝光，车端拼接成鸟瞰图。本项目按同样的产品形态实现：

- **四路相机**：前/右/后/左鱼眼，共用一个世界坐标系（看到的是同一个停车场，只是朝向不同）
- **环视鸟瞰**：四帧按梯形裁切拼合，中心叠实时车辆俯视图（车门/车窗状态同步可见）
- **单通道大图**：任一路可放大查看、保存 PNG；图像内嵌时间戳与通道号（事后取证必需）
- **历史相册**：滚动保留最近 12 次，可回看
- **安全约束与控车一致**：车辆离线不拍、车速 > 15 km/h 不拍、全程审计日志

> 模拟网关下的画面是程序合成的（桶形畸变、暗角、噪点、时间戳刻录俱全，见
> `server/gateway/camera-sim.js` 与零依赖 PNG 编码器 `server/lib/png.js`）。
> 接入真车时，`ChanganOemGateway` 只需实现 `captureSnapshot(vin)` 返回四帧图片字节，
> 存储、相册、鸟瞰拼合、前端展示全部原样复用。

**开源调研结论**：GitHub 上 "surround view / 360 camera vehicle" 方向没有高星（500+）项目——
检索到的最高星仓库只有 2 星。车载环视的行业通用做法（鱼眼去畸变 → 地面投影 → 鸟瞰拼接）
没有可直接借鉴的开源实现，本项目采用「服务端出四帧原图 + 客户端 CSS 梯形拼合」的轻量方案，
把真拼接留给了车端/接入层。

## Android APK

`release/逸动PLUS管家-1.0.apk`（约 3 MB，minSdk 22 → Android 5.0+ 可装，已签名可直接安装）。

### 怎么连上后端

APK 打开即用，靠的是内置默认服务器地址 + 可改配置两层机制：

| 场景 | 怎么用 |
|---|---|
| **公网隧道**（当前默认） | 电脑上运行 `node server/index.js` + cloudflared 隧道，手机任意网络可用。打包时地址已通过 `VITE_DEFAULT_SERVER` 注入，打开即连 |
| **局域网直连** | 电脑和手机连同一个 WiFi，登录页点服务器地址 → 填 `电脑IP:8787` → 点「连接」测试通过即可 |

> **隧道地址是临时的**：quick tunnel 每次重启 cloudflared 都会换地址。地址失效时，在 App 登录页点服务器那行字重新填即可，不用重装 APK。要固定地址需要自己的域名 + Cloudflare 账号（named tunnel），属于部署期工作。

### 自己重新打包

```bash
# 需要 JDK 17 + Android SDK（本项目 .toolchain/ 下已有一份 JDK）
node scripts/build-apk.mjs [默认服务器地址]
# 产物输出到 release/eado-control-YYYYMMDD.apk
```

打包要点（都已在工程里配好，列出来是防止环境重建时踩坑）：
- **Capacitor 6**：配套 JDK 17；升级 Capacitor 7+ 需换 JDK 21
- **国内镜像**：Gradle 用腾讯镜像（`gradle-wrapper.properties`），Maven 用阿里云镜像（`android/build.gradle`），否则构建会卡在依赖下载
- **明文 HTTP**：`network_security_config.xml` + `android:usesCleartextTraffic` 必须保留，否则 App 连不上 http 后端；正式上 https 后应关闭
- **签名**：`android/app/eado-release.keystore` **不进仓库**（`.gitignore` 已排除）。自己生成：
  `keytool -genkeypair -keystore android/app/eado-release.keystore -alias eado -keyalg RSA -keysize 2048 -validity 10000`
  密码可用环境变量 `EADO_STORE_PASSWORD` / `EADO_KEY_PASSWORD` 覆盖；没有证书文件时 release 自动走未签名构建。
  **升级安装必须用同一个 keystore**，换了就装不上，只能卸载重装

### 实测记录（Android 14 模拟器）

启动 → 登录页（服务器地址绿点自动预填）→ 输入验证码登录 → 主界面车况完整渲染 → 点「解锁」→ 二次确认弹窗（含安全警告）→ 确认执行 → 徽章变「已解锁」、车门线条变化、电瓶电压等实时数据持续刷新。截图在 `shots/apk/`。

## 三条路：这个项目怎么接到真车上

| 路线 | 能做什么 | 门槛 | 状态 |
|---|---|---|---|
| **Mock 网关**（当前默认） | 全功能演示与开发 | 零 | ✅ 可用 |
| **OBD-II 只读网关** | 读转速/车速/水温/油量/电压等真实车况 | 一个 ELM327 WiFi 适配器（几十到一百多块） | ✅ 代码就绪，配 `OBD_HOST`/`OBD_PORT` 环境变量即可 |
| **车厂授权（长安智能汽车开放平台）** | 真正的锁车/解锁/远程启动/空调 | 企业资质 + 应用审核 + 车型授权（逸动Plus 是否在清单内**需向平台核实**） | 🔲 预留 `ChanganOemGateway` 位置 |

**明确不做的事**：不逆向车厂 App、不绕过车辆防盗与鉴权机制、不改装 CAN 总线上路。
这三条任何一条踩了，项目都没有第二期（法律风险 + 车厂封号 + 接口随时变更）。

### 接入车厂授权时怎么改

只动一个文件：`server/gateway/index.js`

```js
registerGateway(new ChanganOemGateway(oemConfig));
```

然后在车辆表把该车的 `gateway_kind` 改为 `changan-oem`。上层业务代码零改动——
指令状态机、安全拦截、审计日志、WebSocket 回执全部原样复用。

## 架构

```
apps（单仓库）
├─ server/               Node.js 后端（零框架依赖，仅 ws）
│  ├─ gateway/           ★ 网关抽象层：ICarGateway 契约 + mock/obd 实现
│  │  └─ camera-sim.js   环视相机合成器（四路鱼眼共用一个世界坐标系）
│  ├─ lib/png.js         零依赖 PNG 编码器（模拟拍照产出真实图片字节）
│  ├─ services/          车辆 / 指令 / 环视拍照 / 审计
│  ├─ bus.js             WebSocket 广播
│  ├─ auth.js            自签 JWT（HS256，node:crypto）
│  └─ db.js              node:sqlite（Node 22 内置，无原生编译）
├─ src/                  React 18 + Vite 前端
│  ├─ CarTopView.tsx     车辆俯视图（门/窗/后备箱状态可视化）
│  └─ pages/             车辆 / 全景 / 行程 / 提醒 / 我的
├─ shared/contract.js    指令契约（前后端唯一来源）
└─ scripts/              截图验证脚本（开发用）
```

### 指令状态机（以车端回执为唯一成功判据）

```
PENDING → SENT → ACKED ✅
              ├→ FAILED  ❌（车端拒绝或执行失败）
              ├→ EXPIRED ⏱（30 秒无回执，自动作废）
              └→ REJECTED 🚫（安全规则拦截，未下发到车）
```

安全规则（`server/services/commands.js` 中的 `SAFETY_RULES` 表）：

- 车速 > 0 → 禁止解锁、开后备箱
- 油量 < 5% → 禁止远程启动
- 车辆离线 → 禁止一切指令
- 同一幂等键只执行一次（连点不重复下发）
- 客户端时间偏移 > 60 秒 → 拒绝（防重放）
- 全量审计日志（谁、何时、从哪个 IP、下了什么指令、车回了什么）

## 常用操作

```bash
npm run build        # 生产构建前端
npm start            # 启动后端（托管构建产物）
curl localhost:8787/healthz   # 健康检查
```

## 已知限制

- 车况快照存 SQLite，保留策略较简单；规模化后应换 TimescaleDB/InfluxDB
- 地图轨迹是自绘 SVG（无 SDK 依赖），接入高德 API 后可显示真实路网
- Mock 网关含 4% 随机失败率（`server/config.json`），用于验证失败态 UI，演示时可在配置中改为 0
- iOS 打包需开发者账号；移动端当前为响应式 PWA，Capacitor 壳可按需加

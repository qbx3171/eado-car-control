/**
 * Mock 网关：一台"假车"，但行为按真车的时序与约束来。
 *
 * 存在的意义：没有它，产品在拿到车厂授权前一行代码都跑不起来。
 * 有了它，指令状态机、超时、离线降级、安全拦截这些真正难的部分今天就能验证。
 */

import { COMMAND_TYPES } from '../../shared/contract.js';
import { renderFrame, CHANNELS } from './camera-sim.js';
import { encodePng } from '../lib/png.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CAPABILITIES = {
  readable: ['fuel', 'range', 'odometer', 'tirePressure', 'doorState', 'climate', 'dtc', 'speed', 'battery'],
  controllable: [...COMMAND_TYPES],
  hasServerAck: true,
};

function initialState(vin) {
  const now = Date.now();
  return {
    vin,
    gateway: 'mock',
    online: true,
    capturedAt: now,
    // 车辆动态
    speed: 0,
    gear: 'P',
    ignition: false,
    engineOn: false,
    // 车身
    locked: true,
    doors: { fl: false, fr: false, rl: false, rr: false, trunk: false },
    windows: { fl: 0, fr: 25, rl: 0, rr: 0 },
    // 舒适
    climate: { on: false, targetTemp: 24, cabinTemp: 31.5 },
    // 能耗
    fuel: { level: 62.4, rangeKm: 486 },
    battery: { voltage: 12.42 },
    odometer: 38420.5,
    tirePressure: { fl: 2.35, fr: 2.34, rl: 2.31, rr: 2.30 },
    // 位置
    position: { lat: 22.5431, lng: 114.0579, heading: 0, address: '深圳市南山区科技园' },
    outsideTemp: 29,
    dtc: [],
    today: { distanceKm: 12.4, trips: 2, minutes: 38 },
    flashedAt: null,
    hornAt: null,
  };
}

export class MockGateway {
  kind = 'mock';

  #cfg;
  #states = new Map();
  #subs = new Map();
  #timer;

  constructor(cfg) {
    this.#cfg = cfg;
    this.#timer = setInterval(() => this.#tick(), cfg.tickMs);
    this.#timer.unref?.();
  }

  capabilities() {
    return CAPABILITIES;
  }

  getState(vin) {
    return this.#state(vin);
  }

  subscribe(vin, cb) {
    if (!this.#subs.has(vin)) this.#subs.set(vin, new Set());
    this.#subs.get(vin).add(cb);
    return () => this.#subs.get(vin)?.delete(cb);
  }

  async sendCommand(vin, cmd) {
    const st = this.#state(vin);

    if (!st.online) return { ok: false, code: 'VEHICLE_OFFLINE', reason: '车辆未连接' };
    if (!CAPABILITIES.controllable.includes(cmd.type)) {
      return { ok: false, code: 'NOT_SUPPORTED', reason: '当前网关不支持该指令' };
    }

    // 真实的执行延迟：车端要经过 T-Box → 网关 → 车身控制器，不可能瞬时
    await sleep(rnd(this.#cfg.ackDelayMinMs, this.#cfg.ackDelayMaxMs));

    if (Math.random() < this.#cfg.failRate) {
      return { ok: false, code: 'VEHICLE_ERROR', reason: '车身控制器未响应，请重试' };
    }

    this.#apply(st, cmd);
    this.#emit(vin);
    return { ok: true, code: 'OK', state: st };
  }

  /**
   * 360 环视远程拍照。
   * 真车上是 T-Box 唤醒摄像头 → 四路鱼眼同时曝光 → JPEG 回传云端；
   * 这里按同样的时序模拟，并在车速过高时拒绝拍摄（与真车的安全策略一致）。
   */
  async captureSnapshot(vin) {
    const st = this.#state(vin);
    if (!st.online) return { ok: false, code: 'VEHICLE_OFFLINE', reason: '车辆未连接' };
    if ((st.speed ?? 0) > 15) {
      return { ok: false, code: 'SNAPSHOT_SPEED', reason: '车速过高，为安全起见已暂停环视拍摄' };
    }

    // 摄像头唤醒 + 图传耗时：让前端能表现出"正在拍摄"的真实节奏
    await sleep(rnd(700, 1300));

    const capturedAt = Date.now();
    const frames = [];
    for (let i = 0; i < CHANNELS.length; i++) {
      const f = renderFrame(CHANNELS[i].ch, capturedAt, capturedAt % 100000 + i);
      frames.push({ ch: CHANNELS[i].ch, width: f.width, height: f.height, png: encodePng(f.width, f.height, f.rgba) });
      // 渲染是同步计算，逐帧让出事件循环，别把状态推送堵住
      await new Promise((r) => setImmediate(r));
    }

    return { ok: true, code: 'OK', capturedAt, frames };
  }

  /** 演示用：把车"开起来"，验证行驶中的安全拦截是否生效 */
  setSimulation(vin, patch) {
    const st = this.#state(vin);
    if (patch.speed !== undefined) {
      st.speed = clamp(Math.round(patch.speed), 0, 180);
      st.gear = st.speed > 0 ? 'D' : 'P';
      st.engineOn = st.speed > 0 ? true : st.engineOn;
      if (st.speed > 0) st.locked = true;
    }
    if (patch.fuelLevel !== undefined) {
      st.fuel.level = clamp(patch.fuelLevel, 0, 100);
      st.fuel.rangeKm = Math.round(st.fuel.level * 7.8);
    }
    if (patch.online !== undefined) st.online = !!patch.online;
    if (patch.cabinTemp !== undefined) st.climate.cabinTemp = patch.cabinTemp;
    st.capturedAt = Date.now();
    this.#emit(vin);
    return st;
  }

  // ── 内部 ─────────────────────────────────────────────────────────
  #state(vin) {
    if (!this.#states.has(vin)) this.#states.set(vin, initialState(vin));
    return this.#states.get(vin);
  }

  #emit(vin) {
    const st = this.#state(vin);
    st.capturedAt = Date.now();
    for (const cb of this.#subs.get(vin) ?? []) {
      try { cb(st); } catch { /* 单个订阅者异常不影响其他订阅 */ }
    }
  }

  #apply(st, cmd) {
    switch (cmd.type) {
      case 'LOCK':
        st.locked = true;
        break;
      case 'UNLOCK':
        st.locked = false;
        break;
      case 'TRUNK_OPEN':
        st.doors.trunk = true;
        break;
      case 'ENGINE_START':
        st.engineOn = true;
        st.ignition = true;
        st.battery.voltage = 14.05;
        break;
      case 'ENGINE_STOP':
        st.engineOn = false;
        st.ignition = false;
        st.speed = 0;
        st.gear = 'P';
        st.battery.voltage = 12.4;
        break;
      case 'AC_ON':
        st.climate.on = true;
        if (cmd.params?.targetTemp) {
          st.climate.targetTemp = clamp(Number(cmd.params.targetTemp), 16, 30);
        }
        break;
      case 'AC_OFF':
        st.climate.on = false;
        break;
      case 'WINDOW_OPEN':
        // 真车是四个电机分别动作，这里统一置 100% 代表全开
        st.windows = { fl: 100, fr: 100, rl: 100, rr: 100 };
        break;
      case 'WINDOW_VENT':
        st.windows = { fl: 30, fr: 30, rl: 30, rr: 30 };
        break;
      case 'WINDOW_CLOSE':
        st.windows = { fl: 0, fr: 0, rl: 0, rr: 0 };
        break;
      case 'HORN':
        st.hornAt = Date.now();
        break;
      case 'FIND_CAR':
        st.flashedAt = Date.now();
        st.hornAt = Date.now();
        break;
      default:
        break;
    }
  }

  #tick() {
    for (const [vin, st] of this.#states) {
      if (!st.online) continue;

      // 电瓶电压：发动机运行时是发电机的 13.9~14.2V，熄火是电瓶的 12.2~12.5V
      const target = st.engineOn ? 14.05 : 12.38;
      st.battery.voltage = +(st.battery.voltage + (target - st.battery.voltage) * 0.25 + rnd(-0.03, 0.03)).toFixed(2);

      // 舱温向目标收敛：开空调压向设定温度，否则回升到环境温度
      const cabinTarget = st.climate.on ? st.climate.targetTemp : st.outsideTemp;
      const rate = st.climate.on ? 0.55 : 0.18;
      st.climate.cabinTemp = +(st.climate.cabinTemp + (cabinTarget - st.climate.cabinTemp) * rate).toFixed(1);

      if (st.speed > 0) {
        const km = (st.speed * this.#cfg.tickMs) / 3600000;
        st.odometer = +(st.odometer + km).toFixed(2);
        st.fuel.level = +clamp(st.fuel.level - km * 0.078, 0, 100).toFixed(2);
        st.fuel.rangeKm = Math.round(st.fuel.level * 7.8);
        st.position.lat = +(st.position.lat + 0.00018).toFixed(6);
        st.position.lng = +(st.position.lng + 0.00012).toFixed(6);
        st.position.heading = 68;
      } else {
        st.position.heading = 0;
      }

      this.#emit(vin);
    }
  }
}

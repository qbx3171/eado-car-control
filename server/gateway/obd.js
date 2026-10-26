/**
 * OBD-II 网关（只读）。
 *
 * 真实可用：买一个 ELM327 转 WiFi/以太网的适配器（几十到一百多块），
 * 插到车上 OBD 口，把 host 改成适配器的 IP（常见 192.168.0.10:35000），
 * 这个网关就能读出真实车况。完全基于公开的 OBD-II 标准 PID，不碰任何车厂私有协议。
 *
 * 能力边界：只能读，不能控。
 * 想控车，必须走车厂授权（见 README 的「三条路」），别在这上面浪费时间。
 */

import net from 'node:net';

// OBD-II 标准模式 01 的公开 PID，ISO 15031-5 定义，非逆向
const PIDS = {
  rpm: { cmd: '010C', parse: (b) => ((b[0] << 8) + b[1]) / 4 },
  speed: { cmd: '010D', parse: (b) => b[0] },
  coolantTemp: { cmd: '0105', parse: (b) => b[0] - 40 },
  fuelLevel: { cmd: '012F', parse: (b) => (b[0] * 100) / 255 },
  batteryVoltage: { cmd: '0142', parse: (b) => ((b[0] << 8) + b[1]) / 1000 },
  intakeTemp: { cmd: '010F', parse: (b) => b[0] - 40 },
  engineLoad: { cmd: '0104', parse: (b) => (b[0] * 100) / 255 },
};

export class ObdGateway {
  kind = 'obd';
  host = process.env.OBD_HOST || '192.168.0.10';
  port = Number(process.env.OBD_PORT || 35000);

  #socket = null;
  #buffer = '';
  #pending = null;
  #last = null;
  #pollTimer = null;
  #vin = null;

  capabilities() {
    return {
      readable: ['fuel', 'range', 'odometer', 'tirePressure', 'doorState', 'climate', 'dtc'],
      controllable: [], // 只读网关，控件全部不可用——这一点必须让前端知道
      hasServerAck: false,
    };
  }

  getState(vin) {
    this.#vin = vin;
    if (!this.#socket) this.#connect();
    return this.#last ?? this.#offlineState(vin);
  }

  async sendCommand() {
    return { ok: false, code: 'NOT_SUPPORTED', reason: 'OBD 网关仅支持读取，无法下发控制指令' };
  }

  subscribe(vin, cb) {
    this.#vin = vin;
    if (!this.#socket) this.#connect();
    this.#subs = this.#subs ?? new Map();
    if (!this.#subs.has(vin)) this.#subs.set(vin, new Set());
    this.#subs.get(vin).add(cb);
    return () => this.#subs.get(vin)?.delete(cb);
  }

  #subs = new Map();

  #offlineState(vin) {
    return {
      vin, gateway: 'obd', online: false, capturedAt: Date.now(),
      speed: null, gear: null, ignition: null, engineOn: null,
      locked: null, doors: null, windows: null, climate: null,
      fuel: null, battery: null, odometer: null, tirePressure: null,
      position: null, outsideTemp: null, dtc: [], today: null,
    };
  }

  #connect() {
    const socket = net.createConnection({ host: this.host, port: this.port });
    socket.setTimeout(4000);
    this.#socket = socket;

    socket.on('connect', async () => {
      try {
        await this.#send('ATZ');   // 复位
        await this.#send('ATE0');  // 关回声，减少解析噪音
        await this.#send('ATL0');  // 关换行
        await this.#send('ATS0');  // 关空格
        this.#startPolling();
      } catch {
        this.#drop();
      }
    });

    socket.on('data', (chunk) => {
      this.#buffer += chunk.toString('ascii');
      // ELM327 以 '>' 作为一条命令的结束标记
      const idx = this.#buffer.indexOf('>');
      if (idx >= 0 && this.#pending) {
        const resp = this.#buffer.slice(0, idx);
        this.#buffer = this.#buffer.slice(idx + 1);
        const { resolve } = this.#pending;
        this.#pending = null;
        resolve(resp);
      }
    });

    socket.on('timeout', () => this.#drop());
    socket.on('error', () => this.#drop());
    socket.on('close', () => { this.#socket = null; });
  }

  #drop() {
    clearInterval(this.#pollTimer);
    this.#pollTimer = null;
    this.#socket?.destroy();
    this.#socket = null;
  }

  #send(cmd) {
    return new Promise((resolve, reject) => {
      if (!this.#socket) return reject(new Error('OBD 未连接'));
      this.#pending = { resolve, reject };
      this.#socket.write(cmd + '\r');
      setTimeout(() => {
        if (this.#pending) { this.#pending = null; reject(new Error(`OBD 命令超时: ${cmd}`)); }
      }, 3000);
    });
  }

  #startPolling() {
    clearInterval(this.#pollTimer);
    this.#pollTimer = setInterval(() => this.#pollOnce(), 2000);
    this.#pollTimer.unref?.();
  }

  async #pollOnce() {
    try {
      const out = {};
      for (const [key, { cmd, parse }] of Object.entries(PIDS)) {
        const raw = await this.#send(cmd);
        const bytes = this.#parseHex(raw);
        if (bytes && bytes.length >= 2) out[key] = parse(bytes);
      }

      const base = this.#last ?? this.#offlineState(this.#vin);
      this.#last = {
        ...base,
        online: true,
        capturedAt: Date.now(),
        speed: out.speed ?? null,
        odometer: null,
        fuel: out.fuelLevel != null ? { level: +out.fuelLevel.toFixed(1), rangeKm: null } : null,
        battery: out.batteryVoltage != null ? { voltage: out.batteryVoltage } : null,
        climate: out.coolantTemp != null
          ? { on: null, targetTemp: null, cabinTemp: null, coolantTemp: out.coolantTemp }
          : null,
      };

      for (const cb of this.#subs.get(this.#vin) ?? []) {
        try { cb(this.#last); } catch { /* ignore */ }
      }
    } catch {
      this.#drop();
      this.#last = this.#offlineState(this.#vin);
    }
  }

  /** 从 "410C1AF8" 这类响应里剥掉模式+PID 头，取数据字节 */
  #parseHex(raw) {
    const line = raw.split(/[\r\n]/).map((s) => s.trim()).find((s) => /^41[0-9A-F]{2}/i.test(s));
    if (!line) return null;
    const hex = line.slice(4);
    const bytes = [];
    for (let i = 0; i + 1 < hex.length; i += 2) {
      const b = parseInt(hex.slice(i, i + 2), 16);
      if (Number.isNaN(b)) break;
      bytes.push(b);
    }
    return bytes;
  }
}

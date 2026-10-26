/**
 * 网关抽象层 —— 整个项目最值钱的一个文件。
 *
 * 上层（CommandService / VehicleService）只认这个契约，不认车厂。
 * 换数据源 = 新增一个实现并注册，业务代码零改动。
 *
 * 契约（JSDoc 即文档，前端类型见 shared/types.ts）：
 *   kind: 'mock' | 'obd' | 'changan-oem'
 *   capabilities(vin): CarCapabilities
 *   getState(vin): VehicleState
 *   sendCommand(vin, cmd): Promise<CommandResult>   // resolve 即代表车端有结论
 *   subscribe(vin, cb): () => void
 */

import { MockGateway } from './mock.js';
import { ObdGateway } from './obd.js';

const registry = new Map();

export function registerGateway(gateway) {
  registry.set(gateway.kind, gateway);
}

export function getGateway(kind) {
  const gw = registry.get(kind);
  if (!gw) throw new Error(`未注册的车辆网关: ${kind}`);
  return gw;
}

/** 启动时注册所有可用网关。长安 OEM 网关需授权后在此处补一行即可。 */
export function initGateways(config) {
  registerGateway(new MockGateway(config.mock));
  registerGateway(new ObdGateway());
  // registerGateway(new ChanganOemGateway(oemConfig));  // 需企业资质 + 车型授权
  return [...registry.keys()];
}

export const listGateways = () => [...registry.keys()];

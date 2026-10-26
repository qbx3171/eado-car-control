/**
 * 前后端共用的指令契约。
 * 这里是唯一来源：加一个指令只改这个文件 + 网关实现，前端按钮自动出现。
 */

export const COMMAND_DEFS = {
  LOCK: {
    label: '锁车', short: '锁车', icon: 'lock', group: 'security',
    risk: 'normal', confirm: '确认锁闭全车车门？',
  },
  UNLOCK: {
    label: '解锁', short: '解锁', icon: 'unlock', group: 'security',
    risk: 'high', confirm: '确认解锁车门？请确认车辆周边安全。',
  },
  TRUNK_OPEN: {
    label: '开后备箱', short: '后备箱', icon: 'trunk', group: 'security',
    risk: 'high', confirm: '确认开启后备箱？',
  },
  ENGINE_START: {
    label: '远程启动', short: '启动', icon: 'engine', group: 'comfort',
    risk: 'high', confirm: '确认远程启动发动机？请确保车辆处于空旷通风处。',
  },
  ENGINE_STOP: {
    label: '熄火', short: '熄火', icon: 'engine-off', group: 'comfort',
    risk: 'normal', confirm: '确认远程熄火？',
  },
  AC_ON: {
    label: '开启空调', short: '空调', icon: 'ac', group: 'comfort',
    // 支持 params.targetTemp（16~30），不传则沿用上次设定温度
    risk: 'normal', confirm: '确认开启空调？',
  },
  AC_OFF: {
    label: '关闭空调', short: '关空调', icon: 'ac-off', group: 'comfort',
    risk: 'normal', confirm: '确认关闭空调？',
  },
  WINDOW_OPEN: {
    label: '打开车窗', short: '开窗', icon: 'window-open', group: 'comfort',
    risk: 'normal', confirm: '确认打开全部车窗？请确认车辆周边安全。',
  },
  WINDOW_VENT: {
    label: '车窗通风', short: '通风', icon: 'vent', group: 'comfort',
    risk: 'normal', confirm: '确认将全部车窗开至 30% 通风？',
  },
  WINDOW_CLOSE: {
    label: '关闭车窗', short: '关窗', icon: 'window', group: 'comfort',
    risk: 'normal', confirm: '确认关闭全部车窗？',
  },
  HORN: {
    label: '鸣笛', short: '鸣笛', icon: 'horn', group: 'locate',
    risk: 'normal', confirm: '车辆将鸣笛一声，请确认周边无扰民顾虑。',
  },
  FIND_CAR: {
    label: '闪灯寻车', short: '寻车', icon: 'find', group: 'locate',
    risk: 'normal', confirm: '车辆将闪灯并鸣笛 3 次。',
  },
};

export const COMMAND_TYPES = Object.keys(COMMAND_DEFS);

export const COMMAND_STATUS = {
  PENDING: '正在下发',
  SENT: '等待车辆响应',
  ACKED: '已执行',
  FAILED: '执行失败',
  EXPIRED: '车辆未响应',
  REJECTED: '已被拦截',
};

/** 安全拦截的原因码 → 中文提示，前端直接展示 */
export const REJECT_REASONS = {
  VEHICLE_OFFLINE: '车辆离线，无法下发指令',
  VEHICLE_MOVING: '车辆行驶中，该操作已禁止',
  LOW_FUEL: '油量过低，无法远程启动',
  NOT_SUPPORTED: '当前车型不支持该功能',
  UNAUTHORIZED: '无权操作该车辆',
  DUPLICATE: '指令重复提交，已忽略',
  INVALID_INPUT: '指令参数不合法',
  TIMESTAMP_SKEW: '客户端时间异常，请校准后重试',
  SNAPSHOT_SPEED: '车速过高，为安全起见已暂停环视拍摄',
};

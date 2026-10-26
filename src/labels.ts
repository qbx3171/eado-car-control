import type { CommandStatus } from './types';

export const CommandStatusText: Record<CommandStatus, string> = {
  PENDING: '正在下发',
  SENT: '等待车辆响应',
  ACKED: '已执行',
  FAILED: '执行失败',
  EXPIRED: '车辆未响应',
  REJECTED: '已被拦截',
};

export function relTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86400_000)} 天前`;
}

export function timeHM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dateMd(ts: number): { day: string; month: string } {
  const d = new Date(ts);
  return { day: String(d.getDate()).padStart(2, '0'), month: `${d.getMonth() + 1}月` };
}

export function duration(min: number): string {
  if (min < 60) return `${Math.round(min)} 分钟`;
  return `${Math.floor(min / 60)} 小时 ${Math.round(min % 60)} 分`;
}

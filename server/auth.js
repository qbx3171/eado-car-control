import crypto from 'node:crypto';
import config from './config.json' with { type: 'json' };

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * 自签 JWT（HS256），零依赖。
 * 生产若要多服务共享会话，换成 jose 之类成熟库，别自己在这里加花样。
 */
export function signToken(payload, ttlSec = config.tokenTtlSec) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }));
  const sig = b64url(crypto.createHmac('sha256', config.jwtSecret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;

  const expected = b64url(crypto.createHmac('sha256', config.jwtSecret).update(`${header}.${body}`).digest());
  // 定长比较，避免时序侧信道
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(fromB64url(body).toString('utf8'));
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** 演示环境的短信验证码：固定 123456，生产必须接真实短信通道 */
export const DEMO_SMS_CODE = '123456';

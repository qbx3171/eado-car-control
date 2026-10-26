import http from 'node:http';

/**
 * 极简路由。不用 express 不是省那 200KB，是这个项目只有 20 个接口，
 * 一层薄路由比框架的中间件栈更好排查。
 */
export function createRouter() {
  const routes = [];

  const add = (method, pattern, handler) => {
    const keys = [];
    const regex = new RegExp(
      '^' + pattern.replace(/:([A-Za-z0-9_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'
    );
    routes.push({ method, regex, keys, handler });
  };

  const router = {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    patch: (p, h) => add('PATCH', p, h),
    delete: (p, h) => add('DELETE', p, h),
    async handle(req, res, ctx) {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.regex.exec(path);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        req.params = params;
        req.query = Object.fromEntries(url.searchParams);
        req.body = req.method === 'GET' ? {} : await readJson(req);
        return r.handler(req, res, ctx);
      }
      sendJson(res, 404, { error: 'NOT_FOUND', message: `没有这个接口: ${req.method} ${path}` });
    },
  };

  return router;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error('请求体过大');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

export function createServer(handler) {
  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    try {
      await handler(req, res);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error('[server]', err);
      sendJson(res, status, {
        error: err.code || 'INTERNAL_ERROR',
        message: err.expose ? err.message : '服务内部错误',
      });
    }
  });
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) qq-bridge-v2';
const BASE = 'https://passport.bilibili.com/x/passport-login/web';

function parseCookies(url) {
  const out = {};
  try {
    const parsed = new URL(url);
    for (const [key, value] of parsed.searchParams) {
      if (['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid'].includes(key)) out[key] = value;
    }
  } catch {}
  return out;
}

function parseSetCookie(headers) {
  const out = {};
  const allowed = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid'];
  let list = [];
  try {
    list = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie() : [headers?.get?.('set-cookie')].filter(Boolean);
  } catch {}
  for (const line of list) {
    const pair = String(line).split(';')[0];
    const index = pair.indexOf('=');
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (allowed.includes(key)) out[key] = value;
  }
  return out;
}

function cookieHeader(cookies) {
  return Object.entries(cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ');
}

export function createBilibili({ file, logger = null, fetchImpl = fetch } = {}) {
  let data = { loggedIn: false, cookies: {}, user: null, at: 0 };
  try {
    if (file && fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') data = { ...data, ...parsed };
    }
  } catch (error) {
    logger?.warn('bilibili.load_failed', { error: String(error?.message ?? error) });
  }

  function save() {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      logger?.warn('bilibili.save_failed', { error: String(error?.message ?? error) });
    }
  }

  async function json(url, options = {}) {
    const res = await fetchImpl(url, {
      ...options,
      headers: { 'user-agent': UA, ...(options.headers ?? {}) }
    });
    if (!res.ok) throw new Error(`bilibili http ${res.status}`);
    return res.json();
  }

  async function generate() {
    const body = await json(`${BASE}/qrcode/generate`);
    if (body.code !== 0 || !body.data?.qrcode_key) throw new Error(body.message || 'qrcode generated failed');
    const url = body.data.url;
    return {
      key: body.data.qrcode_key,
      url,
      qrImage: `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`
    };
  }

  async function poll(key) {
    const response = await fetchImpl(`${BASE}/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`, {
      headers: { 'user-agent': UA }
    });
    if (!response.ok) throw new Error(`bilibili http ${response.status}`);
    const body = await response.json();
    const code = Number(body?.data?.code ?? body.code ?? -1);
    if (code === 86101) return { status: 'waiting' };
    if (code === 86090) return { status: 'scanned' };
    if (code === 86038) return { status: 'expired' };
    if (body.code !== 0) return { status: 'failed', message: body.message || 'login failed' };
    const cookies = { ...parseCookies(body.data.url), ...parseSetCookie(response.headers) };
    if (!cookies.SESSDATA) return { status: 'failed', message: 'no SESSDATA' };
    let user = null;
    try {
      const nav = await json('https://api.bilibili.com/x/web-interface/nav', {
        headers: { cookie: cookieHeader(cookies) }
      });
      if (nav?.code === 0) user = { mid: nav.data.mid, name: nav.data.uname, avatar: nav.data.face };
    } catch {}
    data = { loggedIn: true, cookies, user, at: Date.now() };
    save();
    logger?.info('bilibili.logged_in', { mid: user?.mid ?? '', name: user?.name ?? '' });
    return { status: 'ok', user };
  }

  async function video(input) {
    const id = String(input ?? '').trim().match(/BV[0-9A-Za-z]{10}/)?.[0];
    if (!id) throw new Error('invalid bvid');
    const body = await json(`https://api.bilibili.com/x/web-interface/view?bvid=${id}`);
    if (body.code !== 0) throw new Error(body.message || 'video failed');
    const v = body.data;
    return {
      bvid: v.bvid,
      title: v.title,
      desc: v.desc,
      owner: v.owner?.name,
      duration: v.duration,
      view: v.stat?.view,
      like: v.stat?.like,
      cover: v.pic
    };
  }

  async function popular(limit = 5) {
    const ps = Math.min(20, Math.max(1, Number(limit) || 5));
    const body = await json(`https://api.bilibili.com/x/web-interface/popular?ps=${ps}`);
    if (body.code !== 0) throw new Error(body.message || 'popular failed');
    return (body.data?.list ?? []).map((v) => ({
      bvid: v.bvid,
      title: v.title,
      owner: v.owner?.name,
      view: v.stat?.view,
      cover: v.pic
    }));
  }

  async function ensureBuvid() {
    if (data.buvid) return data.buvid;
    try {
      const body = await json('https://api.bilibili.com/x/frontend/finger/spi');
      if (body.code === 0 && body.data?.b_3) {
        data.buvid = body.data.b_3;
        save();
      }
    } catch {}
    return data.buvid || '';
  }

  async function search(keyword, limit = 5) {
    const q = String(keyword ?? '').trim();
    if (!q) return [];
    const buvid = await ensureBuvid();
    const cookie = [buvid ? `buvid3=${buvid}` : '', cookieHeader(data.cookies)].filter(Boolean).join('; ');
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(q)}&page=1`;
    let body;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        body = await json(url, { headers: { referer: 'https://www.bilibili.com/', ...(cookie ? { cookie } : {}) } });
        break;
      } catch (error) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          continue;
        }
        throw error;
      }
    }
    if (body.code !== 0) throw new Error(body.message || 'search failed');
    const clean = (value) => String(value ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    return (body.data?.result ?? []).slice(0, Math.max(1, Number(limit) || 5)).map((v) => ({
      bvid: v.bvid,
      title: clean(v.title),
      owner: v.author,
      description: clean(v.description),
      tname: v.typename || v.tname || '',
      tags: clean(v.tag),
      duration: v.duration,
      pubdate: v.pubdate
    }));
  }

  function status() {
    return {
      enabled: true,
      loggedIn: Boolean(data.loggedIn && data.cookies?.SESSDATA),
      user: data.user,
      at: data.at
    };
  }

  function logout() {
    data = { loggedIn: false, cookies: {}, user: null, at: 0 };
    save();
  }

  return { generate, poll, video, popular, search, status, logout, cookieHeader: () => cookieHeader(data.cookies) };
}

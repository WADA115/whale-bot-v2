import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../runtime/atomic.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) qq-bridge-v2';
const BASE = 'https://passport.bilibili.com/x/passport-login/web';

function parseCookies(url) {
  const out = {};
  try {
    const parsed = new URL(url);
    for (const [key, value] of parsed.searchParams) {
      if (['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid'].includes(key)) out[key] = value;
    }
  } catch { /* best-effort */ }
  return out;
}

function parseSetCookie(headers) {
  const out = {};
  const allowed = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid'];
  let list = [];
  try {
    list = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie() : [headers?.get?.('set-cookie')].filter(Boolean);
  } catch { /* best-effort */ }
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
      atomicWriteFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
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
    } catch (error) {
      logger?.warn('bilibili.nav_failed', { error: String(error?.message ?? error) });
    }
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
    } catch (error) {
      logger?.warn('bilibili.buvid_failed', { error: String(error?.message ?? error) });
    }
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

  async function apiJson(url, options = {}) {
    const headers = {
      referer: 'https://www.bilibili.com/',
      ...(data.cookies?.SESSDATA ? { cookie: cookieHeader(data.cookies) } : {}),
      ...(options.headers ?? {})
    };
    return json(url, { ...options, headers });
  }

  function bvidOf(value) {
    return String(value ?? '').match(/BV[0-9A-Za-z]{10}/)?.[0] || '';
  }

  async function content(input) {
    const bvid = bvidOf(input);
    if (!bvid) throw new Error('invalid bvid');
    const view = await apiJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
    if (view.code !== 0) throw new Error(view.message || 'video failed');
    const v = view.data;
    const cid = v.pages?.[0]?.cid;
    let text = '';
    let source = 'description';
    if (cid) {
      try {
        const player = await apiJson(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`);
        const subs = player?.data?.subtitle?.subtitles ?? [];
        const sub = subs.find((item) => /zh|ai-zh/i.test(String(item.lan || ''))) || subs[0];
        if (sub?.subtitle_url) {
          const url = sub.subtitle_url.startsWith('//') ? `https:${sub.subtitle_url}` : sub.subtitle_url;
          const body = await apiJson(url);
          const lines = (body?.body ?? []).map((line) => String(line.content ?? '').trim()).filter(Boolean);
          if (lines.length) {
            text = lines.join('\n');
            source = 'subtitle';
          }
        }
      } catch { /* best-effort */ }
    }
    if (!text) text = String(v.desc ?? '').trim();
    const description = String(v.desc ?? '').trim();
    const titleTerms = String(v.title ?? '').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').map((x) => x.trim()).filter((x) => x.length >= 2);
    const related = !text || titleTerms.length === 0 || titleTerms.some((term) => text.includes(term));
    if (!text || !related) {
      text = description;
      source = 'description';
    }
    return {
      bvid,
      title: v.title,
      owner: v.owner?.name,
      duration: v.duration,
      desc: v.desc,
      text,
      source,
      url: `https://www.bilibili.com/video/${bvid}`
    };
  }

  async function comments(input, limit = 10) {
    const bvid = bvidOf(input);
    if (!bvid) throw new Error('invalid bvid');
    const view = await apiJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
    if (view.code !== 0) throw new Error(view.message || 'video failed');
    const aid = view.data?.aid;
    if (!aid) throw new Error('video aid missing');
    const ps = Math.min(20, Math.max(1, Number(limit) || 10));
    const body = await apiJson(`https://api.bilibili.com/x/v2/reply?type=1&oid=${aid}&pn=1&ps=${ps}&sort=2`);
    if (body.code !== 0) throw new Error(body.message || 'comments failed');
    return {
      bvid,
      title: view.data?.title || '',
      aid,
      list: (body.data?.replies ?? []).map((item) => ({
        rpid: String(item.rpid ?? ''),
        user: item.member?.uname || '',
        text: String(item.content?.message ?? '').trim(),
        like: item.like ?? 0,
        time: item.ctime ?? 0,
        replies: item.rcount ?? 0
      })).filter((item) => item.rpid && item.text)
    };
  }

  async function replyComment(input, message) {
    const bvid = bvidOf(typeof input === 'string' ? input : input?.bvid);
    const text = String(message ?? '').trim();
    if (!bvid) throw new Error('invalid bvid');
    if (!text) throw new Error('empty message');
    const csrf = data.cookies?.bili_jct;
    if (!csrf) throw new Error('not logged in');
    const view = await apiJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
    if (view.code !== 0) throw new Error(view.message || 'video failed');
    const oid = view.data?.aid;
    if (!oid) throw new Error('video aid missing');
    const target = String(typeof input === 'object' ? (input?.rpid ?? input?.root ?? '') : '').trim();
    const params = new URLSearchParams({ oid: String(oid), type: '1', message: text, csrf });
    if (target) {
      params.set('root', target);
      params.set('parent', target);
    }
    const body = await apiJson('https://api.bilibili.com/x/v2/reply/add', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if (body.code !== 0) throw new Error(body.message || 'reply failed');
    return { ok: true, rpid: String(body.data?.rpid ?? ''), bvid, oid };
  }
  async function dynamics() {
    const body = await apiJson('https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?type=all&page=1');
    if (body.code !== 0) throw new Error(body.message || 'dynamics failed');
    return (body.data?.items ?? []).map((item) => {
      const archive = item?.modules?.module_dynamic?.major?.archive;
      const author = item?.modules?.module_author;
      return {
        id: item?.id_str || item?.id || '',
        type: item?.type || '',
        title: archive?.title || item?.modules?.module_dynamic?.desc?.text || '',
        author: author?.name || '',
        time: author?.pub_time || '',
        url: archive?.jump_url ? `https:${archive.jump_url}` : ''
      };
    }).filter((item) => item.title);
  }

  async function favorites() {
    const mid = data.user?.mid;
    if (!mid) throw new Error('not logged in');
    const folders = await apiJson(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`);
    if (folders.code !== 0) throw new Error(folders.message || 'favorites failed');
    const list = folders.data?.list ?? [];
    const out = [];
    for (const folder of list) {
      const body = await apiJson(`https://api.bilibili.com/x/v3/fav/resource/list?media_id=${folder.id}&pn=1&ps=20&platform=web`);
      if (body.code !== 0) continue;
      for (const item of body.data?.medias ?? []) {
        out.push({
          folder: folder.title,
          bvid: item.bvid,
          title: item.title,
          owner: item.upper?.name || '',
          url: item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : ''
        });
      }
    }
    return out;
  }

  async function history() {
    const body = await apiJson('https://api.bilibili.com/x/web-interface/history/cursor?max=0&view_at=0&business=');
    if (body.code !== 0) throw new Error(body.message || 'history failed');
    return (body.data?.list ?? []).map((item) => ({
      bvid: item.history?.bvid || '',
      title: item.title || '',
      author: item.author_name || '',
      time: item.view_at || 0,
      url: item.history?.bvid ? `https://www.bilibili.com/video/${item.history.bvid}` : ''
    })).filter((item) => item.title);
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

  return { generate, poll, video, popular, search, content, comments, replyComment, dynamics, favorites, history, status, logout };
}

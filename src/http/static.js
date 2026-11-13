import fs from 'node:fs';

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.amr': 'audio/amr',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

export function sendPanelHtml(res, file, token) {
  try {
    const html = fs.readFileSync(file, 'utf8');
    const script = `<script>window.__PANEL_TOKEN__=${JSON.stringify(String(token || ''))};(function(){const f=window.fetch.bind(window);window.api=function(input,init){let raw='';try{raw=typeof input==='string'?input:(input&&input.url)||String(input);}catch { /* best-effort */ }try{const u=new URL(raw,location.href);if(u.origin===location.origin&&u.pathname.startsWith('/api/')){const headers=new Headers((init&&init.headers)||{});headers.set('x-panel-token',window.__PANEL_TOKEN__);init=Object.assign({},init,{headers});}}catch { /* best-effort */ }return f(input,init);};window.fetch=window.api;})();</script>`;
    const body = html.includes('</head>') ? html.replace('</head>', `${script}</head>`) : script + html;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    json(res, 404, { error: 'not found' });
  }
}
export { personaFromText, personaPrompt, personaChatPrompt } from './persona.js';

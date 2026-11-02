import { EventEmitter } from 'node:events';

function textOf(message) {
  if (!Array.isArray(message)) return String(message ?? '');
  return message
    .filter((seg) => seg?.type === 'text')
    .map((seg) => String(seg?.data?.text ?? ''))
    .join(' ')
    .trim();
}

function atList(message, selfId) {
  if (!Array.isArray(message)) return [];
  return message
    .filter((seg) => seg?.type === 'at')
    .map((seg) => String(seg?.data?.qq ?? ''))
    .filter(Boolean);
}

export class OneBotGateway extends EventEmitter {
  constructor({ httpUrl, wsUrl, accessToken = '', wsAccessToken = '', reconnectMs = 3000, logger = null }) {
    super();
    this.httpUrl = String(httpUrl).replace(/\/+$/, '');
    this.wsUrl = String(wsUrl);
    this.accessToken = String(accessToken ?? '');
    this.wsAccessToken = String(wsAccessToken ?? '');
    this.reconnectMs = Math.max(500, Number(reconnectMs) || 3000);
    this.log = logger;
    this.ws = null;
    this.selfId = '';
    this.closed = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  async call(action, params = {}, { timeoutMs = 15000 } = {}) {
    const res = await fetch(`${this.httpUrl}/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {})
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) throw new Error(`${action} http ${res.status}`);
    const data = await res.json();
    if (data?.status === 'failed' || data?.retcode < 0) {
      throw new Error(`${action} failed: ${data?.message ?? data?.wording ?? data?.retcode}`);
    }
    return data?.data ?? data;
  }

  async getLoginInfo() {
    const data = await this.call('get_login_info');
    const id = String(data?.user_id ?? '');
    if (id) this.selfId = id;
    return { id, nickname: String(data?.nickname ?? '') };
  }

  connect() {
    if (this.closed) return;
    const separator = this.wsUrl.includes('?') ? '&' : '?';
    const url = this.wsAccessToken
      ? `${this.wsUrl}${separator}access_token=${encodeURIComponent(this.wsAccessToken)}`
      : this.wsUrl;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener('open', async () => {
      this.reconnectAttempts = 0;
      this.log?.info('gateway.open', { url: this.wsUrl });
      try {
        const login = await this.getLoginInfo();
        this.emit('ready', login);
      } catch (error) {
        this.log?.warn('gateway.login_failed', { error: String(error?.message ?? error) });
        this.emit('ready', { id: this.selfId, nickname: '' });
      }
    });

    ws.addEventListener('message', (event) => {
      let payload;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (payload?.post_type !== 'message') return;
      this.emit('message', payload);
    });

    ws.addEventListener('close', () => {
      this.log?.warn('gateway.closed', {});
      this.emit('status', { connected: false });
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      this.log?.warn('gateway.socket_error', {});
      try { ws.close(); } catch {}
    });
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(30000, this.reconnectMs * Math.max(1, this.reconnectAttempts));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  normalize(payload) {
    const kind = payload.message_type === 'group' ? 'group' : 'private';
    const id = String(kind === 'group' ? payload.group_id : payload.user_id);
    const userId = String(payload.sender?.user_id ?? payload.user_id ?? '');
    const selfId = String(payload.self_id ?? this.selfId ?? '');
    const segments = Array.isArray(payload.message) ? payload.message : [];
    return {
      kind,
      id,
      key: `${kind}:${id}`,
      userId,
      selfId,
      messageId: String(payload.message_id ?? ''),
      text: textOf(payload.message),
      segments,
      images: segments.filter((seg) => seg?.type === 'image' && (seg?.data?.url || seg?.data?.file)).map((seg) => seg.data),
      voices: segments.filter((seg) => (seg?.type === 'record' || seg?.type === 'voice') && (seg?.data?.url || seg?.data?.file)).map((seg) => seg.data),
      at: atList(payload.message, selfId),
      senderName: String(payload.sender?.card || payload.sender?.nickname || userId),
      raw: payload
    };
  }

  isSelf(message) {
    return Boolean(message.selfId && message.userId === message.selfId);
  }

  async sendText(kind, id, text) {
    return this.sendMessage(kind, id, [{ type: 'text', data: { text: String(text) } }]);
  }

  async sendMessage(kind, id, segments) {
    const action = kind === 'group' ? 'send_group_msg' : 'send_private_msg';
    const message = Array.isArray(segments) ? segments : [{ type: 'text', data: { text: String(segments) } }];
    const params = kind === 'group'
      ? { group_id: id, message }
      : { user_id: id, message };
    return this.call(action, params);
  }

  async getQzoneFeeds({ pageNum = 1, count = 5, cursor = '' } = {}) {
    const params = { page_num: pageNum, count };
    if (cursor) params.cursor = cursor;
    return this.call('get_qzone_feeds', params);
  }

  async sendQzoneMsg({ content, ugcRight = 64 } = {}) {
    return this.call('send_qzone_msg', { content: String(content ?? ''), ugc_right: Number(ugcRight) || 64 });
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try { this.ws?.close(); } catch {}
  }
}

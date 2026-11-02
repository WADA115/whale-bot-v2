import crypto from 'node:crypto';
import http from 'node:http';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(text) {
  const payload = Buffer.from(String(text), 'utf8');
  const length = payload.length;
  if (length < 126) return Buffer.concat([Buffer.from([0x81, length]), payload]);
  if (length < 65536) {
    const head = Buffer.from([0x81, 126, 0, 0]);
    head.writeUInt16BE(length, 2);
    return Buffer.concat([head, payload]);
  }
  const head = Buffer.alloc(10);
  head[0] = 0x81;
  head[1] = 127;
  head.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([head, payload]);
}

function parseFrames(buffer, onText, onClose) {
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let header = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      header = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      header = 10;
    }
    if (masked) header += 4;
    if (offset + header + length > buffer.length) break;
    const mask = masked ? buffer.subarray(offset + 2 + (header - (masked ? 4 : 0)) - 0, offset + 2 + (header - (masked ? 4 : 0)) - 0) : null;
    // Mask starts after the base header (2/4/10), before payload.
    const baseHeader = header - (masked ? 4 : 0);
    const maskStart = offset + baseHeader;
    const maskKey = masked ? buffer.subarray(maskStart, maskStart + 4) : null;
    const start = offset + header;
    const payload = Buffer.from(buffer.subarray(start, start + length));
    if (masked && maskKey) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= maskKey[i % 4];
    }
    offset += header + length;
    if (opcode === 0x8) onClose?.();
    else if (opcode === 0x1) onText?.(payload.toString('utf8'));
  }
  return buffer.subarray(offset);
}

export async function startMockOneBot({ port = 0 } = {}) {
  const calls = [];
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let params = {};
      try { params = JSON.parse(body || '{}'); } catch {}
      calls.push({ action: req.url.replace(/^\//, ''), params });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/get_login_info') {
        res.end(JSON.stringify({ status: 'ok', retcode: 0, data: { user_id: 10001, nickname: '测试鱼' } }));
      } else if (req.url === '/send_private_msg' || req.url === '/send_group_msg') {
        res.end(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 1 } }));
      } else {
        res.end(JSON.stringify({ status: 'ok', retcode: 0, data: {} }));
      }
    });
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      ''
    ].join('\r\n'));
    sockets.add(socket);

    let buffer = Buffer.alloc(0);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      sockets.delete(socket);
      try { socket.end(); } catch {}
    };
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      buffer = parseFrames(buffer, (text) => {
        try {
          const payload = JSON.parse(text);
          if (payload?.type === 'ping') socket.write(Buffer.from([0x8a, 0]));
        } catch {}
      }, close);
    });
    socket.on('close', close);
    socket.on('error', close);

    socket.sendJson = (value) => {
      if (!closed) socket.write(frame(JSON.stringify(value)));
    };
    socket.sendMessage = (payload) => socket.sendJson({ post_type: 'message', ...payload });
    socket.closeSocket = close;
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  return {
    port: server.address().port,
    calls,
    sockets,
    sendMessage(payload) {
      for (const socket of sockets) socket.sendMessage?.(payload);
    },
    close() {
      for (const socket of sockets) socket.closeSocket?.();
      return new Promise((resolve) => server.close(resolve));
    }
  };
}

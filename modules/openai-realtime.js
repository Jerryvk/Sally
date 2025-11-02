import WebSocket from 'ws';

let realtimeSocket = null;
let pingInterval = null;

function safeSend(obj) {
  try {
    if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
      console.warn('Realtime socket not open; cannot send', obj && obj.type ? obj.type : 'unknown');
      return false;
    }
    realtimeSocket.send(JSON.stringify(obj));
    return true;
  } catch (e) {
    console.error('Realtime send error', e && e.message ? e.message : e);
    return false;
  }
}

export async function connectRealtime() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not set; Realtime will not connect');
    return;
  }

  if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
    console.log('Realtime socket already open');
    return;
  }

  const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';
  const headers = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    'User-Agent': 'chatystream-realtime/1.0'
  };

  realtimeSocket = new WebSocket(url, { headers });

  realtimeSocket.on('open', () => {
    console.log('✅ OpenAI Realtime connected');
    // ping every 20s to keep the connection alive
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      try {
        realtimeSocket?.send(JSON.stringify({ type: 'ping' }));
      } catch (e) {
        // ignore
      }
    }, 20000);
  });

  realtimeSocket.on('message', (msg) => {
    const data = typeof msg === 'string' ? msg : msg.toString('utf8');
    console.log('📩 [Realtime]', data);
  });

  realtimeSocket.on('close', (code, reason) => {
    const r = reason && reason.toString ? reason.toString('utf8') : reason;
    console.warn(`⚠️ Realtime connection closed (${code}, ${r})`);
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    realtimeSocket = null;
  });

  realtimeSocket.on('error', (err) => {
    console.error('Realtime socket error', err && err.message ? err.message : err);
  });

  return realtimeSocket;
}

export function sendAudio(base64Frame) {
  if (!base64Frame) return false;
  return safeSend({ type: 'input_audio_buffer.append', audio: base64Frame });
}

export function commitAudio() {
  return safeSend({ type: 'input_audio_buffer.commit' });
}

export function closeRealtime() {
  try {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (realtimeSocket) {
      try { realtimeSocket.close(); } catch (e) {}
      realtimeSocket = null;
    }
  } catch (e) {
    // ignore
  }
}

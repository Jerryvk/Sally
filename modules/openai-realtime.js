import WebSocket from 'ws';

let realtimeSocket = null;
let keepAlive = null;

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

    const sessionUpdate = {
      type: 'session.update',
      session: {
        model: 'gpt-4o-realtime-preview',
        type: 'realtime',
        output_modalities: ['audio'],
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            turn_detection: { type: 'server_vad' }
          },
          output: {
            format: { type: 'audio/pcmu' },
            voice: 'alloy'
          }
        },
        instructions:
          'Je bent een vriendelijke Nederlandse kapperassistent. Beantwoord korte vragen, help met afspraken, en praat duidelijk in het Nederlands.'
      }
    };

    // send the update after 250 ms to ensure the session exists
    setTimeout(() => {
      try {
        realtimeSocket.send(JSON.stringify(sessionUpdate));
        console.log('[SESSION] update sent');
      } catch (err) {
        console.error('⚠️ [Realtime Error] Failed to send session.update', err && err.message ? err.message : err);
      }
    }, 250);

    // Use native WebSocket ping frames to keep the connection alive
    if (keepAlive) clearInterval(keepAlive);
    keepAlive = setInterval(() => {
      if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
        try {
          realtimeSocket.ping(); // native WS ping frame
        } catch (err) {
          console.warn('⚠️ [Realtime] ping failed:', err && err.message ? err.message : err);
        }
      }
    }, 20000);
  });

  realtimeSocket.on('message', (msg) => {
    try {
      const data = JSON.parse(typeof msg === 'string' ? msg : msg.toString('utf8'));
      if (data.type === 'session.created' || data.type === 'session.updated') {
        console.log('📩 [Realtime]', data.type);
      } else if (data.type === 'response.output_audio.delta') {
        console.log('📩 [Realtime Audio Delta]');
      } else if (data.type === 'response.output_text.delta') {
        console.log('🗣️ [Realtime Transcript]', data.delta || data.text || '');
      } else if (data.type === 'error' || data.type === 'response.error' || data.error) {
        console.log('⚠️ [Realtime Error]', data.message || data.error?.message || JSON.stringify(data));
      } else {
        console.log('� [Realtime]', data.type || JSON.stringify(data).slice(0, 120));
      }
    } catch (err) {
      console.warn('⚠️ Could not parse realtime message', msg.toString());
    }
  });

  realtimeSocket.on('close', (code, reason) => {
    const r = reason && reason.toString ? reason.toString('utf8') : reason;
    console.warn(`⚠️ Realtime connection closed (${code}, ${r})`);
    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = null;
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
    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = null;
    }
    if (realtimeSocket) {
      try { realtimeSocket.close(); } catch (e) {}
      realtimeSocket = null;
    }
  } catch (e) {
    // ignore
  }
}

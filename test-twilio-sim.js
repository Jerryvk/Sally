import WebSocket from 'ws';

const url = 'ws://localhost:3002/stream-gateway';
const ws = new WebSocket(url);

ws.on('open', async () => {
  console.log('sim: connected');
  // send start
  ws.send(JSON.stringify({ event: 'start', streamSid: 'sim-1' }));

  // send 120 media frames (will trigger commit every 50 frames)
  for (let i = 1; i <= 120; i++) {
    // create a small PCM16LE buffer (160 bytes) - silence or simple pattern
    const buf = Buffer.alloc(160, i % 256);
    const payload = buf.toString('base64');
    ws.send(JSON.stringify({ event: 'media', media: { payload } }));
    await new Promise(r => setTimeout(r, 10));
  }

  // send stop
  ws.send(JSON.stringify({ event: 'stop', streamSid: 'sim-1' }));
  console.log('sim: done');
  setTimeout(() => ws.close(), 500);
});

ws.on('message', (m) => console.log('sim recv:', m.toString()));
ws.on('close', () => console.log('sim closed'));
ws.on('error', (e) => console.error('sim error', e));

// Показывает состояние вычислений из Redis.  node status.js          - один раз
//                                             node status.js --watch  - обновлять каждые 2 с
const { createClient } = require('redis');
const { K } = require('./scripts');

async function show(redis) {
  const t = await redis.sendCommand(['TIME']);
  const now = Number(t[0]) + Number(t[1]) / 1e6;
  const [size, seq, done, pendingAll, active, best, workers] = await Promise.all([
    redis.get(K.size), redis.get(K.seq), redis.get(K.done),
    redis.zCard(K.pending), redis.zCount(K.pending, now, '+inf'),
    redis.hGetAll(K.best), redis.hGetAll(K.workers),
  ]);
  const sz = Number(size || 0);
  const lines = [
    `размер блока:        ${sz || '-'}`,
    `выдано блоков:       ${seq || 0}`,
    `посчитано блоков:    ${done || 0}  (чисел: ${(Number(done || 0) * sz).toLocaleString('ru-RU')})`,
    `в работе сейчас:     ${active}`,
    `ждут (просрочены):   ${pendingAll - active}`,
    `рекорд по шагам:     ${best.n ? `n=${best.n}, шагов ${best.steps}` : '-'}`,
    'блоков по воркерам:',
    ...(Object.keys(workers).length ? Object.entries(workers).map(([w, c]) => `  ${w}: ${c}`) : ['  -']),
  ];
  console.log(lines.join('\n'));
}

(async () => {
  const redis = createClient({ url: process.env.REDIS_URL || 'redis://redis:6379' });
  redis.on('error', (e) => console.error('redis:', e.message));
  await redis.connect();
  if (process.argv.includes('--watch')) {
    for (;;) {
      console.log('\n--- ' + new Date().toLocaleTimeString('ru-RU') + ' ---');
      await show(redis);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await show(redis);
  await redis.quit();
})().catch((e) => { console.error(e); process.exit(1); });


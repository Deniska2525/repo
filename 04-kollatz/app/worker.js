// Воркер: берёт из Redis блок чисел, проверяет для каждого гипотезу Коллатца
// (чётное n -> n/2, нечётное n -> 3n+1, пока не получится 1), записывает итоги.
// Запускайте сколько угодно воркеров: блоки между ними не пересекаются.
// Всё состояние хранится в Redis, поэтому после остановки счёт продолжается с того же места.
const os = require('os');
const { createClient } = require('redis');
const { K, CLAIM, RENEW, COMPLETE, RELEASE } = require('./scripts');

const SAFE = Number.MAX_SAFE_INTEGER / 3;

function stepsBig(n, s) {
  while (n !== 1n) {
    n = n % 2n === 0n ? n / 2n : 3n * n + 1n;
    s++;
  }
  return s;
}

// Количество шагов до 1 (обычные числа; при риске выхода за 2^53 переходим на BigInt).
function collatzSteps(start) {
  let n = start;
  let s = 0;
  while (n !== 1) {
    if (n % 2 === 0) {
      n /= 2;
    } else {
      if (n > SAFE) return stepsBig(BigInt(n), s);
      n = 3 * n + 1;
    }
    s++;
  }
  return s;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runWorker({ redis, id, chunkSize, leaseSeconds, delayMs, renewEvery, shouldStop, log }) {
  await redis.set(K.size, String(chunkSize), { NX: true });   // размер блока задаётся один раз для всех
  const size = Number(await redis.get(K.size));

  const [seq, done, pending] = await Promise.all([
    redis.get(K.seq), redis.get(K.done), redis.zCard(K.pending),
  ]);
  log(`старт: размер блока ${size}, выдано блоков ${seq || 0}, посчитано ${done || 0}, в работе/ожидают ${pending}`);

  while (!(await shouldStop())) {
    try {
      const chunk = Number(await redis.eval(CLAIM, { keys: [K.pending, K.seq], arguments: [String(leaseSeconds)] }));
      const start = (chunk - 1) * size + 1;
      const end = chunk * size;

      let bestN = start;
      let bestSteps = -1;
      let interrupted = false;
      for (let n = start; n <= end; n++) {
        const s = collatzSteps(n);
        if (s > bestSteps) { bestSteps = s; bestN = n; }
        if ((n - start + 1) % renewEvery === 0 && n < end) {
          if (await shouldStop()) { interrupted = true; break; }
          await redis.eval(RENEW, { keys: [K.pending], arguments: [String(chunk), String(leaseSeconds)] });
        }
      }

      if (interrupted) {
        await redis.eval(RELEASE, { keys: [K.pending], arguments: [String(chunk)] });
        log(`блок ${chunk} возвращён в очередь (остановка)`);
        break;
      }

      const ok = await redis.eval(COMPLETE, {
        keys: [K.pending, K.done, K.best, K.workers],
        arguments: [String(chunk), String(bestN), String(bestSteps), id],
      });
      log(Number(ok) === 1
        ? `блок ${chunk}: числа ${start}..${end} готовы, максимум шагов ${bestSteps} (n=${bestN})`
        : `блок ${chunk}: уже закрыт другим воркером, пропускаю`);
    } catch (e) {
      log(`ошибка: ${e.message}`);
      await sleep(2000);
    }
    await sleep(delayMs);
  }
}

async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
  const id = `${os.hostname()}`;
  const log = (m) => console.log(`[${id}] ${m}`);

  const redis = createClient({ url: redisUrl, disableOfflineQueue: true });
  redis.on('error', (e) => console.error(`[${id}] redis: ${e.message}`));
  await redis.connect();

  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  await runWorker({
    redis, id, log,
    chunkSize: Number(process.env.CHUNK_SIZE || 10000),
    leaseSeconds: Number(process.env.LEASE_SECONDS || 30),
    delayMs: Number(process.env.DELAY_MS || 500),
    renewEvery: Number(process.env.RENEW_EVERY || 5000),
    shouldStop: async () => stopping,
  });
  log('остановлен');
  await redis.quit();
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { runWorker, collatzSteps };


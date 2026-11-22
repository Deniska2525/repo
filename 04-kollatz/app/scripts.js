// Ключи Redis и Lua-скрипты. Каждый скрипт выполняется в Redis атомарно,
// поэтому несколько воркеров не могут получить один и тот же блок чисел.
//
// Схема состояния:
//   kollatz:chunk_size   - размер блока (общий для всех воркеров)
//   kollatz:chunk_seq    - счётчик выданных блоков (блок c = числа (c-1)*size+1 .. c*size)
//   kollatz:pending      - ZSET: блоки "в работе", значение = время окончания аренды
//   kollatz:done_chunks  - сколько блоков полностью посчитано
//   kollatz:best         - HASH: число с наибольшим количеством шагов (n, steps)
//   kollatz:workers      - HASH: воркер -> сколько блоков он посчитал
const K = {
  size: 'kollatz:chunk_size',
  seq: 'kollatz:chunk_seq',
  pending: 'kollatz:pending',
  done: 'kollatz:done_chunks',
  best: 'kollatz:best',
  workers: 'kollatz:workers',
};

// Взять блок: сначала просроченный (воркер упал или остановлен), иначе новый.
// KEYS: pending, seq   ARGV: срок аренды в секундах
const CLAIM = `
local t = redis.call('TIME')
local now = tonumber(t[1]) + tonumber(t[2]) / 1000000
local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now, 'LIMIT', 0, 1)
local chunk
if #expired > 0 then
  chunk = expired[1]
else
  chunk = tostring(redis.call('INCR', KEYS[2]))
end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[1]), chunk)
return chunk
`;

// Продлить аренду блока (если блок ещё "в работе").
// KEYS: pending   ARGV: блок, срок аренды
const RENEW = `
local t = redis.call('TIME')
local now = tonumber(t[1]) + tonumber(t[2]) / 1000000
return redis.call('ZADD', KEYS[1], 'XX', 'CH', now + tonumber(ARGV[2]), ARGV[1])
`;

// Блок посчитан: убрать из "в работе", обновить итоги. Если блок уже закрыл
// другой воркер (аренда истекла), ничего не делаем - так нет двойного учёта.
// KEYS: pending, done, best, workers   ARGV: блок, лучшее n, его шаги, имя воркера
const COMPLETE = `
if redis.call('ZREM', KEYS[1], ARGV[1]) == 0 then
  return 0
end
redis.call('INCR', KEYS[2])
local curSteps = redis.call('HGET', KEYS[3], 'steps')
local curN = redis.call('HGET', KEYS[3], 'n')
local steps = tonumber(ARGV[3])
local n = tonumber(ARGV[2])
if (not curSteps) or steps > tonumber(curSteps) or (steps == tonumber(curSteps) and n < tonumber(curN)) then
  redis.call('HSET', KEYS[3], 'n', ARGV[2], 'steps', ARGV[3])
end
redis.call('HINCRBY', KEYS[4], ARGV[4], 1)
return 1
`;

// Вернуть блок сразу (при остановке воркера), чтобы его мог взять другой.
// KEYS: pending   ARGV: блок
const RELEASE = `
return redis.call('ZADD', KEYS[1], 'XX', 'CH', 0, ARGV[1])
`;

module.exports = { K, CLAIM, RENEW, COMPLETE, RELEASE };


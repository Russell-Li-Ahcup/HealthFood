/** mulberry32：同一种子生成同样的序列，保证方案可复现。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** 按分数做 softmax 加权抽取。 */
export function weightedPick<T>(items: { item: T; score: number }[], rand: () => number, temperature = 0.25): T {
  const max = Math.max(...items.map((i) => i.score));
  const weights = items.map((i) => Math.exp((i.score - max) / temperature));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i].item;
  }
  return items[items.length - 1].item;
}

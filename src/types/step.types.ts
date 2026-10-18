export type Frame<V> = { receiver: unknown; value: V };

export type Step<V> = () => Promise<Frame<V>>;

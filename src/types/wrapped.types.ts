import type { WrappedArray, WrappedMutableArray } from "./array.types";

type WrappedIndex<T extends readonly unknown[]> = {
	readonly length: Wrapped<T["length"]>;
} & (number extends T["length"]
	? { readonly [index: number]: Wrapped<T[number]> }
	: { readonly [K in keyof T & `${number}`]: Wrapped<T[K]> });

type WrappedList<T extends readonly unknown[]> = WrappedArray<T[number], T> &
	WrappedIndex<T> &
	(T extends unknown[] ? WrappedMutableArray<T[number]> : unknown);

type NodeArgs<A extends readonly unknown[]> = {
	[K in keyof A]: A[K] | Wrapped<A[K]>;
};

type WrappedCall<A extends readonly unknown[], R> = (
	...args: NodeArgs<A>
) => Wrapped<Awaited<R>>;

type WrappedFunction<T> = T extends {
	(...args: infer A1): infer R1;
	(...args: infer A2): infer R2;
	(...args: infer A3): infer R3;
	(...args: infer A4): infer R4;
}
	? WrappedCall<A1, R1> &
			WrappedCall<A2, R2> &
			WrappedCall<A3, R3> &
			WrappedCall<A4, R4>
	: never;

export type Wrapped<T> = PromiseLike<T> &
	Pick<Promise<T>, "catch" | "finally"> &
	(T extends readonly unknown[]
		? WrappedList<T>
		: T extends (...args: any) => any
			? WrappedFunction<T>
			: { [K in keyof T & PropertyKey]: Wrapped<T[K]> });

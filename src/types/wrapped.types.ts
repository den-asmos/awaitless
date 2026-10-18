import type { WrappedArray, WrappedMutableArray } from "./array.types";

type WrappedIndex<T extends readonly any[]> = {
	readonly length: Wrapped<T["length"]>;
} & (number extends T["length"]
	? { readonly [index: number]: Wrapped<T[number]> }
	: { readonly [K in keyof T & `${number}`]: Wrapped<T[K]> });

type WrappedList<T extends readonly any[]> = WrappedArray<T[number], T> &
	WrappedIndex<T> &
	(T extends any[] ? WrappedMutableArray<T[number]> : unknown);

export type Wrapped<T> = PromiseLike<T> &
	(T extends readonly any[]
		? WrappedList<T>
		: T extends (...args: infer A) => infer R
			? (...args: A) => Wrapped<Awaited<R>>
			: { [K in keyof T & PropertyKey]: Wrapped<T[K]> });

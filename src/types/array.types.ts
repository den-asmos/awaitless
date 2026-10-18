import type { Wrapped } from "./wrapped.types";

type Callback<T, A, R> = (value: T, index: number, array: A) => R;
type Guard<T, A, S extends T> = (
	value: T,
	index: number,
	array: A,
) => value is S;

type Reducer<T, A> = {
	(
		callbackfn: (
			previousValue: T,
			currentValue: T,
			currentIndex: number,
			array: A,
		) => T,
	): Wrapped<T>;
	<U>(
		callbackfn: (
			previousValue: U,
			currentValue: T,
			currentIndex: number,
			array: A,
		) => U,
		initialValue: U,
	): Wrapped<U>;
};

type Filter<T, A> = {
	<S extends T>(predicate: Guard<T, A, S>, thisArg?: any): Wrapped<S[]>;
	(predicate: Callback<T, A, unknown>, thisArg?: any): Wrapped<T[]>;
};

type Find<T, A> = {
	<S extends T>(
		predicate: Guard<T, A, S>,
		thisArg?: any,
	): Wrapped<S | undefined>;
	(predicate: Callback<T, A, unknown>, thisArg?: any): Wrapped<T | undefined>;
};

export type WrappedArray<T, A = T[]> = {
	map: <U>(callbackfn: Callback<T, A, U>, thisArg?: any) => Wrapped<U[]>;
	flatMap: <U>(
		callback: Callback<T, A, U | readonly U[]>,
		thisArg?: any,
	) => Wrapped<U[]>;
	forEach: (callback: Callback<T, A, void>, thisArgs?: any) => Wrapped<void>;
	reduce: Reducer<T, A>;
	reduceRight: Reducer<T, A>;
	filter: Filter<T, A>;
	find: Find<T, A>;
	findLast: Find<T, A>;
	findIndex: (
		predicate: Callback<T, A, unknown>,
		thisArg?: any,
	) => Wrapped<number>;
	findLastIndex: (
		predicate: Callback<T, A, unknown>,
		thisArg?: any,
	) => Wrapped<number>;
	some: (predicate: Callback<T, A, unknown>, thisArg?: any) => Wrapped<boolean>;
	every: (
		predicate: Callback<T, A, unknown>,
		thisArg?: any,
	) => Wrapped<boolean>;
	includes: (searchElement: T, fromIndex?: number) => Wrapped<boolean>;
	indexOf: (searchElement: T, fromIndex?: number) => Wrapped<number>;
	lastIndexOf: (searchElement: T, fromIndex?: number) => Wrapped<number>;
	join: (separator?: string) => Wrapped<string>;
	slice: (start?: number, end?: number) => Wrapped<T[]>;
	at: (index: number) => Wrapped<T | undefined>;
	concat: (...items: (T | ConcatArray<T>)[]) => Wrapped<T[]>;
	flat: <D extends number = 1>(depth?: D) => Wrapped<FlatArray<T[], D>[]>;
	toSorted: (compareFn?: (a: T, b: T) => number) => Wrapped<T[]>;
	toReserved: () => Wrapped<T[]>;
	toSpliced: (
		start: number,
		deleteCount?: number,
		...items: T[]
	) => Wrapped<T[]>;
	with: (index: number, value: T) => Wrapped<T[]>;
};

export type WrappedMutableArray<T> = {
	sort: (compareFn?: (a: T, b: T) => number) => Wrapped<T[]>;
	reverse: () => Wrapped<T[]>;
	fill: (value: T, start?: number, end?: number) => Wrapped<T[]>;
	copyWithin: (target: number, start: number, end?: number) => Wrapped<T[]>;
	splice: (start: number, deleteCount?: number, ...items: T[]) => Wrapped<T[]>;
	push: (...items: T[]) => Wrapped<number>;
	pop: () => Wrapped<T | undefined>;
	unshift: (...items: T[]) => Wrapped<number>;
	shift: () => Wrapped<T | undefined>;
};

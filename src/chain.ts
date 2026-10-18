import type { Step } from "./types/step.types";
import type { Infer } from "./types/schema.types";
import type { Wrapped } from "./types/wrapped.types";

const ROOT_PATH = "<root>";

const noop = () => {};

const memoize = <T>(compute: () => Promise<T>): (() => Promise<T>) => {
	let cache: Promise<T> | undefined;

	return () => (cache ??= compute());
};

const describeKey = (key: string | symbol): string => {
	if (typeof key === "symbol") return `[${String(key)}]`;

	return /^\d+$/.test(key) ? `[${key}]` : `.${key}`;
};

const describeType = (value: unknown): string => {
	return value === null ? "null" : typeof value;
};

const rejectWrite = (path: string) => (): never => {
	throw new TypeError(`Cannot modify ${path}: chain nodes are read-only`);
};

const creteGetNode = (
	parent: Step<unknown>,
	parentPath: string,
	key: string | symbol,
): Wrapped<unknown> => {
	return createNode(
		async () => {
			const { value } = await parent();

			if (value == null) {
				throw new TypeError(
					`Cannot read ${String(key)} of ${describeType(value)} (at ${parentPath})`,
				);
			}

			return {
				receiver: value,
				value: Reflect.get(Object(value), key),
			};
		},
		parentPath + describeKey(key),
	);
};

const createCallNode = (
	callee: Step<unknown>,
	calleePath: string,
	args: unknown[],
): Wrapped<unknown> => {
	return createNode(async () => {
		const { receiver, value } = await callee();

		if (typeof value !== "function") {
			throw new TypeError(
				`Cannot call ${String(calleePath)}: expected function, got ${describeType(value)}`,
			);
		}

		return {
			receiver: undefined,
			value: await Reflect.apply(value, receiver, args),
		};
	}, `${calleePath}()`);
};

const createNode = <V>(step: Step<V>, path: string): Wrapped<V> => {
	const run = memoize(step);

	const then = (
		onFulfilled?: ((value: V) => unknown) | null,
		onRejected?: ((reason: unknown) => unknown) | null,
	) => {
		return run()
			.then(({ value }) => value)
			.then(onFulfilled, onRejected);
	};

	return new Proxy(run, {
		get: (_target, key) => {
			return key === "then" ? then : creteGetNode(run, path, key);
		},
		apply: (_target, _thisArg, args: unknown[]) => {
			return createCallNode(run, path, args);
		},
		set: rejectWrite(path),
		defineProperty: rejectWrite(path),
		deleteProperty: rejectWrite(path),
	}) as unknown as Wrapped<V>;
};

export const chain = <S>(
	request: PromiseLike<unknown>,
	_schema: S,
): Wrapped<Infer<S>> => {
	const source = Promise.resolve(request);

	source.catch(noop);

	return createNode<Infer<S>>(
		async () => ({
			receiver: undefined,
			value: (await source) as Infer<S>,
		}),
		ROOT_PATH,
	);
};

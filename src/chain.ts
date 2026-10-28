import type { Step } from "./types/step.types";
import type { Infer } from "./types/schema.types";
import type { Wrapped } from "./types/wrapped.types";

const ROOT_PATH = "<root>";

const RESERVED_SYMBOLS: ReadonlySet<symbol> = new Set<symbol>([
	...Object.getOwnPropertyNames(Symbol)
		.map((name) => (Symbol as unknown as Record<string, unknown>)[name])
		.filter((value): value is symbol => typeof value === "symbol"),
]);

const noop = () => {};

const nodes = new WeakSet<object>();

const isNode = (value: unknown): value is PromiseLike<unknown> => {
	return (
		(typeof value === "object" || typeof value === "function") &&
		value !== null &&
		nodes.has(value)
	);
};

const memoize = <T>(compute: () => Promise<T>): (() => Promise<T>) => {
	let cache: Promise<T> | undefined;

	return () => (cache ??= compute());
};

const describeKey = (key: string | symbol): string => {
	if (typeof key === "symbol") {
		return `[${String(key)}]`;
	}

	return /^\d+$/.test(key) ? `[${key}]` : `.${key}`;
};

const describeType = (value: unknown): string => {
	return value === null ? "null" : typeof value;
};

const rejectWrite = (path: string) => (): never => {
	throw new TypeError(`Cannot modify ${path}: chain nodes are read-only`);
};

const resolveArgs = async (args: unknown[]): Promise<unknown[]> => {
	if (!args.some(isNode)) {
		return args;
	}

	const boxed = await Promise.all(
		args.map((arg) => {
			return isNode(arg) ? arg.then((value) => ({ value })) : { value: arg };
		}),
	);

	return boxed.map(({ value }) => value);
};

const createGetNode = (
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
		const [{ receiver, value }, resolvedArgs] = await Promise.all([
			callee(),
			resolveArgs(args),
		]);

		if (typeof value !== "function") {
			throw new TypeError(
				`Cannot call ${String(calleePath)}: expected function, got ${describeType(value)}`,
			);
		}

		return {
			receiver: undefined,
			value: await Reflect.apply(value, receiver, resolvedArgs),
		};
	}, `${calleePath}()`);
};

const createNode = <V>(step: Step<V>, path: string): Wrapped<V> => {
	const run = memoize(step);

	const children = new Map<string | symbol, Wrapped<unknown>>();

	const settle = () => run().then(({ value }) => value);

	const thenHandler = (
		onFulfilled?: ((value: V) => unknown) | null,
		onRejected?: ((reason: unknown) => unknown) | null,
	) => {
		return settle().then(onFulfilled, onRejected);
	};

	const catchHandler = (onRejected?: ((reason: unknown) => unknown) | null) =>
		settle().catch(onRejected);

	const finallyHandler = (onFinally?: (() => void) | null) =>
		settle().finally(onFinally);

	const node = new Proxy(run, {
		get: (_target, key) => {
			if (key === "then") {
				return thenHandler;
			}
			if (key === "catch") {
				return catchHandler;
			}
			if (key === "finally") {
				return finallyHandler;
			}
			if (typeof key === "symbol" && RESERVED_SYMBOLS.has(key)) {
				return undefined;
			}

			let child = children.get(key);

			if (!child) {
				child = createGetNode(run, path, key);
				children.set(key, child);
			}

			return child;
		},
		apply: (_target, _thisArg, args: unknown[]) => {
			return createCallNode(run, path, args);
		},
		set: rejectWrite(path),
		defineProperty: rejectWrite(path),
		deleteProperty: rejectWrite(path),
	}) as unknown as Wrapped<V>;

	nodes.add(node as unknown as object);

	return node;
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

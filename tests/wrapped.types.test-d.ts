import type { Wrapped } from "./../src/types";
import { expectTypeOf, test } from "vitest";

type User = {
	id: number;
	name: string;
};

type Dog = { kind: "dog"; bark(): void };
type Cat = { kind: "cat"; meow(): void };
type Animal = Dog | Cat;

test("wrap object properties and preserve PromiseLike", () => {
	expectTypeOf<Wrapped<User>>().toExtend<PromiseLike<User>>();
	expectTypeOf<Wrapped<User>["id"]>().toEqualTypeOf<Wrapped<number>>();
	expectTypeOf<Wrapped<User>["name"]>().toEqualTypeOf<Wrapped<string>>();
});

test("wrap function result and preserve its params", () => {
	const getUser = null as unknown as Wrapped<(id: number) => User>;
	const result = getUser(42);

	expectTypeOf(result).toEqualTypeOf<Wrapped<User>>();
});

test("unwrap promises returned by methods", () => {
	const api = null as unknown as Wrapped<{
		getUser(): Promise<{ profile: { name: string } }>;
	}>;

	expectTypeOf(api.getUser().profile.name).toEqualTypeOf<Wrapped<string>>();
});

test("type map callback values and wrap its result", () => {
	const names = null as unknown as Wrapped<string[]>;
	const transformed = names.map((name, index, array) => {
		expectTypeOf(name).toEqualTypeOf<string>();
		expectTypeOf(index).toEqualTypeOf<number>();
		expectTypeOf(array).toEqualTypeOf<string[]>();

		return name.toUpperCase();
	});

	expectTypeOf(transformed).toEqualTypeOf<Wrapped<string[]>>();
});

test("type reduce with and without initial acc value", () => {
	const numbers = null as unknown as Wrapped<number[]>;
	const total = numbers.reduce((acc, value) => acc + value);
	const label = numbers.reduce((acc, value) => `${acc}:${value}`, "sum");

	expectTypeOf(total).toEqualTypeOf<Wrapped<number>>();
	expectTypeOf(label).toEqualTypeOf<Wrapped<string>>();
});

test("narrow filter and find results with type predicate", () => {
	const animals = null as unknown as Wrapped<Animal[]>;
	const isCat = (animal: Animal): animal is Cat => animal.kind === "cat";

	const cats = animals.filter(isCat);
	const firstCat = animals.find(isCat);

	expectTypeOf(cats).toEqualTypeOf<Wrapped<Cat[]>>();
	expectTypeOf(firstCat).toEqualTypeOf<Wrapped<Cat | undefined>>();
});

test("type array mutations and flat results", () => {
	const nested = null as unknown as Wrapped<number[][]>;
	const flat = nested.flat();
	const sorted = nested.sort();
	const copied = nested.copyWithin(0, 1);

	expectTypeOf(flat).toEqualTypeOf<Wrapped<number[]>>();
	expectTypeOf(sorted).toEqualTypeOf<Wrapped<number[][]>>();
	expectTypeOf(copied).toEqualTypeOf<Wrapped<number[][]>>();
});

test("wrap array members instead of leaking plain array types", () => {
	const names = null as unknown as Wrapped<string[]>;

	expectTypeOf(names.length).toEqualTypeOf<Wrapped<number>>();
	expectTypeOf(names.join(",")).toEqualTypeOf<Wrapped<string>>();
	expectTypeOf(names.at(0)).toEqualTypeOf<Wrapped<string | undefined>>();
	expectTypeOf(names.includes("a")).toEqualTypeOf<Wrapped<boolean>>();
	expectTypeOf(names.slice(1)).toEqualTypeOf<Wrapped<string[]>>();
	expectTypeOf(names[0]!).toEqualTypeOf<Wrapped<string>>();
});

test("pass plain values to array callbacks", () => {
	const names = null as unknown as Wrapped<string[]>;

	const hasLong = names.some((name) => {
		expectTypeOf(name).toEqualTypeOf<string>();

		return name.length > 3;
	});

	expectTypeOf(hasLong).toEqualTypeOf<Wrapped<boolean>>();
});

test("support readonly arrays without mutating members", () => {
	const numbers = null as unknown as Wrapped<readonly number[]>;
	const doubled = numbers.map((value, _index, array) => {
		expectTypeOf(array).toEqualTypeOf<readonly number[]>();

		return value * 2;
	});

	expectTypeOf(doubled).toEqualTypeOf<Wrapped<number[]>>();

	// @ts-expect-error readonly arrays have no in-place members
	numbers.sort();
});

test("keep positional types for tuples", () => {
	const pair = null as unknown as Wrapped<readonly [string, number]>;

	expectTypeOf(pair[0]).toEqualTypeOf<Wrapped<string>>();
	expectTypeOf(pair[1]).toEqualTypeOf<Wrapped<number>>();
	expectTypeOf(pair.length).toEqualTypeOf<Wrapped<2>>();
});

test("expose toReversed on wrapped arrays", () => {
	const numbers = null as unknown as Wrapped<number[]>;

	expectTypeOf(numbers.toReversed()).toEqualTypeOf<Wrapped<number[]>>();
});

test("accept nodes as call arguments", () => {
	const api = null as unknown as Wrapped<{
		user: { id: number };
		getPosts: (id: number, limit?: number) => { title: string }[];
	}>;

	api.getPosts(42);
	api.getPosts(api.user.id);
	api.getPosts(api.user.id, 10);

	// @ts-expect-error node of wrong type is rejected
	api.getPosts(api.user);
});

test("expose catch and finally", () => {
	const name = null as unknown as Wrapped<string>;

	expectTypeOf(name.catch(() => 1)).toEqualTypeOf<Promise<string | number>>();
	expectTypeOf(name.finally(() => {})).toEqualTypeOf<Promise<string>>();
});

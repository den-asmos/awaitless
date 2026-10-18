import { chain } from "../src";
import type { Wrapped } from "../src";
import { expectTypeOf, test } from "vitest";

const request = null as unknown as Promise<unknown>;
const schema = null as unknown as {
	json: () => { data: { user: { name: [StringConstructor] } } };
};

test("infer whole chain from schema", () => {
	const name = chain(request, schema).json().data.user.name;

	expectTypeOf(name).toEqualTypeOf<Wrapped<string[]>>();
	expectTypeOf(name[0]!.toLowerCase()).toEqualTypeOf<Wrapped<string>>();
	expectTypeOf(name.map((value) => value.length)).toEqualTypeOf<
		Wrapped<number[]>
	>();
});

test("reject properties missing from schema", () => {
	// @ts-expect-error `token` is not part of schema
	chain(request, schema).json().data.token;
});

test("reject incorrectly typed call arguments", () => {
	const names = chain(request, schema).json().data.user.name;

	// @ts-expect-error `includes` expects a string
	names.includes(42);
});

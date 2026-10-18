import { expectTypeOf, test } from "vitest";
import type { Infer } from "../src/types";

test("map schema constructors to primitive values", () => {
	expectTypeOf<Infer<StringConstructor>>().toEqualTypeOf<string>();
	expectTypeOf<Infer<NumberConstructor>>().toEqualTypeOf<number>();
	expectTypeOf<Infer<BooleanConstructor>>().toEqualTypeOf<boolean>();
	expectTypeOf<Infer<DateConstructor>>().toEqualTypeOf<Date>();
});

test("infer nested objects and arrays schemas", () => {
	type Schema = {
		name: StringConstructor;
		age: NumberConstructor;
		city: StringConstructor;
		isActive: BooleanConstructor;
		tags: [StringConstructor];
		timeStamps: { createdAt: DateConstructor; history: [DateConstructor] };
	};

	type Expected = {
		name: string;
		age: number;
		city: string;
		isActive: boolean;
		tags: string[];
		timeStamps: { createdAt: Date; history: Date[] };
	};

	expectTypeOf<Infer<Schema>>().toEqualTypeOf<Expected>();
});

test("preserve function params and infer return values", () => {
	type Schema = {
		json: (format: "full" | "compact") => {
			data: { user: { name: [StringConstructor] } };
		};
	};

	type Expected = {
		json: (format: "full" | "compact") => {
			data: { user: { name: string[] } };
		};
	};

	expectTypeOf<Infer<Schema>>().toEqualTypeOf<Expected>();
});

test("infer root function schema", () => {
	type Schema = () => {
		json: () => { data: { user: { name: [StringConstructor] } } };
	};

	type Expected = () => {
		json: () => { data: { user: { name: string[] } } };
	};

	expectTypeOf<Infer<Schema>>().toEqualTypeOf<Expected>();
});

test("resolve unregistered constructors to never", () => {
	expectTypeOf<Infer<ArrayBufferConstructor>>().toBeNever();
	expectTypeOf<Infer<{ buffer: ArrayBufferConstructor }>>().toEqualTypeOf<{
		buffer: never;
	}>();
});

test("infer unions of schemas", () => {
	expectTypeOf<Infer<StringConstructor | NumberConstructor>>().toEqualTypeOf<
		string | number
	>();
	expectTypeOf<Infer<StringConstructor | null>>().toEqualTypeOf<
		string | null
	>();
});

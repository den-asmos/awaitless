import { expectTypeOf } from "vitest";
import type { Infer } from "../../src";

declare module "../../src" {
	interface SchemaTypeMap {
		buffer: { constructor: ArrayBufferConstructor; type: ArrayBuffer };
	}
}

expectTypeOf<Infer<ArrayBufferConstructor>>().toEqualTypeOf<ArrayBuffer>();
expectTypeOf<Infer<{ buffer: ArrayBufferConstructor }>>().toEqualTypeOf<{
	buffer: ArrayBuffer;
}>();

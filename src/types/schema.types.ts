export interface SchemaTypeMap {
	string: { constructor: StringConstructor; type: string };
	number: { constructor: NumberConstructor; type: number };
	boolean: { constructor: BooleanConstructor; type: boolean };
	date: { constructor: DateConstructor; type: Date };
}

type Constructor = abstract new (...args: any[]) => any;

type LookupSchemaType<T> =
	SchemaTypeMap[keyof SchemaTypeMap] extends infer Entry
		? Entry extends { constructor: infer C; type: infer R }
			? T extends C
				? R
				: never
			: never
		: never;

export type Infer<T> = T extends (infer E)[]
	? Infer<E>[]
	: LookupSchemaType<T> extends never
		? T extends Constructor
			? never
			: T extends (...args: infer A) => infer R
				? (...args: A) => Infer<R>
				: { [P in keyof T]: Infer<T[P]> }
		: LookupSchemaType<T>;

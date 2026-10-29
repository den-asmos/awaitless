# awaitless

**Chain calls on data that hasn't arrived yet — as if it were already here.**

`awaitless` lets you read properties, index arrays and call methods on the result of a
`Promise` _before_ it resolves. You write one synchronous-looking expression;
the library builds a lazy chain behind it, runs it when you `await` it, and infers
the type of every step from a schema you describe once.

```ts
const schema = { json: () => ({ data: { user: { name: [String] } } }) };

const name = await chain(fetch("/api/me"), schema)
	.json()
	.data.user.name[0].toLowerCase();
// "alex"
```

Without `awaitless`, the same thing needs an `await` at every asynchronous step:

```ts
const response = await fetch("/api/me");
const body = await response.json();
const name = body.data.user.name[0].toLowerCase();
```

## Contents

- [Features](#features)
- [Installation and requirements](#installation-and-requirements)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
- [API reference](#api-reference)
- [Schemas](#schemas)
- [Working with nodes](#working-with-nodes)
- [Lazy execution and sharing](#lazy-execution-and-sharing)
- [Error handling](#error-handling)
- [Extending the type system](#extending-the-type-system)
- [Recipes](#recipes)
- [Limitations](#limitations)
- [How it works](#how-it-works)
- [Development](#development)
- [License](#license)

## Features

- **Synchronous-looking chains** over promises: property access, indexing, method calls, array methods.
- **Async methods are awaited automatically** in the middle of a chain.
- **Lazy**: nothing runs until the chain is awaited.
- **Shared prefixes run once**: branching a chain never repeats work or re-reads a one-shot body.
- **Schema-driven types**: every step is typed from a schema; array callbacks receive plain values.
- **Extensible types**: register your own classes and value types through declaration merging.
- **Helpful errors** that say _where_ in the chain something went wrong.
- Zero dependencies, ESM and CommonJS, ships its own type declarations.

## Installation and requirements

> **Status:** awaitless is **not published to npm** yet.
> Use it from a local checkout as described below. The API may still change.

Clone or copy the repository and build it once:

```sh
cd awaitless
npm install
npm run build   # creates dist/: ESM and CJS bundles plus type declarations
```

Then use it from another local project in one of these ways:

```sh
# 1. Link: a rebuild is picked up automatically
cd awaitless && npm link
cd ../my-app && npm link awaitless

# 2. Install from the folder
cd ../my-app && npm install ../awaitless

# 3. Install a packed snapshot (closest to a real install)
cd awaitless && npm pack        # creates awaitless-1.0.0.tgz
cd ../my-app && npm install ../awaitless/awaitless-1.0.0.tgz
```

Once installed, import it by name: `import { chain } from "awaitless"`.
Inside the repository itself, import from the sources instead
(`import { chain } from "../src"`), as the tests do.

| Requirement | Details                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime     | Any JavaScript runtime with `Proxy`, `Promise` and ES2021 syntax (the output uses `??=`), e.g. Node.js 15+ and current browsers. Developed and tested on Node.js. |
| Modules     | ESM (`import`) and CommonJS (`require`).                                                                                                                          |
| TypeScript  | Tested with 4.9 through 7.0, in `strict` mode. Your `lib` compiler option must include ES2019 or later (the types use `FlatArray`).                               |

## Quick start

```ts
import { chain } from "awaitless";

// 1. Describe the shape of the data your request resolves to.
//    Functions describe methods, arrays are written as [Type].
const schema = {
	json: () => ({
		data: {
			user: {
				name: [String],
				age: Number,
			},
		},
	}),
};

// 2. Wrap the request.
const api = chain(fetch("https://api.example.com/me"), schema);

// 3. Chain freely and await the end of the chain.
const firstName = await api.json().data.user.name[0].toLowerCase(); // string
const age = await api.json().data.user.age.toFixed(1); // string

// Every step is typed:
api.json().data.user.name.map((part) => part.toUpperCase()); // Wrapped<string[]>
```

The `schema` is used **only for its type**. Its runtime value is never read, so it
can be as light as you like (see [Schemas](#schemas)).

## Core concepts

**Nodes.** `chain()` returns a _node_. Every property read (`.user`), index
(`[0]`) and call (`()`) on a node returns a new node. Nodes are _promise-like_:
they have a `then` method, so you can `await` them.

**Nothing runs early.** Building a chain does no work. The chain executes when
something calls `then` on a node, which `await`, `Promise.all` and
`Promise.resolve` all do.

**Each step runs once.** A node remembers its result (or its failure). Nodes
that share a prefix share the work of that prefix.

**The request itself is not lazy.** `chain(fetch(url), schema)` receives an
already-started promise. Only the steps _after_ it are deferred.

```ts
const node = chain(fetch(url), schema).json().data.user; // nothing has run yet
const user = await node; // the chain runs now
```

## API reference

### `chain(request, schema)`

```ts
function chain<S>(request: PromiseLike<unknown>, schema: S): Wrapped<Infer<S>>;
```

| Parameter | Description                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request` | Any promise or thenable that resolves to the root value (a `Response`, an SDK client, a plain object, …). Its rejection is observed immediately, see [Error handling](#error-handling). |
| `schema`  | A value whose **type** describes the resolved data. Never inspected at runtime.                                                                                                         |

Returns a `Wrapped<Infer<S>>` node for the root value.

### Exported types

| Type                     | Purpose                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `Wrapped<T>`             | The type of a node whose resolved value is `T`. It is `PromiseLike<T>` plus the members of `T`, each wrapped again.  |
| `Infer<S>`               | Converts a schema type `S` into the data type it describes.                                                          |
| `SchemaTypeMap`          | Interface you augment to teach `Infer` about new types. See [Extending the type system](#extending-the-type-system). |
| `WrappedArray<T, A>`     | Non-mutating array members available on a wrapped array.                                                             |
| `WrappedMutableArray<T>` | In-place array members, available only on mutable arrays.                                                            |

How `Wrapped<T>` maps a type:

| `T`                               | Members available on `Wrapped<T>`                                              |
| --------------------------------- | ------------------------------------------------------------------------------ |
| object                            | every property of `T`, each wrapped: `Wrapped<T[K]>`                           |
| primitive (`string`, `number`, …) | the members of that primitive, e.g. `length`, `toLowerCase()`                  |
| function `(...args) => R`         | callable with the same arguments, returning `Wrapped<Awaited<R>>`              |
| array                             | wrapped array members, an index signature and `length` (see [Arrays](#arrays)) |

## Schemas

A schema describes the data **after** every promise has been resolved. Write it
as an ordinary object; only its type matters.

| Schema                                | Inferred type                         |
| ------------------------------------- | ------------------------------------- |
| `String`, `Number`, `Boolean`, `Date` | `string`, `number`, `boolean`, `Date` |
| `{ id: Number, name: String }`        | `{ id: number; name: string }`        |
| `[String]`                            | `string[]`                            |
| `[{ id: Number }]`                    | `{ id: number }[]`                    |
| `(id: number) => ({ name: String })`  | `(id: number) => { name: string }`    |

```ts
const schema = {
	// A method. The function describes its *resolved* return value,
	// so an `async` method is written like a synchronous one.
	getUser: (id: number) => ({
		name: String,
		tags: [String],
		address: { city: String },
	}),
};

const db = chain(connect(), schema);
const city = await db.getUser(42).address.city.toUpperCase();
```

Notes:

- **Do not put `Promise` in a schema.** Promises are resolved implicitly; a
  method that returns `Promise<User>` is described as returning the user shape.
- **The schema can be type-only.** Since it is never read, `{} as MySchema`
  works if you prefer to write the shape as a type.
- **Unions and `null`** are expressed by annotating the schema type. Such a value
  can be awaited, but chaining _through_ it is not allowed
  (see [Limitations](#limitations)).

  ```ts
  const schema: { nickname: StringConstructor | null } = { nickname: String };
  const nickname = await chain(request, schema).nickname; // string | null
  ```

- **Tuples are flattened.** `[String, Number]` becomes `(string | number)[]`.
- **Only `String`, `Number`, `Boolean` and `Date` are built in.** Any other constructor
  infers as `never` until you register it, so a missing
  registration fails loudly instead of silently producing a wrong type.
- `Infer` can be used on its own:

  ```ts
  import type { Infer } from "awaitless";

  type User = Infer<{ name: StringConstructor; tags: StringConstructor[] }>;
  // { name: string; tags: string[] }
  ```

## Working with nodes

### Property access and indexing

```ts
// `schema` is the one from the Quick start.
const node = chain(request, schema);

await node.json().data.user.name; // string[]
await node.json().data.user.name[0]; // string (index access)
await node.json().data.user.name.length; // number
```

### Method calls

Arguments are passed **as plain values**, and the receiver (`this`) is preserved.
A method that returns a promise is awaited before the chain continues.

```ts
const schema = { getUser: (id: number) => ({ profile: { name: String } }) };

const name = await chain(client, schema).getUser(42).profile.name;
```

### Primitive members

Members of strings, numbers and booleans are available on their nodes:

```ts
const node = chain(request, schema); // same schema as above

await node.json().data.user.name[0].toLowerCase(); // string
await node.json().data.user.age.toFixed(1); // string
await node.json().data.user.name[0].length; // number
```

### Arrays

A wrapped array exposes array members whose **results are nodes** and whose
**callbacks receive plain values**:

```ts
const schema = { users: [{ active: Boolean, email: String }] };

const emails = await chain(request, schema)
	.users.filter((user) => user.active) // user is a plain object
	.map((user) => user.email.trim()); // string[]
```

| Group                          | Members                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Reading                        | `length`, `[index]`, `at`, `includes`, `indexOf`, `lastIndexOf`, `join`, `slice`, `concat`, `flat`                                |
| Iteration                      | `map`, `flatMap`, `forEach`, `filter`, `find`, `findLast`, `findIndex`, `findLastIndex`, `some`, `every`, `reduce`, `reduceRight` |
| Copying variants               | `toSorted`, `toReversed`, `toSpliced`, `with`                                                                                     |
| In place (mutable arrays only) | `sort`, `reverse`, `fill`, `copyWithin`, `splice`, `push`, `pop`, `shift`, `unshift`                                              |

- `filter` and `find` accept type predicates and narrow their result.
- `readonly` arrays and readonly tuples get no in-place members.
- Tuples keep positional types for `[0]`, `[1]`, … and a literal `length`.
- Members not listed above are not typed. Copying variants such as `toSorted`
  also require a runtime whose arrays have them (ES2023).

### Class instances and built-ins

Because the receiver is preserved, getters, `#private` fields and built-in
objects (`Map`, `Set`, `Date`, …) behave as they would when called directly. To
get types for a class, register it (see
[Extending the type system](#extending-the-type-system)).

### Getting the value out

Any of these run the chain:

```ts
const node = chain(request, { count: Number, a: String, b: String });

const value = await node; // await
const same = await Promise.resolve(node); // as a real Promise
const doubled = await node.count.then((n) => n * 2);
const [a, b] = await Promise.all([node.a, node.b]);
```

## Lazy execution and sharing

### Nothing runs until awaited

```ts
const api = { save: () => "saved" };
const schema = { save: () => String };

const call = chain(Promise.resolve(api), schema).save(); // save() has NOT run

await call; // save() runs now
```

Consequence: a chain you never await does nothing. Fire-and-forget calls must
still be awaited (or have `.then` called on them):

```ts
const schema = { save: () => String };

void chain(source, schema).save(); // save() is never called
await chain(source, schema).save(); // correct
```

### Shared prefixes run once

Every node caches its result. Branching a chain reuses the work done by the
common part, however many branches you await.

Reading the same property twice from the same node returns the same cached
node, so `api.user.name` and `api.user.age` share one `api.user` even if you
never store it in a variable. Method calls are different: each `()` creates a
new call node, so writing `api.json()` twice runs `json` twice. Store the call
in a variable to share it.

```ts
const res = chain(fetch(url), {
	json: () => ({ user: { name: String, email: String } }),
});

const user = res.json().user; // shared prefix

const [name, email] = await Promise.all([user.name, user.email]);
// res.json() ran exactly once, so the response body was read once
```

Awaiting the same node again returns the same result without re-running anything.
Calling `chain()` twice creates two independent chains, each with its own cache.

### In-place methods run once per node

`sort`, `reverse`, `splice`, … change the underlying array. They run once per
node and the result is cached:

```ts
const schema = { items: [Number] };
const reversed = chain(request, schema).items.reverse();

await reversed; // [3, 2, 1]
await reversed; // [3, 2, 1]  (not reversed back)
```

Two _different_ nodes that both call `reverse()` still reverse the same array
twice, exactly as two direct calls would.

## Error handling

### What rejects

A node rejects when:

- the `request` rejects (its own error is passed through unchanged);
- a method in the chain throws or rejects (its error is passed through unchanged);
- the chain reads a property of `null`/`undefined`, or calls something that is not a function (a `TypeError` created by the library).

Failures are cached like results: a failed step is **not retried** when the node
is awaited again.

### Error messages

Library errors are `TypeError`s. They include the _path_ of the failing step:
`<root>` is the resolved request, `.prop` a property, `[0]` an index,
`()` a call.

| Situation                                | Message                                                   |
| ---------------------------------------- | --------------------------------------------------------- |
| Reading a member of `null` / `undefined` | `Cannot read name of null (at <root>.user.profile)`       |
| Calling a non-function                   | `Cannot call <root>.count: expected function, got number` |
| Writing to a node                        | `Cannot modify <root>: chain nodes are read-only`         |

For reads, the path points at the value that was `null`/`undefined`.

### Handling errors

```ts
const schema = { user: { profile: { name: String } } };

// try / catch
try {
	await chain(request, schema).user.profile.name;
} catch (error) {
	console.error(error); // TypeError: Cannot read name of null (at <root>.user.profile)
}

// then(onFulfilled, onRejected)
const name = await chain(request, schema).user.profile.name.then(
	undefined,
	() => "anonymous",
);

// several branches, independent outcomes
const root = chain(request, { a: { x: Number }, b: { x: Number } });
const results = await Promise.allSettled([root.a.x, root.b.x]);
```

Nodes have `then`, `catch` and `finally`, so `node.catch(handler)` works like it
does on a promise. They are still not real promises (`instanceof Promise` is
false); use `Promise.resolve(node)` when you need one.

### Unhandled rejections

The library observes `request` as soon as `chain()` is called. A rejection that
happens before you await the chain is therefore **not** reported as an
`unhandledRejection`, and you still receive the error when you await the chain.
The flip side: if you never await a chain whose request rejects, the error is
silently discarded.

## Extending the type system

`Infer` looks types up in the `SchemaTypeMap` interface. Add an entry by
augmenting it. Each entry has two fields: the schema `constructor` and the
resulting `type`.

```ts
import { chain } from "awaitless";

class Money {
	constructor(
		readonly amount: number,
		readonly currency: string,
	) {}
	format(): string {
		return `${this.amount.toFixed(2)} ${this.currency}`;
	}
}

declare module "awaitless" {
	interface SchemaTypeMap {
		money: { constructor: typeof Money; type: Money };
	}
}

const schema = { price: Money, history: [Money] };
const order = chain(loadOrder(), schema);

await order.price.format(); // string
await order.price.amount; // number
await order.history.map((m) => m.amount); // number[]
```

Rules and caveats:

- The augmentation is **global to your TypeScript program**. Pick unique keys
  (`money`, not `type`), because two declarations with the same key conflict.
- Registration is **types only**. The runtime value is not converted. If your
  data comes from `JSON.parse`, a registered `Date` is still a string at runtime.
  Register a type only when the data really contains instances of it, or convert
  after awaiting: `new Date(await node.createdAt)`.
- Until registered, a constructor infers as `never`.

## Recipes

### Read a response from several branches

```ts
const res = chain(fetch(url), {
	status: Number,
	headers: { get: (name: string) => String },
	json: () => ({ user: { name: String, email: String } }),
});

const user = res.json().user;

const [name, email, type, status] = await Promise.all([
	user.name,
	user.email,
	res.headers.get("content-type"),
	res.status,
]);
```

### Dependent calls

```ts
const schema = {
	getUser: (id: number) => ({
		getPosts: () => [{ title: String }],
	}),
};

const titles = await chain(client, schema)
	.getUser(7)
	.getPosts()
	.map((post) => post.title.toUpperCase());
```

### Fallback value

```ts
const schema = { user: { address: { city: String } } };

const city = await chain(request, schema).user.address.city.then(
	undefined,
	() => "unknown",
);
```

### Awaiting the root

Awaiting the root node returns the underlying value, typed as the schema:

```ts
const data = await chain(Promise.resolve({ id: 1 }), { id: Number }); // { id: number }
```

## Limitations

**Runtime behaviour**

1. **Promise-like, not a `Promise`.** A node has `then`, `catch` and `finally`,
   but `instanceof Promise` is false and `typeof node` is `"function"`. Use
   `Promise.resolve(node)` when you need a real promise.
2. **Lazy.** A node that is never awaited never runs. `void chain(...).save()`
   does not call `save`.
3. **Only top-level arguments are resolved.** A node passed directly as an
   argument is awaited before the call (alongside the callee, in parallel), so
   `api.getPosts(api.user.id)` works. A node nested inside an object or array
   argument is **not** resolved. Plain promises passed as arguments are left
   as they are.

   ```ts
   const api = chain(request, schema);

   await api.getPosts(api.user.id); // resolved for you
   await api.search({ id: api.user.id }); // NOT resolved: await the id first
   ```

4. **Properties named `then`, `catch` or `finally` are unreachable.** They
   always mean the promise methods. Read such a field by awaiting its parent
   object.
5. **No iteration.** Spreading a node (`[...node.items]`) or using `for…of`
   throws a `TypeError` because nodes are not iterable. Await the array first.
   Well-known symbols (`Symbol.iterator`, `Symbol.toPrimitive`, ...) are not
   forwarded through the chain; symbols you create yourself are.
6. **No `new`.** Constructors reached through a node cannot be instantiated.
7. **Detached methods lose `this`.** `const fn = await node.method` gives an
   unbound function. Call the method through the chain instead.
8. **Callbacks are synchronous and plain.** Array callbacks receive resolved
   values and cannot return nodes. An `async` callback produces an array of
   promises; the library does not await them.
9. **Failures are cached.** A rejected step is not retried on a later `await`.
   Build a new chain to retry.
10. **A never-awaited chain with a rejected request swallows the error.**
11. **In-place array methods mutate shared data.** The data behind a node is the
    same object everyone else sees.
12. **Overhead.** Each step adds a few asynchronous hops. It is negligible for
    I/O pipelines and not intended for hot loops.

**Types**

13. **Nullable values end the chain.** `Wrapped<T | null>` (and `T | undefined`)
    exposes no members of `T`, so `node.user.name` does not compile when `user`
    is nullable. At runtime such a chain throws if the value really is `null`.
    Await the parent, check, then continue:

    ```ts
    const schema: { user: { name: StringConstructor } | null } = {
    	user: { name: String },
    };

    const user = await chain(request, schema).user; // { name: string } | null
    const name = user?.name ?? "anonymous";
    ```

14. **No optional-chaining semantics.** `null` never propagates through a chain;
    it throws.
15. **The schema is a claim, not a check.** Nothing validates the data against
    it, and nothing converts values. If the payload differs from the schema, the
    types are wrong. See [Extending the type system](#extending-the-type-system).
16. **Generic and overloaded methods degrade.** Type inference cannot keep a
    method's generics: `id<T>(x: T): T` becomes `(x: unknown) => Wrapped<unknown>`
    (array methods are special-cased and keep theirs). Overloads are kept for
    up to the last four signatures (enough for `String.split`); earlier ones
    are dropped.
17. **Index access with `noUncheckedIndexedAccess`.** `list[0]` is typed
    `Wrapped<T> | undefined` under this compiler option, although a node always
    exists. Use `list[0]!`.
18. **Only four built-in schema types** (`String`, `Number`, `Boolean`, `Date`), and
    tuples in schemas are flattened to arrays.
19. **Type-only extension is global.** `SchemaTypeMap` augmentations apply to the
    whole program and can collide across packages.

## How it works

`chain()` wraps the resolved request in a _step_, a small function that produces
`{ value, receiver }`. Each node is a `Proxy` around its memoized step:

- **`get`** returns a new node whose step awaits its parent, reads the property
  and remembers the object as the receiver for a later call. The key `then` is
  the exception: it returns the promise-protocol method.
- **`apply`** returns a new node whose step awaits the callee, calls it with the
  remembered receiver, and awaits the result.
- **Memoization**: a node's step runs on first use and its promise is reused
  afterwards. Child nodes call their parent's memoized step, which is why
  shared prefixes run once.
- **`then`** runs the step and hands the resolved value to your callbacks, so a
  node works with `await`, `Promise.all` and `Promise.resolve`.

Types are computed separately: `Infer<S>` turns the schema into a data type and
`Wrapped<T>` turns that into the node type.

## Development

```sh
npm install
npm test               # runtime tests and type tests (vitest)
npm run test:watch     # the same in watch mode
npm run typecheck      # sources, all tests, and the SchemaTypeMap extension test
npm run build          # ESM + CJS bundles and type declarations into dist/
```

Project layout:

```text
src/
  index.ts                 public exports
  chain.ts                 runtime: nodes, memoized steps, Proxy traps
  types/
    wrapped.types.ts       Wrapped<T>: the type of a node
    array.types.ts         array members (WrappedArray, WrappedMutableArray)
    schema.types.ts        Infer<S> and the SchemaTypeMap registry
    step.types.ts          internal Step / Frame types
tests/
  chain.test.ts            runtime tests
  *.test-d.ts              type-level tests
  extension/               checks SchemaTypeMap augmentation in its own TS project
```

## License

ISC

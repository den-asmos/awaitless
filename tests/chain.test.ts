import { describe, it, expect, vi } from "vitest";
import { chain } from "../src";

const schema = {} as never;
const wrap = (value: unknown) => chain(Promise.resolve(value), schema) as any;
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("chain", () => {
	describe("property access", () => {
		it("resolve root value", async () => {
			await expect(wrap({ id: 42 })).resolves.toEqual({ id: 42 });
		});

		it("read nested properties", async () => {
			await expect(
				wrap({ user: { profile: { name: "Alex" } } }).user.profile.name,
			).resolves.toBe("Alex");
		});

		it("pass symbols though property access", async () => {
			const token = Symbol("token");

			await expect(wrap({ [token]: "hello world" })[token]).resolves.toBe(
				"hello world",
			);
		});

		it("read members of primitive values", async () => {
			const result = wrap({ user: { name: ["ALEX"] } }).user.name[0];

			await expect(result.toLowerCase()).resolves.toBe("alex");
			await expect(result.length).resolves.toBe(4);
		});
	});

	describe("method calls", () => {
		it("invoke a function resolved by request", async () => {
			const request = () => ({ data: { user: { name: "Alex" } } });

			await expect(wrap(request)().data.user.name).resolves.toBe("Alex");
		});

		it("transform values resolved by request", async () => {
			const request = {
				json() {
					return { data: { user: { name: ["Alex", "Smith"] } } };
				},
			};

			const result = wrap(request)
				.json()
				.data.user.name.reduce((acc: string, value: string) => acc + value, "");

			await expect(result).resolves.toBe("AlexSmith");
		});

		it("call sync methods", async () => {
			const calc = {
				add(a: number, b: number) {
					return a + b;
				},
			};

			await expect(wrap(calc).add(41, 1)).resolves.toBe(42);
		});

		it("await an async method before continuing the chain", async () => {
			const api = {
				async getUser() {
					return { profile: { name: "Alex" } };
				},
			};

			await expect(wrap(api).getUser().profile.name).resolves.toBe("Alex");
		});

		it("handle multiple async method calls", async () => {
			const api = {
				async load() {
					return {
						async format() {
							return { status: "ready" };
						},
					};
				},
			};

			await expect(wrap(api).load().format().status).resolves.toBe("ready");
		});

		it("preserve 'this' when calling a method", async () => {
			const account = {
				prefix: "user:",
				format(id: number) {
					return `${this.prefix}${id}`;
				},
			};

			await expect(wrap(account).format(42)).resolves.toBe("user:42");
		});

		it("call returned function without receiver", async () => {
			const api = {
				make() {
					return function (this: unknown) {
						return this;
					};
				},
			};

			await expect(wrap(api).make()()).resolves.toBeUndefined();
		});
	});

	describe("laziness", () => {
		it("run nothing until chain is awaited", async () => {
			const load = vi.fn(() => ({ status: "ready" }));
			const node = wrap({ load }).load().status;

			await tick();
			expect(load).not.toHaveBeenCalled();

			await expect(node).resolves.toBe("ready");
			expect(load).toHaveBeenCalledTimes(1);
		});
	});

	describe("memoization", () => {
		it("run shared prefix once for sibling branches", async () => {
			const json = vi.fn(() => ({ name: "Alex", age: 42 }));
			const user = wrap({ json }).json();

			await expect(Promise.all([user.name, user.age])).resolves.toEqual([
				"Alex",
				42,
			]);
			expect(json).toHaveBeenCalledTimes(1);
		});

		it("read one-shot response body only once", async () => {
			const response = new Response(
				JSON.stringify({ user: { name: "Alex", age: 42 } }),
			);
			const user = wrap(response).json().user;

			await expect(Promise.all([user.name, user.age])).resolves.toEqual([
				"Alex",
				42,
			]);
		});

		it("return the same result when node is awaited again", async () => {
			const reversed = wrap({ items: [1, 2, 3] }).items.reverse();

			await expect(reversed).resolves.toEqual([3, 2, 1]);
			await expect(reversed).resolves.toEqual([3, 2, 1]);
		});

		it("share failure between awaits instead of retrying", async () => {
			const error = new Error("oops");
			const fail = vi.fn(() => {
				throw error;
			});
			const node = wrap({ fail }).fail();

			await expect(node).rejects.toBe(error);
			await expect(node).rejects.toBe(error);
			expect(fail).toHaveBeenCalledTimes(1);
		});
	});

	describe("promise protocol", () => {
		it("implement normal Promise fulfillment", async () => {
			await expect(
				wrap({ id: 21 }).then(({ id }: { id: number }) => id * 2),
			).resolves.toBe(42);
		});

		it("transform onFulfilled exception into rejection", async () => {
			const error = new Error("handler error");

			await expect(
				wrap("value").then(() => {
					throw error;
				}),
			).rejects.toBe(error);
		});

		it("let onRejected recover rejected chain", async () => {
			const error = new Error("internal server error");
			const result = chain(Promise.reject(error), schema) as any;

			await expect(result.then(undefined, () => "gotcha")).resolves.toBe(
				"gotcha",
			);
		});

		it("reject when source request rejects", async () => {
			const error = new Error("internal server error");
			const result = chain(Promise.reject(error), schema) as any;

			await expect(result).rejects.toBe(error);
		});

		it("do not report an unawaited rejected source as unhandled", async () => {
			const error = new Error("internal server error");
			const unhandled: unknown[] = [];
			const listener = (reason: unknown) => unhandled.push(reason);

			process.on("unhandledRejection", listener);

			try {
				const result = chain(Promise.reject(error), schema) as any;

				await tick();
				expect(unhandled).toEqual([]);
				await expect(result.id).rejects.toBe(error);
			} finally {
				process.off("unhandledRejection", listener);
			}
		});
	});

	describe("errors", () => {
		it("reject when invoked method throws", async () => {
			const error = new Error("something went wrong");
			const result = wrap({
				throwError() {
					throw error;
				},
			}).throwError();

			await expect(result).rejects.toBe(error);
		});

		it("report when null intermediate value is read", async () => {
			await expect(
				wrap({ user: { profile: null } }).user.profile.name,
			).rejects.toThrow("Cannot read name of null (at <root>.user.profile)");
		});

		it("report when undefined intermediate value is read", async () => {
			await expect(wrap({ list: [] }).list[0].name).rejects.toThrow(
				"Cannot read name of undefined (at <root>.list[0])",
			);
		});

		it("explain why value cannot be called", async () => {
			await expect(wrap({ count: 1 }).count()).rejects.toThrow(
				"Cannot call <root>.count: expected function, got number",
			);
		});

		it("reject writes to node", async () => {
			const node = wrap({ id: 42 });

			expect(() => {
				node.id = 2;
			}).toThrow("Cannot modify <root>");
			expect(() => {
				delete node.id;
			}).toThrow("Cannot modify <root>");
		});
	});
});

describe("node arguments", () => {
	const api = () => ({
		user: { id: 42, name: "Alex" },
		getPosts: vi.fn((id: number) => [`post-${id}`]),
		async slowId() {
			await tick();
			return 41;
		},
	});

	it("resolve node passed as an argument", async () => {
		const root = wrap(api());

		await expect(root.getPosts(root.user.id)).resolves.toEqual(["post-42"]);
	});

	it("resolve several node arguments and keep plain ones", async () => {
		const sum = vi.fn((a: number, b: number, c: number) => a + b + c);
		const root = wrap({ sum, one: 1, two: 2 });

		await expect(root.sum(root.one, root.two, 39)).resolves.toBe(42);
		expect(sum).toHaveBeenCalledWith(1, 2, 39);
	});

	it("resolve async node arguments", async () => {
		const root = wrap(api());

		await expect(root.getPosts(root.slowId())).resolves.toEqual(["post-41"]);
	});

	it("do not resolve plain promises", async () => {
		const seen = vi.fn((value: unknown) => value);
		const promise = Promise.resolve(42);

		await wrap({ seen }).seen(promise);

		expect(seen.mock.calls[0]![0]).toBe(promise);
	});

	it("reject call when an argument node rejects", async () => {
		const root = wrap({ f: (x: unknown) => x, missing: null });

		await expect(root.f(root.missing.value)).rejects.toThrow(
			"Cannot read value of null (at <root>.missing)",
		);
	});
});

describe("probing", () => {
	it("throw not iterable error", () => {
		const node = wrap({ items: [1, 2, 3] }).items;

		expect(() => [...node]).toThrow(TypeError);
	});

	it("share child nodes between repeated reads", async () => {
		const json = vi.fn(() => ({ name: "Alex", age: 42 }));
		const root = wrap({ json });

		await Promise.all([root.json().name, root.json().age]);

		expect(json).toHaveBeenCalledTimes(2);
		expect(root.json).toBe(root.json);
	});
});

describe("promise compatibility", () => {
	it("support catch", async () => {
		const node = wrap({ user: null }).user.name;

		await expect(node.catch(() => "some error")).resolves.toBe("some error");
	});

	it("support finally", async () => {
		const done = vi.fn();

		await expect(wrap({ id: 42 }).id.finally(done)).resolves.toBe(42);
		expect(done).toHaveBeenCalledTimes(1);
	});
});

import Jstream from "./Jstream";
import { toArray } from "./privateUtils/data";
import { isStandardCollection } from "./privateUtils/typeGuards";
import { Awaitable, AwaitableIterable } from "./types/async";
import { StandardCollection } from "./types/collections";
import { BreakSignal } from "./types/symbols";
import { DeLiteral } from "./types/utility";
import { breakSignal } from "./utils/symbols";

export type AsyncJstreamProperties<_> = Readonly<
    Partial<{
        freshSource: boolean;
    }>
>;

export default class AsyncJstream<T> implements AsyncIterable<T> {
    private readonly getSource: () => Awaitable<AwaitableIterable<T>>;
    private readonly properties: AsyncJstreamProperties<T>;

    public constructor(
        getSource: () => Awaitable<AwaitableIterable<T>>,
        properties: AsyncJstreamProperties<T> = {}
    ) {
        this.getSource = getSource;
        this.properties = properties;
    }

    public [Symbol.asyncIterator]() {
        const self = this;
        return (async function* () {
            const source = await self.getSource();
            yield* source;
        })();
    }

    // factories:
    public static from<T>(
        source:
            | Awaitable<AwaitableIterable<T>>
            | (() => Awaitable<AwaitableIterable<T>>)
    ) {
        if (source instanceof Function) {
            return new AsyncJstream(source);
        } else if (source instanceof AsyncJstream) {
            return source;
        } else {
            return new AsyncJstream(() => source);
        }
    }

    public static of<T>(...items: T[]): AsyncJstream<T> {
        return new AsyncJstream(() => items);
    }

    public async forEach(
        action: (
            item: Awaited<T>,
            index: number
        ) => void | Awaitable<BreakSignal>
    ): Promise<void> {
        let i = 0;
        for await (const item of this) {
            const signal = await action(item, i);

            if (signal === breakSignal) break;

            i++;
        }
    }

    // stream methods
    public map<AwaitableResult>(
        mapping: (item: Awaited<T>, index: number) => AwaitableResult
    ): AsyncJstream<Awaited<AwaitableResult>> {
        const self = this;
        return new AsyncJstream(async function* () {
            let i = 0;
            for await (const item of self) {
                yield await mapping(item, i);
                i++;
            }
        });
    }

    public filter<R extends Awaited<T> = Awaited<T>>(
        predicate: (item: Awaited<T>, index: number) => Awaitable<boolean>
    ): AsyncJstream<Awaited<R>> {
        const self = this;
        return new AsyncJstream(async function* () {
            let i = 0;
            for await (const item of self) {
                if (await predicate(item, i)) yield item as R;
                i++;
            }
        });
    }

    /**
     * Removes duplicate items from the stream.
     */
    public unique(): AsyncJstream<Awaited<T>>;

    /**
     * Removes duplicate items from the stream
     * @param identifier How to identify each item.
     */
    public unique(
        identifier: (item: Awaited<T>) => Awaitable<any>
    ): AsyncJstream<Awaited<T>>;

    public unique(
        identifier: (item: Awaited<T>) => Awaitable<any> = i => i
    ): AsyncJstream<Awaited<T>> {
        const self = this;

        return new AsyncJstream(async function* () {
            const yielded = new Set<unknown>();

            for await (const item of self) {
                const id = await identifier(item);

                if (!yielded.has(id)) {
                    yield item;
                    yielded.add(id);
                }
            }
        });
    }

    public partition(size: number | bigint): AsyncJstream<Awaited<T>[]> {
        // TODO add requires
        if (size < 1) throw new Error("partition size must be at least 1");
        //

        const self = this;
        return new AsyncJstream(async function* () {
            let partition: Awaited<T>[] = [];
            for await (const item of self) {
                partition.push(item);

                if (partition.length >= size) {
                    yield partition;
                    partition = [];
                }
            }

            if (partition.length > 0) yield partition;
        });
    }

    public append<O>(item: O): AsyncJstream<Awaited<T> | Awaited<O>> {
        const self = this;
        return new AsyncJstream(async function* () {
            yield* self;
            yield item;
        });
    }

    public prepend<O>(item: O): AsyncJstream<Awaited<O> | Awaited<T>> {
        const self = this;
        return new AsyncJstream(async function* () {
            yield item;
            yield* self;
        });
    }

    public concat<O>(
        items: Awaitable<AwaitableIterable<O>>
    ): AsyncJstream<Awaited<T> | Awaited<O>> {
        const self = this;
        return new AsyncJstream(async function* () {
            yield* self;
            yield* await items;
        });
    }

    public preConcat<O>(
        items: Awaitable<AwaitableIterable<O>>
    ): AsyncJstream<Awaited<O> | Awaited<T>> {
        const self = this;
        return new AsyncJstream(async function* () {
            yield* self;
            yield* await items;
        });
    }

    public async some(
        predicate: (item: Awaited<T>, index: number) => Awaitable<boolean>
    ): Promise<boolean> {
        let i = 0;
        for await (const item of this) {
            if (await predicate(item, i++)) return true;
        }
        return false;
    }

    /**
     * Copies stream into an {@link Array}.
     */
    public async toArray(): Promise<(T | Awaited<T>)[]> {
        const source = await this.getSource();
        if (this.properties.freshSource && Array.isArray(source)) {
            return source;
        } else {
            const result: Awaited<T>[] = [];
            for await (const item of source) {
                result.push(item);
            }
            return result;
        }
    }

    /**
     * Copies stream into a {@Link Set}.
     */
    public async toSet(): Promise<Set<T | Awaited<T>>> {
        const source = await this.getSource();
        if (this.properties.freshSource && source instanceof Set) {
            return source;
        } else {
            const result = new Set<Awaited<T>>();
            for await (const item of source) {
                result.add(item);
            }
            return result;
        }
    }

    public async toStandardCollection(): Promise<
        StandardCollection<T | Awaited<T>>
    > {
        const source = await this.getSource();
        if (this.properties.freshSource && isStandardCollection(source)) {
            return source;
        } else {
            return await toArray(source);
        }
    }

    public async reduce(
        reducer: (
            result: DeLiteral<Awaited<T>>,
            item: Awaited<T>,
            index: number
        ) => Awaitable<DeLiteral<Awaited<T>>>
    ): Promise<DeLiteral<Awaited<T>>>;

    public async reduce<F>(
        reducer: (
            result: DeLiteral<Awaited<T>>,
            item: Awaited<T>,
            index: number
        ) => Awaitable<DeLiteral<Awaited<T>>>,
        finalize: (result: DeLiteral<Awaited<T>>, count: number) => Awaitable<F>
    ): Promise<F>;

    public async reduce<F = DeLiteral<Awaited<T>>>(
        reducer: (
            result: DeLiteral<Awaited<T>>,
            item: Awaited<T>,
            index: number
        ) => Awaitable<DeLiteral<Awaited<T>>>,
        finalize?: (
            result: DeLiteral<Awaited<T>>,
            count: number
        ) => Awaitable<F>
    ): Promise<F> {
        const iterator = this[Symbol.asyncIterator]();
        let next = await iterator.next();

        if (next.done) {
            throw new Error(
                "cannot reduce empty async iterable. no initial value"
            );
        }

        let i = 1;

        let result: DeLiteral<Awaited<T>> = next.value as DeLiteral<Awaited<T>>;

        while (!(next = await iterator.next()).done) {
            result = await reducer(result, next.value, i);

            i++;
        }

        if (finalize !== undefined) {
            return await finalize(result, i);
        } else {
            return result as F;
        }
    }

    public async fold<R>(
        initialValue: R,
        folder: (
            result: Awaited<R>,
            item: Awaited<T>,
            index: number
        ) => Awaited<R>
    ): Promise<Awaited<R>>;

    public async fold<R, F>(
        initialValue: Awaitable<R>,
        folder: (
            result: Awaited<R>,
            item: Awaited<T>,
            index: number
        ) => Awaitable<R>,
        finalize: (result: Awaited<R>, count: number) => Awaitable<F>
    ): Promise<F>;

    public async fold<R, F>(
        initialValue: Awaitable<R>,
        folder: (
            result: Awaited<R>,
            item: Awaited<T>,
            index: number
        ) => Awaitable<R>,
        finalize?: (result: Awaited<R>, count: number) => Awaitable<F>
    ): Promise<F> {
        let i = 1;
        let result = await initialValue;

        for await (const item of this) {
            result = await folder(result, item, i);
            i++;
        }

        if (finalize !== undefined) {
            return await finalize(result, i);
        } else {
            return result as F;
        }
    }

    public async toJstream(): Promise<Jstream<T | Awaited<T>>> {
        return Jstream.from(await this.toStandardCollection() as Iterable<T>);
    }
}

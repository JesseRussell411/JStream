import { AwaitableIterable } from "../types/async";
import { isIterable } from "./typeGuards";

export function mkString(collection: Iterable<unknown>): string;

export function mkString(
    collection: Iterable<any>,
    separator: any
): string;

export function mkString(
    collection: Iterable<any>,
    start: any,
    separator: any,
    end?: any
): string;

export function mkString(collection: AsyncIterable<any>): Promise<string>;

export function mkString(
    collection: AsyncIterable<any>,
    separator: any
): Promise<string>;

export function mkString(
    collection: AsyncIterable<any>,
    start: any,
    separator: any,
    end?: any
): Promise<string>;

export function mkString(
    collection: AwaitableIterable<any>
): string | Promise<string>;

export function mkString(
    collection: AwaitableIterable<any>,
    separator: any
): string | Promise<string>;

export function mkString(
    collection: AwaitableIterable<any>,
    start: any,
    separator: any,
    end?: any
): string | Promise<string>;

export function mkString(
    collection: AwaitableIterable<unknown>,
    startOrSeparator: unknown = "",
    separator: unknown = "",
    end: unknown = ""
): string | Promise<string> {
    if (arguments.length === 2) {
        const separator = startOrSeparator;
        return mkString(collection, "", separator, "");
    }

    const start = startOrSeparator;

    if (typeof start !== "string")
        return mkString(collection, `${start}`, separator, end);
    if (typeof separator !== "string")
        return mkString(collection, start, `${separator}`, end);
    if (typeof end !== "string")
        return mkString(collection, start, separator, `${end}`);

    if (typeof collection === "string" && separator === "") {
        // TODO find out if this is necessary
        if (start === "" && end === "") {
            return collection;
        } else if (start === "") {
            return collection + end;
        } else if (end === "") {
            return start + collection;
        } else {
            return start + collection + end;
        }
    }

    if (isIterable(collection)) {
        // TODO test performance difference
        // return start + [...collection].join(separator) + end;

        const builder: unknown[] = [start];

        const iterator = collection[Symbol.iterator]();
        let next = iterator.next();

        if (!next.done) {
            builder.push(next.value);

            while (!(next = iterator.next()).done) {
                builder.push(separator);
                builder.push(next.value);
            }
        }

        builder.push(end);
        return builder.join("");
    } else {
        return (async () => {
            const builder: unknown[] = [start];

            const iterator = collection[Symbol.asyncIterator]();
            let next = await iterator.next();

            if (!next.done) {
                builder.push(next.value);

                while (!(next = await iterator.next()).done) {
                    builder.push(separator);
                    builder.push(next.value);
                }
            }

            builder.push(end);
            return builder.join("");
        })();
    }
}

import { URL } from "url";

export type Partial<T> = {
    [P in keyof T]?: T[P];
}

export function unique<T>(inp : Iterable<T>) : Iterable<T> {
    let s = new Set(inp);
    return s;
}

export function mapToArrays<K,V>(thing: Map<K,V>) : [K,V][] {
    let arr : [K,V][] = [];
    for(let i of thing) {
        arr.push(i);
    }
    return arr;
}

export function* slices<T>(items : Iterable<T>, count: number) : IterableIterator<T[]> {
    let slice : T[] = []
    let iter = items[Symbol.iterator]();
    
    while(true) {
        let curr = iter.next();
        if(curr.done) { break; }
        slice.push(curr.value);
        if(slice.length == count) {
            yield slice;
            slice = [];
        }
    }
    if(slice.length > 0) {
        yield slice;
    }
}

export function* takeFirst<T>(count: number, items: Iterable<T>) : IterableIterator<T> {
    let iter = items[Symbol.iterator]();
    for(let i = 0; i < count; i++) {
        let curr = iter.next();
        if(curr.done) { break; }
        yield curr.value;
    }
}

export function tryParseURL(str: string) : URL | undefined {
    try {
        let u = new URL(str);
        return u;
    }
    catch(e) {
        return undefined;
    }
}

export function isUuid(str: string) : boolean {
    return /^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/i.test(str);
}

export function* concatIterables<T>(...sources : Iterable<T>[]) : IterableIterator<T> {
    for(let i of sources) {
        yield* i;
    }
}
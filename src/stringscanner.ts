import { METHODS } from "http";

export interface Token {
    type : string;
    position: number;
    matches: string[];
}

function* members<V>(o: {[key: string]: V}) : IterableIterator<[string, V]> {
    for(let i of Reflect.ownKeys(o)) {
        yield [<string>i, o[<string>i]];
    }
}

// This COULD be a generator, but using yield that way feels weird.
export function scan(str: string, start?: number) : (tokens: {[key: string]: RegExp}) => (Token|null|false) {
    let idx = start || 0;
    return (tokens: {[key: string]: RegExp}) => {
        let token : Token|null = null;
        for(let [name, pattern] of members(tokens)) {
            pattern.lastIndex = idx;
            let m = pattern.exec(str);
            if(m) {
                token = { type: name, position: idx, matches: m };
                idx = pattern.lastIndex;
                break;
            }
        }
        console.log(token);
        return token;
    };
}
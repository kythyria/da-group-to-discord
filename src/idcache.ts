import { mapToArrays } from './util';
import * as fs from 'fs';
import { stringify } from 'querystring';

export class IdCache {
    _file : string;
    _cache: Map<string, string[]>;
    _maxItems: number;

    constructor(file : string, maxItems : number) {
        this._file = file;
        this._cache = new Map();
        this._maxItems = maxItems;
    }

    testSeen(collection: string, id: string) : boolean {
        let coll = this._cache.get(collection);
        if(!coll) { return false; }

        return coll.find(i=> i == id) != undefined;
    }

    add(collection: string, id: string) : void {
        let coll = this._cache.get(collection);
        if(!coll) {
            coll = [];
            this._cache.set(collection, coll);
        }

        coll.unshift(id);

        if(coll.length > this._maxItems) {
            coll.pop();
        }
    }

    clear(collection: string) : void {
        this._cache.delete(collection);
    }

    clearAll() : void {
        this._cache = new Map();
    }

    forget(collection: string, id: string) : void {
        let coll = this._cache.get(collection);
        if(coll) {
            let idx = coll.indexOf(id);
            if(idx != -1) {
                coll.splice(idx, 1);
            }
        }
    }

    save() : void {
        let data = mapToArrays(this._cache);
        let json = JSON.stringify(data,undefined,2);

        // TODO: Should this be async? If so, is ordering guaranteed?
        fs.writeFileSync(this._file, json);
    }

    load() : void {
        let json : string;
        try {
            json = fs.readFileSync(this._file, {encoding: "utf8"});
            let data = JSON.parse(json);
            this._cache = new Map(data);
        }
        catch(e) {
            if(e.code == "ENOENT") {
                this._cache = new Map();
            }
            else {
                throw e;
            }
        }
    }
}
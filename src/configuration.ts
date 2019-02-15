import * as fs from 'fs';
import { StringDecoder } from 'string_decoder';

export interface ConfigFile {
    daClientId: string;
    daClientSecret: string;
    discordClientId: string;
    discordClientSecret: string;
}

export function readSync(path : string) : ConfigFile {
    let buf = fs.readFileSync(path);
    let sd = new StringDecoder("utf8");
    let txt = sd.end(buf);
    let json = JSON.parse(txt);
    return <ConfigFile>json;
}
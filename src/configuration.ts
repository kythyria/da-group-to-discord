import * as fs from 'fs';

interface ConfigFile {
    dataDirectory: string;
    deviantart: { clientID: string, clientSecret: string };
    discord: { clientID?: string, clientSecret?: string, botToken: string };
}

export function readConfig(path?: string) : ConfigFile {
    let configfile = path || process.argv[2];
    let configdata = fs.readFileSync(configfile, "utf8");
    let config : ConfigFile = JSON.parse(configdata);
    return config;
}
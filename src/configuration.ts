import * as fs from 'fs';

export interface ConfigFile {
    // Place to store data, relative to cwd.
    dataDirectory: string;

    // deviantart OAuth credentials
    deviantart: { clientId: string, clientSecret: string };

    // Discord credentials
    discord: { botToken: string };

    // milliseconds between checks for new posts.
    pollInterval: number,

    // Rules for what posts to relay to where
    notifyMappings: PollMapping[];

    // How many deviation IDs to remember per collection to detect when we've
    // gotten to an already-seen one. This counts mature posts even if all
    // the mappings say to only care about innocent posts.
    maxIdCache: number;

    // If we see this many deviations in the same folder without getting to a recognised one, give up.
    maxNewDeviations: number;
}

export interface PollMapping {
    // name of user that owns the collection to probe.
    username: string
    // UUID of the collection. Ask the bot `galleryfolders <username>` to
    // find these
    collectionId: string,

    // Discord channel ID to post to. Get that from the context menu after
    // turning on Settings > Appearance > Developer Mode
    channel: string,

    // Generate posts for everything, only mature, or only SFW things?
    maturity: MaturityFilter,

    // Generate posts for images, only literature, or everything?
    deviationType: DeviationType
}

export type MaturityFilter = "all" | "mature" | "innocent";
export type DeviationType = "image" | "literature" | "all";

export function readConfig(path?: string) : ConfigFile {
    let configfile = path || process.argv[2];
    let configdata = fs.readFileSync(configfile, "utf8");
    let config : ConfigFile = JSON.parse(configdata);
    return config;
}

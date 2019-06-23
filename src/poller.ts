import * as Discord from "discord.js";
import * as da from './deviantart/api'
import * as dat from './deviantart/datatypes';
import * as conf from './configuration';
import { unique, slices, takeFirst } from './util';
import * as path from "path";
import { IdCache } from "./idcache";
import { makeEmbedForDeviation } from "./embedmaker";
import { DiscordLogThing } from "./discordlogthing";
import { format } from "util";

interface PollWorkItem {
    username: string,
    collection: string,
    channels: PollWorkItemChannel[],
    deviations: dat.DeviationInfo[]
}

interface PollWorkItemChannel {
    channel: string,
    maturity: conf.MaturityFilter,
    deviationType: conf.TypeFilter
}

type CollectedDeviation = dat.DeviationInfo & {
    collection: string,
    collectionName: string;
};

type DeviationWithMetadata = CollectedDeviation & {
    metadata?: dat.DeviationMetadata;
}

type DeviationWithEmbed = DeviationWithMetadata & {
    embed: Discord.RichEmbed;
}

function getChannel(discord : Discord.Client, key: string) : Discord.TextChannel | Discord.DMChannel | Discord.GroupDMChannel | undefined {
    let chan = discord.channels.get(key);
    if(!chan) { return chan; }
    if(chan.type == "dm") { return <Discord.DMChannel>chan; }
    if(chan.type == "text") { return <Discord.TextChannel>chan; }
    if(chan.type == "group") { return <Discord.GroupDMChannel>chan; }
    else { return undefined; }
}

/* Basic polling process:
 * Foreach collection we care about: 
 *   query for recent deviations, going back until we find one we've already seen.
 *   Add ones we haven't to the collected deviation list
 *   Add their IDs to the ID cache.
 * reverse the order of the collected deviation list
 * foreach item in the CDL, in batches of n
 *   request the additional data needed to build an embed.
 *   build the embeds thus buildable
 * foreach channel to be posted to, make an empty list
 * foreach item in the CDL
 *   foreach channel it should be posted to
 *     if it's not already in the list, add it
 * foreach channel to be posted to
 *   post each item
 *   Save the ID cache // here so that a crash doesn't eat anything. At-least-once rather than at-most-once
 */

 const COLLECTION_NAME_UPDATE_INTERVAL = 4

export class Poller {
    _conf : conf.ConfigFile;
    _discord : Discord.Client;
    _da : da.Api;
    _cache : IdCache;
    _collectionNames : Map<string, string>;
    _collectionNameTimer: number;
    _timer? : NodeJS.Timer;
    _logThing : DiscordLogThing;

    constructor(config : conf.ConfigFile, discord : Discord.Client, deviantart : da.Api, logThing : DiscordLogThing) {
        this._conf = config;
        this._discord = discord;
        this._da = deviantart;

        this._cache = new IdCache(path.join(config.dataDirectory, "pollcache.json"), config.maxIdCache);
        this._cache.load();

        this._collectionNames = new Map();
        this._collectionNameTimer = 0;
        this._logThing = logThing
    }

    buildWorkList() : Map<string, PollWorkItem> {
        let list = new Map<string, PollWorkItem>();
        for(let i of this._conf.notifyMappings) {
            if(!list.has(i.collectionId)) {
                list.set(i.collectionId, {
                    username: i.username,
                    collection: i.collectionId,
                    channels: [],
                    deviations: []
                });
            }
            let item = list.get(i.collectionId)!;
            item.channels.push({
                channel: i.channel,
                maturity: i.maturity,
                deviationType: i.deviationTypes
            });
        }
        return list;
    }

    start() : void {
        this.stop();
        if(!this._timer) {
            this._logThing.log("Starting poll timer");
            this._timer = this._discord.setInterval(this.poll.bind(this), this._conf.pollInterval);
        }
    }

    stop() : void {
        if(this._timer) {
            this._logThing.log("Stopping poll timer")
            this._discord.clearInterval(this._timer);
            this._timer = undefined;
        }
    }

    async poll() : Promise<void> {
        console.log("Polling...");
        let startTime = Date.now();
        this.startTyping();

        await this._logThing.catch("poll", this.pollWork());

        this._logThing.log(`Poll ended (took ${Date.now() - startTime}ms)`);
        this.stopTyping();
    }

    async pollWork() : Promise<void> {
        await this.populateCollectionNames();
        
        let colls = this.buildWorkList();
        let deviations : CollectedDeviation[] = []
        for(let i of colls) {
            deviations = deviations.concat(await this.getNewDeviations(i[1].username, i[1].collection));
        }
        deviations = deviations.reverse();
        deviations = deviations.slice(0, this._conf.maxNewDeviations);

        let ad = await this.augmentDeviations(deviations);

        let withEmbeds = ad.map( i => {
            let workitem = colls.get(i.collection) || {username:""};
            let place = `${workitem.username}/${i.collectionName}`
            return {...i, embed: makeEmbedForDeviation(i, {metadata: i.metadata, postedWhere: place})};
        });

        for(let i of withEmbeds) {
            let workitem = colls.get(i.collection);
            if(!workitem) { continue; }
            
            let promises : Promise<any>[] = [];

            for(let j of workitem.channels) {
                let isType = (j.deviationType == "all") || (j.deviationType == "literature" && i.excerpt) || (j.deviationType == "nonliterature" && !i.excerpt);
                let isMaturity = (j.maturity == "mature" && i.is_mature) || (j.maturity == "innocent" && !i.is_mature) || (j.maturity == "all");

                if(isType && isMaturity) {
                    let chan = getChannel(this._discord, j.channel);
                    if(!chan) { continue; }

                    await chan.send(`<${i.url}>`, i.embed);
                }
            }
            this._cache.add(i.collection, i.deviationid);
            await this._cache.save();
        }
    }

    async markRead() {
        this._logThing.log("Marking read");
        let startTime = Date.now();

        let colls = this.buildWorkList();
        for(let i of colls) {
            let startOfCollection = takeFirst(this._conf.maxIdCache, await this.getNewDeviations(i[1].username, i[1].collection));
            let deviations = Array.from(startOfCollection).reverse();
            for(let j of deviations) {
                this._cache.add(j.collection, j.deviationid);
                await this._cache.save();
            }
        }

        this._logThing.log(`Done marking read (took ${Date.now() - startTime}ms)`);
    }

    async getNewDeviations(username: string, collection: string) : Promise<CollectedDeviation[]> {
        let collected : CollectedDeviation[] = [];

        let seenCount = 0;
        for await (let i of this.getDeviations(username, collection)) {
            if (this._cache.testSeen(collection, i.deviationid)) { break; }
            collected.push(i);
        }

        return collected;
    }

    async* getDeviations(username: string, collection: string) : AsyncIterableIterator<CollectedDeviation> {
        let requestoptions : da.GetFolderContentsOptions = {
            folderid: collection,
            username: username,
            mature_content: true
        }
        while(true) {
            let folderpage = await this._da.getFolder(requestoptions);
            let collectionName = folderpage.name || this._collectionNames.get(collection) || collection;
            yield* folderpage.results.map(i => Object.assign({collection, collectionName}, i));
            if(!folderpage.has_more) { break; }
            requestoptions.offset = folderpage.next_offset;
        }
    }

    async augmentDeviations(input : CollectedDeviation[]) : Promise<DeviationWithMetadata[]> {
        // There are unlikely to be duplicates, but let's account for it anyway so
        // we don't make redundant requests.
        let ids = new Map<string, number[]>();
        input.forEach( (d, idx) => {
            let l = ids.get(d.deviationid);
            if(!l) {
                l = [];
                ids.set(d.deviationid, l);
            }
            l.push(idx);
        });

        let metadatas : Map<string, dat.DeviationMetadata> = new Map();
        
        for (let things of slices(ids, this._da.GETMETADATA_CHUNK_SIZE)) {
            let idchunk = things.map(i => i[0]);
            let result = await this._da.getDeviationMetadata(idchunk, {});
            for (let dm of result.metadata) {
                metadatas.set(dm.deviationid, dm);
            }
        }

        let output : DeviationWithMetadata[] = [];
        for(let cd of input) {
            let dm = metadatas.get(cd.deviationid);
            if(dm) {
                output.push({metadata: dm, ...cd});
            }
            else {
                output.push({...cd});
            }
        }

        return Promise.resolve(output);
    }

    startTyping() : void {
        let chans = unique(this._conf.notifyMappings.map(i => i.channel));
        for (let i of chans) {
            let chan = getChannel(this._discord, i);
            if(chan) { chan.startTyping(); }
        }
    }

    stopTyping() : void {
        let chans = unique(this._conf.notifyMappings.map(i => i.channel));
        for (let i of chans) {
            let chan = getChannel(this._discord, i);
            if(chan) { chan.stopTyping(true); }
        }
    }

    async populateCollectionNames() : Promise<void> {
        if(this._collectionNameTimer > 0) {
            this._collectionNameTimer--;
            return;
        }

        let users = unique(this._conf.notifyMappings.map(i => i.username));
        for(let i of users) {
            let off = 0;
            while(true) {
                let requestOptions : da.GetFoldersOptions = {
                    username: i,
                    calculateSize: false,
                    preload: false,
                    limit: 50,
                    offset: off
                };
                try {
                    let result = await this._da.getGalleryFolders(requestOptions);
                    for(let i of result.results) {
                        this._collectionNames.set(i.folderid, i.name);
                    }
                    if(result.has_more) {
                        off += 50;
                    }
                    else {
                        break; 
                    }
                }
                catch(e) {
                    this._logThing.log(format("Failed to get collection names for %s with offset %d", i, off));
                    break;
                }
            }
        }
        this._collectionNameTimer = COLLECTION_NAME_UPDATE_INTERVAL;
    }
}
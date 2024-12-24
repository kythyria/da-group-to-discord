import * as Discord from "discord.js";
import * as da from './deviantart/api'
import * as dat from './deviantart/api/datatypes';
import * as conf from './configuration';
import { unique, slices, takeFirst } from './util';
import * as path from "path";
import { IdCache } from "./idcache";
import { makeEmbedForDeviation } from "./embedmaker";
import { DiscordLogThing, LogStatistics } from "./discordlogthing";
import { format } from "util";
import { DEVIANTART_ICON } from "./constants";

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
    _statusRecorder : DiscordPollLog;

    constructor(config : conf.ConfigFile, discord : Discord.Client, deviantart : da.Api, logThing : DiscordLogThing, statusRecorder: DiscordPollLog) {
        this._conf = config;
        this._discord = discord;
        this._da = deviantart;

        this._cache = new IdCache(path.join(config.dataDirectory, "pollcache.json"), config.maxIdCache);
        this._cache.load();

        this._collectionNames = new Map();
        this._collectionNameTimer = 0;
        this._logThing = logThing;
        this._statusRecorder = statusRecorder;
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
            console.log("Starting poll timer");
            this._timer = this._discord.setInterval(this.poll.bind(this), this._conf.pollInterval);
        }
    }

    stop() : void {
        if(this._timer) {
            console.log("Stopping poll timer")
            this._discord.clearInterval(this._timer);
            this._timer = undefined;
        }
    }

    async poll() : Promise<void> {
        //console.log("Polling");
        let startTime = Date.now();

        let stats = await this._logThing.catch("poll", this.pollWork());

        console.log(`Poll ended (new: ${stats["newItems"].value}, posted: ${stats["posted"].value}, time: ${Date.now() - startTime})`);
        /*this._logThing.submitLogItem({
            short: "Poll ended",
            statistics: {
                ...stats,
                time: { value: Date.now() - startTime, coalesces: true }
            }
        });*/
    }

    async pollWork() : Promise<LogStatistics> {
        await this.populateCollectionNames();

        let stats = {
            posted: {value: 0, coalesces: false },
            newItems: {value: 0, coalesces: false }
        };
        
        let colls = this.buildWorkList();
        let deviations : CollectedDeviation[] = []
        for(let i of colls) {
            deviations = deviations.concat(await this.getNewDeviations(i[1].username, i[1].collection));
        }

        stats.newItems.value = deviations.length;

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
            stats.posted.value++;
        }
        await this._statusRecorder.update(stats.newItems.value - withEmbeds.length, withEmbeds.length);

        return stats;
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

export class DiscordPollLog {
    discord: Discord.Client;
    logTo : string;
    ts_fmt: Intl.DateTimeFormat;
    previous_message?: Discord.Message;
    posted_today: number;
    last_new: Date;

    constructor(discord: Discord.Client, logTo : string) {
        this.discord = discord;
        this.logTo = logTo;
        this.ts_fmt = new Intl.DateTimeFormat("en-gb", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            timeZone: "UTC",
            timeZoneName: "short",
        });
        this.posted_today = 0;
        this.last_new = new Date();
    }

    buildLogEmbed(posted: number, to_post: number, last_new: Date) {
        return new Discord.RichEmbed({
            title: "Deviantart group relay",
            description: `Posted today: ${posted}\nRemaining to post: ${to_post}`,
            footer: {
                text: `Last new item seen at ${this.ts_fmt.format(last_new)}`,
                icon_url: DEVIANTART_ICON
            }
        });
    }

    async update(remaining: number, newly_posted: number) {
        let prev_ts = this.previous_message ? this.previous_message.createdAt : undefined;
        let curr_ts = new Date();
        if(!prev_ts || prev_ts.getDay() != curr_ts.getUTCDay()) {
            this.previous_message = undefined;
            this.posted_today = newly_posted;
        }
        else {
            this.posted_today += newly_posted;
        }
        this.last_new = curr_ts;

        let embed = this.buildLogEmbed(remaining, this.posted_today, this.last_new);
        if(this.previous_message) {
            await this.previous_message.edit(this.previous_message.content, {
                embed: embed
            });
        }
        else {
            let logChannelRaw = this.discord.channels.get(this.logTo);
            if(!logChannelRaw) {
                throw new Error("Log channel doesn't exist");
            }
            let logChannel : Discord.TextBasedChannelFields;
            if(logChannelRaw.type == "text") {
                logChannel = <Discord.TextChannel>logChannelRaw;
            }
            else if (logChannelRaw.type == "dm") {
                logChannel = <Discord.DMChannel>logChannelRaw;
            }
            else {
                throw new Error("Log channel isn't postable to");
            }

            let msgs = await logChannel.send("", {
                embed: embed
            });
            if(msgs instanceof Array) { this.previous_message = msgs[0]; }
            else { this.previous_message = msgs; }
        }
    }
}
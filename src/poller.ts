import * as Discord from "discord.js";
import * as da from './deviantart/api'
import * as dat from './deviantart/datatypes';
import * as conf from './configuration';
import { unique, slices } from './util';
import { stringify } from "querystring";
import * as path from "path";
import { IdCache } from "./idcache";
import { makeEmbedForDeviation } from "./embedmaker";

interface PollWorkItem {
    username: string,
    collection: string,
    channels: PollWorkItemChannel[],
    deviations: dat.DeviationInfo[]
}

interface PollWorkItemChannel {
    channel: string,
    maturity: conf.MaturityFilter,
    deviationType: conf.DeviationType
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
 * Save the ID cache // here so that a crash doesn't eat anything. At-least-once rather than at-most-once
 */

export class Poller {
    _conf : conf.ConfigFile;
    _discord : Discord.Client;
    _da : da.Api;
    _cache : IdCache;

    constructor(config : conf.ConfigFile, discord : Discord.Client, deviantart : da.Api) {
        this._conf = config;
        this._discord = discord;
        this._da = deviantart;

        this._cache = new IdCache(path.join(config.dataDirectory, "pollcache.json"), config.maxIdCache);
        this._cache.load();
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
                deviationType: i.deviationType
            });
        }
        return list;
    }

    async poll() : Promise<void> {
        let colls = this.buildWorkList();
        let deviations : CollectedDeviation[] = []
        for(let i of colls) {
            deviations = deviations.concat(await this.getNewDeviations(i[1].username, i[1].collection));
        }
        deviations = deviations.reverse();
        deviations = deviations.slice(0, this._conf.maxNewDeviations);

        let ad = await this.augmentDeviations(deviations);

        let withEmbeds = ad.map( i => ({...i, embed: makeEmbedForDeviation(i, i.metadata)}));

        for(let i of withEmbeds) {
            let workitem = colls.get(i.collection);
            if(!workitem) { continue; }
            
            let promises : Promise<any>[] = [];

            for(let j of workitem.channels) {
                if((j.maturity == "mature" && i.is_mature)
                    || (j.maturity == "innocent" && !i.is_mature)
                    || j.maturity == "all"
                ) {
                    let chan = getChannel(this._discord, j.channel);
                    if(!chan) { continue; }
                    
                    await chan.send(`Added to \`${workitem.username}/${i.collectionName}\`: <${i.url}>`, i.embed);
                }
            }
            this._cache.add(i.collection, i.deviationid);
            await this._cache.save();
        }
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
            yield* folderpage.results.map(i => Object.assign({collection: collection, collectionName: folderpage.name||collection}, i));
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
}
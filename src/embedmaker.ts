import { RichEmbed } from "discord.js";
import * as dat from './deviantart/api/datatypes';
import { daHtmlToDfm } from './formatconverter';
import { DEVIANTART_ICON, DISCORD_MAX_EMBED_DESCRIPTION, DEVIANTART_NOENTRY_PREFIX } from "./constants";
import {
    DeviationInfo as EclipseDeviation,
    DeviationExtended as EclipseDeviationExtended,
    AuthorInfo as EclipseAuthor,
    FileInfo as EclipseFile,
    MediaInfoEntry
} from "./deviantart/scrapers/eclipsedeviationpage";


export interface makeEmbedOpts {
    metadata? : dat.DeviationMetadata,
    postedWhere?: string
};

export function makeEmbedForDeviation(devinfo : dat.DeviationInfo, options: makeEmbedOpts ) : RichEmbed {
    let embed = new RichEmbed();
     
    if (devinfo.published_time) {
        let pubtime = new Date(Number.parseInt(devinfo.published_time) * 1000);
        embed.setTimestamp(pubtime);
    }
    
    options.postedWhere = options.postedWhere || "deviantART";
    embed.setFooter(`Posted to ${options.postedWhere}`, DEVIANTART_ICON);

    if(devinfo.author) {
        embed.setAuthor(devinfo.author.username, devinfo.author.usericon);
    }
    if(devinfo.title) {
        embed.setTitle(devinfo.title);
    }
    if(devinfo.url) {
        embed.setURL(devinfo.url);
    }

    if(devinfo.content) {
        embed.setImage(devinfo.content.src);
    }
    else {
        let maybe_thumbs: dat.ImageInfo[] = [];
        if(devinfo.thumbs) {
            maybe_thumbs = maybe_thumbs.concat(devinfo.thumbs);
        }
        if(devinfo.social_preview) {
            maybe_thumbs.push(devinfo.social_preview);
        }
        let ordered = maybe_thumbs.sort((a,b) => {
            let l = a.width, r = b.width;
            if (l > r) { return -1; }
            if (l < r) { return 1; }
            return 0;
        });
        if(ordered.length >= 1) {
            embed.setThumbnail(ordered[0].src);
        }
    }

    if(!options.metadata) {
        embed.setDescription("`<unknown>`");
        return embed;
    }

    let rawdesc = options.metadata.description;
    let desc = daHtmlToDfm(rawdesc);
    if(desc.length > DISCORD_MAX_EMBED_DESCRIPTION) {
        desc = desc.slice(0, DISCORD_MAX_EMBED_DESCRIPTION) + "...";
    }
    embed.setDescription(desc);

    return embed;
}

function collateFileInfo(left: EclipseFile, right: EclipseFile) : number {
    if (left.width > right.width) { return -1; }
    if (left.width < right.width) { return 1; }
    
    if(left.type == "fullview" && right.type != "fullview") { return -1; }
    if(left.type != "fullview" && right.type == "fullview") { return 1; }

    return 0;
}

function collateMediaInfoEntry(left: MediaInfoEntry, right: MediaInfoEntry) : number {
    if (left.w > right.w) { return -1; }
    if (left.w < right.w) { return 1; }
    
    if(left.t == "fullview" && right.t != "fullview") { return -1; }
    if(left.t != "fullview" && right.t == "fullview") { return 1; }

    return 0;
}

export function makeEmbedForEclipseData(deviation: EclipseDeviation, extended: EclipseDeviationExtended, author: EclipseAuthor, postedWhere?: string) : RichEmbed {
    let embed = new RichEmbed();

    embed.setTimestamp(new Date(deviation.publishedTime));

    postedWhere = postedWhere || "deviantART";
    embed.setFooter(`Posted to ${postedWhere}`, DEVIANTART_ICON);

    embed.setAuthor(author.username, author.usericon);
    embed.setTitle(deviation.title);
    embed.setURL(deviation.url);
    
    let url : string | undefined;
    if(deviation.files) {
        let ordered = deviation.files
            .filter(i => !i.src.startsWith(DEVIANTART_NOENTRY_PREFIX))
            .sort(collateFileInfo)
            .map(i => i.src);
        if(ordered[0]) {
            url = ordered[0];
        }
    }
    else if(deviation.media) {
        let types = deviation.media.types
            .filter(i => i.c || (i.s && !i.s.startsWith(DEVIANTART_NOENTRY_PREFIX)))
            .sort(collateMediaInfoEntry);
        if(types[0].s) {
            url = types[0].s;
        }
        else if (types[0].c) {
            let token = typeof deviation.media.token == "string" ? deviation.media.token : deviation.media.token[types[0].r];
            let c = types[0].c
                .replace(/q_\d+,/, "q_100,")
                .replace("<prettyName>", deviation.media.prettyName);
            url = deviation.media.baseUri + "/" + c + "?token=" + token;
        }
        else {
            throw new Error("Deviation mediainfo structure changed again!");
        }
    }
    
    if(url) {
        embed.setImage(url);
    }

    embed.setDescription(daHtmlToDfm(extended.description));

    return embed;
}
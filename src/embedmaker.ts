import { RichEmbed } from "discord.js";
import * as dat from './deviantart/datatypes';
import { daHtmlToDfm } from './formatconverter';
import { DEVIANTART_ICON, DISCORD_MAX_EMBED_DESCRIPTION } from "./constants";

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
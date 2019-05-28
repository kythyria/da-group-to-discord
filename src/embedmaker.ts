import { RichEmbed } from "discord.js";
import * as dat from './deviantart/datatypes';
import { daHtmlToDfm } from './formatconverter';

const DISCORD_MAX_EMBED_DESCRIPTION = 2040;

export function makeEmbedForDeviation(devinfo : dat.DeviationInfo, metadata? : dat.DeviationMetadata) : RichEmbed {
    let embed = new RichEmbed();
    if (devinfo.published_time) {
        let pubtime = new Date(Number.parseInt(devinfo.published_time) * 1000);
        let timestr = pubtime.toLocaleString("en-GB-u-hc-h23", {
           timeZone: "UTC",
           year: "numeric",
           month: "long",
           day: "numeric",
           hour: "2-digit",
           minute: "2-digit",
           hour12: false 
        });
        embed.setFooter(`Posted to deviantART on ${timestr}`, "https://st.deviantart.net/emoticons/d/deviantart.png");
    }
    else {
        embed.setFooter(`Posted to deviantART at an unknown time`, "https://st.deviantart.net/emoticons/d/deviantart.png");
    }
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
    else if (devinfo.thumbs && devinfo.thumbs.length >= 1) {
        let ordered = devinfo.thumbs.sort((a,b) => {
            let l = a.width, r = b.width;
            if (l > r) { return -1; }
            if (l < r) { return 1; }
            return 0;
        });
        embed.setThumbnail(ordered[0].src);
    }

    if(!metadata) {
        embed.setDescription("`<unknown>`");
        return embed;
    }

    let rawdesc = metadata.description;
    let desc = daHtmlToDfm(rawdesc);
    if(desc.length > DISCORD_MAX_EMBED_DESCRIPTION) {
        desc = desc.slice(0, DISCORD_MAX_EMBED_DESCRIPTION) + "...";
    }
    embed.setDescription(desc);

    return embed;
}
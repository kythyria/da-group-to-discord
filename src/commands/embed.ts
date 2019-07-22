import { Description, Permission, Command, Ambient, Positional, UUIDParam, URLParam } from "../commandsystem/commandobjects";
import * as da from '../deviantart/api';
import * as dt from '../deviantart/api/datatypes'
import { inspect } from "util";
import { makeEmbedForDeviation, makeEmbedOpts } from '../embedmaker'
import { DiscordCommandEnvironment } from "../commandsystem/discordfrontend";
import { URL } from "url";
import request from 'request-promise-native';
import * as p5 from 'parse5';
import * as HtmlTools from '../htmltools';
import { tryParseURL, isUuid } from "../util";
import { CommandRegistry } from "../commandsystem/registry";

import { readConfig } from "../configuration";
import { writeFileSync } from "fs";
import * as path from 'path';

@Description("Generate the embed for a deviation by UUID")
@Permission("anyone")
export class EmbedDeviation implements Command {
    @Ambient()
    deviantart!: da.Api;

    @Positional(0, UUIDParam, "Deviation UUID")
    devId!: string;

    async run(env: DiscordCommandEnvironment) : Promise<void> {
        let response! : dt.DeviationInfo;
        try {
            response = await this.deviantart.getDeviation(this.devId);
        }
        catch(e) {
            return env.reply("API call failed:\n```JSON\n" + inspect(e.response.body, { compact: false }) + "\n```");
        }
        let message = `<${response.url}>`
        let embedopts : makeEmbedOpts = {}
        let metadataResponse : da.DeviationMetadataResponse;
        try {
            let metadataResponse = await this.deviantart.getDeviationMetadata([this.devId], {ext_submission: true, ext_stats: true})
            embedopts.metadata = metadataResponse.metadata[0];
        }
        catch(e) {
            message = `<${response.url}>\nCould not fetch deviation metadata:\n\`\`\`JSON\n${inspect(e.response.body, { compact: false })}\n\`\`\``;
        }
        let embed = makeEmbedForDeviation(response, embedopts);

        env.reply(message, embed);
    }
}

function writeFailedPage(page : string) {
    let conf = readConfig();
    let fn = path.join(conf.dataDirectory, `failpage-${new Date().toISOString().replace(/[-\:\.]/g,"")}.html`);
    writeFileSync(fn, Buffer.from(page));
}

@Description("Generate the embed for a deviation by URL")
@Permission("anyone")
export class Embed implements Command {
    @Ambient()
    deviantart!: da.Api;

    @Ambient()
    commandRegistry! : CommandRegistry;

    @Positional(0, URLParam, "URL of deviation")
    url!: URL;

    async run(env: DiscordCommandEnvironment) : Promise<void> {
        let deviationid: string;
        if((this.url.protocol == "https:" || this.url.protocol == "http:")
         && (this.url.host.endsWith(".deviantart.com") || this.url.host == "fav.me")) {
            let response : request.FullResponse = await request({
                url: this.url, 
                headers: {"User-Agent": da.FAKE_BROWSER_UA},
                resolveWithFullResponse: true,
                simple: false
            });
            if(response.statusCode != 200) {
                return env.reply("Couldn't fetch that.");
            }
            let tree = p5.parse(response.body);
            let links = HtmlTools.getMeta(tree, "da:appurl");
            if(links.length == 0) {
                writeFailedPage(response.body);
                return env.reply("Couldn't find the deviation ID in the page.");
            }
            let linkvalue = links[0].attrs.find(i => i.name == "content");
            if(!linkvalue) {
                writeFailedPage(response.body);
                return env.reply("Couldn't find the deviation ID in the page.");
            }
            let linkurl = tryParseURL(linkvalue.value);
            if(!linkurl) {
                writeFailedPage(response.body);
                return env.reply("Page contained a malformed appurl.");
            }
            else {
                this.url = linkurl;
            }
        }

        if(this.url.protocol == "deviantart:") {
            if(this.url.hostname != "deviation") {
                return env.reply("I currently only understand deviation URLs");
            }

            deviationid = this.url.pathname.substring(1);
            if(!isUuid(deviationid)) {
                return env.reply("This isn't a well-formed deviantart URL");
            }
        }
        else {
            return env.reply("This isn't a well-formed deviantart URL");
        }

        let result = await this.commandRegistry.invoke(
            "embeddeviation",
            [deviationid],
            {deviantart: this.deviantart},
            env);
        if(result.result == "fail") {
            throw new Error("Somehow invoking the Embed command failed");
        }
    }
}
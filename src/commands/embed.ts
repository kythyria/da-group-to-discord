import { Description, Permission, Command, Ambient, Positional, UUIDParam, URLParam } from "../commandsystem/commandobjects";
import * as da from '../deviantart/api';
import * as dt from '../deviantart/api/datatypes'
import { inspect } from "util";
import { makeEmbedForDeviation, makeEmbedOpts, makeEmbedForEclipseData } from '../embedmaker'
import { DiscordCommandEnvironment } from "../commandsystem/discordfrontend";
import { URL } from "url";
import request from 'request-promise-native';
import { isUuid } from "../util";
import { CommandRegistry } from "../commandsystem/registry";
import * as cheerio from 'cheerio';

import { readConfig } from "../configuration";
import { writeFileSync, promises } from "fs";
import * as path from 'path';
import { extractAppUrl } from "../deviantart/scrapers/legacydeviationpage";
import { Result, BasicError, succeed } from "../result";
import { extractRawData } from "../deviantart/scrapers/eclipsedeviationpage";

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
        let res1 = await this.handleDaUrl(this.url, env);
        if(res1.result == "success") {
            return;
        }

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
            
            let $ = cheerio.load(response.body);
            let legacyresult = extractAppUrl($);

            if(legacyresult.result == "success") {
                let res2 = await this.handleDaUrl(legacyresult.value, env);
                if(res2.result == "success") {
                    return;
                }
                else {
                    legacyresult = res2;
                }
            }

            let eclipseResult = extractRawData($);

            if(eclipseResult.result == "success") {
                let ev = eclipseResult.value;
                let emb = makeEmbedForEclipseData(ev.deviation, ev.extended, ev.author);
                let message = `<${ev.deviation.url}>`;
                return env.reply(message, emb);
            }
            
            let message = `Legacy extract failed: ${legacyresult.message}\n` +
                `Eclipse extract failed: ${eclipseResult.message}`;
            writeFailedPage(response.body);
            return env.reply(message);
        }

        let res2 = await this.handleDaUrl(this.url, env);
        if(res2.result == "success") {
            return;
        }
    }

    async handleDaUrl(url: URL, env: DiscordCommandEnvironment) : Promise<Result<void>> {
        let deviationid: string;
        if(this.url.protocol == "deviantart:") {
            if(this.url.hostname != "deviation") {
                return new BasicError("I currently only understand deviation URLs");
            }

            deviationid = this.url.pathname.substring(1);
            if(!isUuid(deviationid)) {
                return new BasicError("This isn't a well-formed deviantart URL");
            }
        }
        else {
            return new BasicError("This isn't a well-formed deviantart URL");
        }

        let result = await this.commandRegistry.invoke(
            "embeddeviation",
            [deviationid],
            {deviantart: this.deviantart},
            env);
        if(result.result == "fail") {
            throw new Error("Somehow invoking the Embed command failed");
        }
        return succeed(void 0);
    }
}
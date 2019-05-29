import * as cd from './commanddispatcher';
import { Message, MessageOptions, RichEmbed, Attachment } from 'discord.js';
import * as da from './deviantart/api';
import * as dt from './deviantart/datatypes';
import { inspect } from 'util';
import { makeEmbedForDeviation, makeEmbedOpts } from './embedmaker'
import { ConfigFile } from './configuration';
import { Poller } from './poller';
import { tryParseURL, isUuid } from './util';
import request from 'request-promise-native';
import * as p5 from 'parse5';
import * as HtmlTools from './htmltools';

export let simpleCommands : cd.CommandDefinition[] = [
    {
        name: "ping",
        description: "Provokes a response.",
        permission: cd.CommandPermission.Anyone,
        params: [],
        exec: (cmd: cd.ParsedCommand, provokingMessage: Message) => {
            cd.reply(provokingMessage, "Pong!");
            return Promise.resolve(true);
        }
    },
    {
        name: "_ping",
        description: "Internal command, called when highlighted with no command",
        permission: cd.CommandPermission.Anyone,
        params: [],
        exec: (cmd: cd.ParsedCommand, provokingMessage: Message) : Promise<boolean> => {
            if(provokingMessage.channel.type == "dm") {
                provokingMessage.channel.send("Yes?");
            }
            else {
                let msg = `Yes, <@${provokingMessage.author.id}>?`;
                provokingMessage.channel.send(msg);
            }
            return Promise.resolve(true);
        }
    }
];

export function deviantartCommands(api : da.Api, config : ConfigFile) : cd.CommandDefinition[] {
    let commands : cd.CommandDefinition[] = [
        {
            name: "galleryfolders",
            description: "Get the gallery folders for a particular deviantart user",
            permission: cd.CommandPermission.Anyone,
            params: [
                {
                    name: "user",
                    description: "Name of user to get the folder list of",
                    type: "word"
                }
            ],
            exec: async (cmd: cd.ParsedCommand, provokingMessage: Message) : Promise<boolean> => {
                let username = cmd.arguments[0][1];
                if(!username.match(/^[-a-zA-Z0-9]+$/)) {
                    cd.reply(provokingMessage, "That's not a real username");
                    return Promise.resolve(false);
                }

                let params : da.GetFoldersOptions = {
                    username: cmd.arguments[0][1],
                    calculateSize: true
                }
                let res! : da.GetGalleryFoldersResult;
                try {
                    res = await api.getGalleryFolders(params);
                }
                catch(e) {
                    cd.reply(provokingMessage, "API call failed:\n```JSON\n" + inspect(e.response.body, { compact: false }) + "\n```");
                    return Promise.resolve(false);
                }

                if(res.results.length == 0) {
                    cd.reply(provokingMessage, `${username} has no folders in their gallery`);
                    return Promise.resolve(true);
                }
                let resultText = `Folders for ${username}:`
                resultText += res.results.map(i=> `\n\t\`${i.folderid}\` ${i.name}` + (i.size ? `(${i.size})`: "" )).join("");
                cd.reply(provokingMessage, resultText);
                return Promise.resolve(true);
            }
        },
        {
            name: "listfolder",
            description: "List the contents of a gallery folder, or everything",
            permission: cd.CommandPermission.Anyone,
            params: [
                {name: "user", description: "User to examine the gallery of", type: "word"},
                {name: "galleryId", description: "UUID of folder to list (use `galleryfolders` to find)", type: "word"},
                {name: "offset", description: "How far into the gallery to start listing", type: "named"}
            ],
            exec: async (cmd: cd.ParsedCommand, provokingMessage: Message) : Promise<boolean> => {
                let args = new Map<string,string[]>(cmd.arguments.map(i => <[string,string[]]>[i[0], i.slice(1)]));

                let username = (args.get("user") || [""])[0];
                if(!username.match(/^[-a-zA-Z0-9]+$/)) {
                    cd.reply(provokingMessage, "That's not a real username");
                    return Promise.resolve(false);
                }

                let galleryId = (args.get("galleryId") || [""])[0];
                if(!galleryId.match(/^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/i)) {
                    cd.reply(provokingMessage, "That's not a real UUID");
                    return Promise.resolve(false);
                }
                
                let offset = Number.parseInt(((args.get("offset")||[""])[0]));
                if(isNaN(offset)) {
                    offset = 0;
                }

                let params : da.GetFolderContentsOptions = {
                    username: username,
                    folderid: galleryId,
                    offset: offset
                };
                let res! : da.GetFolderContentsResult;
                try {
                    res = await api.getFolder(params);
                }
                catch(e) {
                    cd.reply(provokingMessage, "API call failed:\n```JSON\n" + inspect(e.response.body, { compact: false }) + "\n```");
                    return Promise.resolve(false);
                }

                if(res.results.length == 0) {
                    cd.reply(provokingMessage, `${username} has nothing in that folder.`);
                    return Promise.resolve(true);
                }

                let genResponse = function* () : IterableIterator<string> {
                    yield `Deviations in gallery \`${galleryId}\` belonging to ${username}:`;
                    yield* res.results.map(i => `\n\t\u201C${i.title}\u201D <${i.url}> (\`${i.deviationid}\`)`);
                    if(res.has_more) {
                        yield `\nMore results: \`--offset ${res.next_offset}\``;
                    }
                }
                
                await cd.longReply(provokingMessage, genResponse());
                return Promise.resolve(true);
            }
        },
        {
            name: "embeddeviation",
            description: "Generate the embed for a deviation by UUID",
            permission: cd.CommandPermission.Anyone,
            params: [
                {name: "deviation", description: "Deviation UUID", type: "word"}
            ],
            exec: async (cmd: cd.ParsedCommand, provokingMessage: Message) : Promise<boolean> => {
                let devId = cmd.arguments[0][1];

                if(!isUuid(devId)) {
                    cd.reply(provokingMessage, "That's not a UUID.");
                    return Promise.resolve(false);
                }

                let response! : dt.DeviationInfo;
                try {
                    response = await api.getDeviation(devId);
                }
                catch(e) {
                    cd.reply(provokingMessage, "API call failed:\n```JSON\n" + inspect(e.response.body, { compact: false }) + "\n```");
                    return Promise.resolve(false);
                }
                let message = `<${response.url}>`
                let embedopts : makeEmbedOpts = {}
                let metadataResponse : da.DeviationMetadataResponse;
                try {
                    let metadataResponse = await api.getDeviationMetadata([devId], {ext_submission: true, ext_stats: true})
                    embedopts.metadata = metadataResponse.metadata[0];
                }
                catch(e) {
                    message = `<${response.url}>\nCould not fetch deviation metadata:\n\`\`\`JSON\n${inspect(e.response.body, { compact: false })}\n\`\`\``;
                }
                let embed = makeEmbedForDeviation(response, embedopts);

                cd.reply(provokingMessage, message, embed);
                return Promise.resolve(true);
            }
        },
        {
            name: "dopoll",
            description: "Manually invoke the polling/notification system",
            permission: cd.CommandPermission.Owner,
            params: [],
            exec: async (cmd: cd.ParsedCommand, provokingMessage: Message) : Promise<boolean> => {
                let poller = new Poller(config, provokingMessage.client, api);
                await poller.poll();
                return Promise.resolve(true);
            }
        },
        {
            name: "embed",
            description: "Generate the embed for a deviation by URL",
            permission: cd.CommandPermission.Anyone,
            params: [
                {name: "object", description: "URL of the thing to embed", type: "word"}
            ],
            exec: async (cmd: cd.ParsedCommand, provokingMessage: Message) : Promise<boolean> => {
                let url = tryParseURL(cmd.arguments[0][1]);
                let deviationid: string;
                if(!url) {
                    cd.reply(provokingMessage, "That isn't a URL at all.");
                    return Promise.resolve(false);
                }

                if((url.protocol == "https:" || url.protocol == "http:") && (url.host.endsWith(".deviantart.com") || url.host == "fav.me")) {
                    let response : request.FullResponse = await request({
                        url, 
                        headers: {"User-Agent": da.FAKE_BROWSER_UA},
                        resolveWithFullResponse: true,
                        simple: false
                    });
                    if(response.statusCode != 200) {
                        cd.reply(provokingMessage, "Couldn't fetch that.");
                        return Promise.resolve(false);
                    }
                    let tree = p5.parse(response.body);
                    let links = HtmlTools.getMeta(tree, "da:appurl");
                    if(links.length == 0) {
                        cd.reply(provokingMessage, "Couldn't find the deviation ID in the page.");
                        return Promise.resolve(false);
                    }
                    let linkvalue = links[0].attrs.find(i => i.name == "content");
                    if(!linkvalue) {
                        cd.reply(provokingMessage, "Couldn't find the deviation ID in the page.");
                        return Promise.resolve(false);
                    }
                    url = tryParseURL(linkvalue.value);
                    if(!url) {
                        cd.reply(provokingMessage, "Page contained a malformed appurl.");
                        return Promise.resolve(false);
                    }
                }

                if(url.protocol == "deviantart:") {
                    if(url.hostname != "deviation") {
                        cd.reply(provokingMessage, "I currently only understand deviation URLs");
                        return Promise.resolve(false);
                    }

                    deviationid = url.pathname.substring(1);
                    if(!isUuid(deviationid)) {
                        cd.reply(provokingMessage, "This isn't a well-formed deviantart URL");
                        return Promise.resolve(false);
                    }
                }
                else {
                    cd.reply(provokingMessage, "This isn't a well-formed deviantart URL");
                    return Promise.resolve(false);
                }

                let newcmd : cd.ParsedCommand = {
                    arguments: [["deviation", deviationid]],
                    commandName: "embeddeviation",
                    originalText: `embeddeviation ${deviationid}`
                };

                let embeddeviation = commands.find(i => i.name == "embeddeviation");
                if(!embeddeviation) { throw new Error("Somehow the embeddeviation command got lost"); }
                return embeddeviation.exec(newcmd, provokingMessage);
            }
        }
    ];
    return commands;
}
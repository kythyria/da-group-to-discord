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
import * as cd from './commanddispatcher';
import { Message } from 'discord.js';

export let simpleCommands : cd.CommandDefinition[] = [
    {
        name: "ping",
        description: "Provokes a response.",
        permission: cd.CommandPermission.Anyone,
        params: [],
        exec: (cmd: cd.ParsedCommand, provokingMessage: Message) => {
            if(provokingMessage.channel.type == "dm") {
                provokingMessage.channel.send("Pong!");
            }
            else {
                let msg = `<@${provokingMessage.author.id}>, pong!`;
            }
            return true;
        }
    }
];
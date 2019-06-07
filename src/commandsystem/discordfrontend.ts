import { Message, TextChannel, DMChannel, User, RichEmbed, MessageEmbedImage, GroupDMChannel } from "discord.js";
import { ReplySink, DefaultBufferedSink, CommandEnvironment, getCommandMetadata } from "./commandobjects";
import { CommandRegistry, InvokeFailure } from "./registry";
import { tryParseURL } from "../util";

const DISCORD_MESSAGE_CAP = 2000;

export interface DiscordCommandEnvironment extends CommandEnvironment {
    reply(msg: string, embed?: RichEmbed) : Promise<void>;
    output(msg: string, embed?: RichEmbed) : Promise<void>;
}

class DiscordEnvironment implements CommandEnvironment, DiscordCommandEnvironment {
    private _channel: TextChannel | DMChannel | GroupDMChannel;
    private _instigator: User;

    constructor(channel: TextChannel | DMChannel | GroupDMChannel, instigator: User) {
        this._channel = channel;
        this._instigator = instigator;
    }

    outputLong() : ReplySink {
        return new DefaultBufferedSink(DISCORD_MESSAGE_CAP, this);
    }

    replyLong() : ReplySink {
        let sink = new DefaultBufferedSink(DISCORD_MESSAGE_CAP, this);
        sink.write(this.replyString);
        return sink;
    }

    get replyString() : string {
        if(this._channel.type == "dm") {
            return "";
        }
        else {
            return `<@${this._instigator.id}>, `;
        }
    }

    reply(msg: string, embed?: RichEmbed) : Promise<void> {
        return this.output(this.replyString + msg, embed);
    }

    async output(msg: string, embed?: RichEmbed) : Promise<void> {
        await this._channel.send(msg, embed);
    }
}

export class DiscordCommandFrontend {
    private _myuid : string;
    private _owneruid : string;
    private _registry : CommandRegistry;
    private _ambient : any;

    constructor(uid: string, owneruid: string, registry: CommandRegistry, ambient: any) {
        this._myuid = uid;
        this._owneruid = owneruid;
        this._registry = registry;
        this._ambient = ambient;
    }

    async onMessage(msg: Message) : Promise<void> {
        let msgtext = msg.content;

        let selfMentioned = false;
        let mentionMatch = /^<@(\d+)>[:,]? /i.exec(msgtext);
        
        if(mentionMatch && mentionMatch[1] == this._myuid) {
            msgtext = msgtext.substr(mentionMatch[0].length);
        }
        else if(mentionMatch && mentionMatch[1] != this._myuid) {
            return;
        }

        if(!mentionMatch && msg.channel.type != "dm") {
            return;
        }
        
        let command: string, argv: string[];
        if(msgtext.trim() == "") {
            command = "ping";
            argv = [];
        }
        else {
            [command, ...argv] = this.decodeArgv(msgtext);
        }

        let env = new DiscordEnvironment(msg.channel, msg.author);

        let cmdmeta = getCommandMetadata(this._registry.command(command));
        if(command && cmdmeta.permission == "owner" && msg.author.id != this._owneruid) {
            return env.reply("You do not have permission to use this command.");
        }

        let result = await this._registry.invoke(command, argv, this._ambient, env);
        if(result.result == "success") { return; }
        else {
            this.printInvokeError(env, result);
        }
    }

    decodeArgv(cmdline: string): string[] {
        // a component of argv is
        //  maybe whitespace
        //  either
        //    a string quoted by one of ' " or any number of backticks
        //    or a string with no spaces in
        //    a string with no spaces quoted by <> but only if it's a URL
        // we don't check for URLs in this regex because that would be stupid huge.
        /*
        > console.table(["foo","<foo>",'"foo"',"'foo'","<foo bar"].reduce((a,i) => {a[i]=Array.from(reMonster.exec(i));return a;}, {}))
        ┌──────────┬─────────┬───────────┬───────────┬───────────┬───────────┬───────────┐
        │ (index)  │    0    │     1     │     2     │     3     │     4     │     5     │
        ├──────────┼─────────┼───────────┼───────────┼───────────┼───────────┼───────────┤
        │   foo    │  'foo'  │ undefined │ undefined │ undefined │ undefined │   'foo'   │
        │  <foo>   │ '<foo>' │ undefined │ undefined │  '<foo>'  │   'foo'   │ undefined │
        │  "foo"   │ '"foo"' │    '"'    │   'foo'   │ undefined │ undefined │ undefined │
        │  'foo'   │ "'foo'" │    "'"    │   'foo'   │ undefined │ undefined │ undefined │
        │ <foo bar │ '<foo'  │ undefined │ undefined │ undefined │ undefined │  '<foo'   │
        └──────────┴─────────┴───────────┴───────────┴───────────┴───────────┴───────────┘
        */
        let reMonster = /\s*(?:(["']|`+)(.+?)|(<([^\s>]+)>)|([^\s]+))\1/y
        
        let result: string[] = [];
        
        while(true) {
            let m = reMonster.exec(cmdline);
            if(m && m[4]) {
                if(tryParseURL(m[4])) {
                    result.push(m[4]);
                }
                else {
                    result.push(m[3]);
                }
            }
            else if(m) {
                result.push(m[5]||m[2]);
            }
            else {
                break;
            }
        }
        return result;
    }

    printInvokeError(env : DiscordCommandEnvironment, error : InvokeFailure) {
        let text = `Error \`${error.error}\` `;
        if(error.errorSubject) {
            text += `on ${error.errorSubject}`;
        }
        text += `: ${error.message}`;
        env.reply(text);
    }
}
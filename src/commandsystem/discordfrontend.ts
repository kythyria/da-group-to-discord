import { Message, TextChannel, DMChannel, User, RichEmbed, GroupDMChannel } from "discord.js";
import { ReplySink, DefaultBufferedSink, CommandEnvironment, CommandPermission } from "./commandobjects";
import { CommandRegistry, InvokeFailure } from "./registry";
import { tryParseURL } from "../util";
import { DISCORD_MESSAGE_CAP } from "../constants";
import { DiscordLogThing, LogMessage } from "../discordlogthing";

export interface DiscordCommandEnvironment extends CommandEnvironment {
    reply(msg: string, embed?: RichEmbed) : Promise<void>;
    output(msg: string, embed?: RichEmbed) : Promise<void>;
}

class DiscordEnvironment implements CommandEnvironment, DiscordCommandEnvironment {
    private _channel: TextChannel | DMChannel | GroupDMChannel;
    private _instigator: User;
    private _admins: string[];
    private _owner: string;
    private _logThing : DiscordLogThing;

    constructor(channel: TextChannel | DMChannel | GroupDMChannel, instigator: User, owner: string, admins: string[], logThing : DiscordLogThing) {
        this._channel = channel;
        this._instigator = instigator;
        this._admins = admins;
        this._owner = owner;
        this._logThing = logThing;
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

    async checkPermission(perm: CommandPermission) : Promise<boolean> {
        if (perm=="anyone") {
            return true;
        }
        else if (perm=="listedAdmin") {
            return this._admins.includes(this._instigator.id) || this._owner == this._instigator.id;
        }
        else if (perm=="owner") {
            return this._owner == this._instigator.id;
        }
        else {
            return false;
        }
    }

    log(msg: string) : void;
    log(item: LogMessage) : void;
    log(item: any) : void {
        if(typeof(item) == "string") {
            this._logThing.submitLogItem({short: item});
        }
        else {
            this._logThing.submitLogItem(item);
        }
    }
}

export class DiscordCommandFrontend {
    private _myuid : string;
    private _owneruid : string;
    private _registry : CommandRegistry;
    private _ambient : any;
    private _adminlist : string[];
    private _logThing : DiscordLogThing;

    constructor(uid: string, owneruid: string, registry: CommandRegistry, ambient: any, admins: string[], logThing: DiscordLogThing) {
        this._myuid = uid;
        this._owneruid = owneruid;
        this._registry = registry;
        this._ambient = ambient;
        this._adminlist = admins;
        this._logThing = logThing;
    }

    async onMessage(msg: Message) : Promise<void> {
        let msgtext = msg.content;

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

        let env = new DiscordEnvironment(msg.channel, msg.author, this._owneruid, this._adminlist, this._logThing);

        this._logThing.catch(`ProcessCommand-${command}`, async () =>{
            try {
                let result = await this._registry.invoke(command, argv, this._ambient, env);
                if(result.result == "success") { return; }
                else {
                    this.printInvokeError(env, result);
                }
            }
            catch(err) {
                let channelname = msg.channel.id;
                if(msg.channel.type == "dm") {
                    channelname = "DM";
                }
                if(msg.channel.type == "text") {
                    let tc = msg.channel as TextChannel;
                    channelname = `${tc.guild.name} - ${tc.name}`;
                }
                throw Object.assign(err, {
                    commandline: msg.content,
                    invoker: `@${msg.author.username}#${msg.author.discriminator} (${msg.author.id})`,
                    channel: channelname,               
                    messageId: msg.id
                })
            }
        });
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
import { Message, TextChannel, DMChannel, User, RichEmbed, MessageEmbedImage, GroupDMChannel } from "discord.js";
import { ReplySink, DefaultBufferedSink, CommandEnvironment } from "./commandobjects";
import { CommandRegistry, InvokeFailure } from "./registry";

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
    private _registry : CommandRegistry;
    private _ambient : any;

    constructor(uid: string, registry: CommandRegistry, ambient: any) {
        this._myuid = uid;
        this._registry = registry;
        this._ambient = ambient;
    }

    async onMessage(msg: Message) {
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

        let [command, ...argv] = this.decodeArgv(msgtext);

        let env = new DiscordEnvironment(msg.channel, msg.author);

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
        let reMonster = /\s*(?:(["']|`+)(.+?)|([^\s]+))\1/y

        let result: string[] = [];

        while(true) {
            let m = reMonster.exec(cmdline);
            if(m) {
                result.push(m[2]||m[3]);
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
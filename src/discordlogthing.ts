import { Client, TextChannel, DMChannel, Attachment, TextBasedChannelFields } from 'discord.js';
import { addIndent } from './util';
import { inspect } from 'util';
import { DISCORD_MESSAGE_CAP } from './constants';

export type Statistic = { value: number, coalescekey: boolean }
export interface LogMessageShort {short: string; statistics?: {[key: string]: Statistic} }
export interface LogMessageLong {short: string, statistics?: {[key: string]: Statistic}, long: string, filename?: string }
export type LogMessage = LogMessageShort | LogMessageLong;

export function isLongMessage(l: LogMessage) : l is LogMessageLong {
    return (!!l) && 'long' in l;
}

const REPORT_MS = 500;

function messageCombiner() {
     
}

export class DiscordLogThing {
    discord: Client;
    logTo : string;
    messageQueue: LogMessage[];
    timer? : NodeJS.Timeout;
    
    constructor(discord: Client, logTo : string) {
        this.discord = discord;
        this.logTo = logTo;
        this.messageQueue = [];
    }

    catch<T>(taskname: string, promise: PromiseLike<T>) : Promise<T>;
    catch<T>(taskname: string, func: () => PromiseLike<T>) : T;
    catch(taskname: string, thing : any) : any {
        if(typeof(thing) == "function") {
            this.catch(taskname, thing());
        }
        else {
            let fail = this.logException.bind(this, taskname);
            return (<Promise<any>>thing).catch(fail);
        }
    }

    catchSync<T>(taskname: string, func: () => T) {
        try {
            return func();
        }
        catch(err) {
            this.logException(taskname, err);
        }
    }

    log(msg: string) {
        this.submitLogItem({short: msg});
    }

    logException(taskname : string, err : any) {
        let short = [`[${taskname}] - Unhandled Error`];
        if(err.message) { short.push(`: ${err.message}`); }

        let long : string[] = [`${new Date().toISOString()} - `, short[0]];
        long.push("\n")
        if(err.stack) {
            long.push("\nStack trace:\n", addIndent(err.stack, 2), "\n")
        }
        for(let [key, value] of Object.entries(err)) {
            if(["stack", "message"].includes(key)) { continue; }
            long.push(`\n${key}:\n`);
            long.push(addIndent(inspect(value), 2));
            long.push("\n");
        }
        this.submitLogItem({short: short.join(""), long: long.join(""), filename: `error-${new Date().toISOString()}.txt`});
    }

    submitLogItem(item: LogMessage) {
        this.messageQueue.push(item);
        if(isLongMessage(item)) {
            console.log(item.long);
        }
        else {
            console.log(item.short);
        }
        this.setTimer();
    }

    setTimer() {
        if(!this.timer && this.messageQueue.length > 0) {
            this.timer = setTimeout(() => {this.postQueue(); this.timer = undefined;}, REPORT_MS);
        }
    }

    async postQueue() {
        let logChannelRaw = this.discord.channels.get(this.logTo);
        if(!logChannelRaw) {
            throw new Error("Log channel doesn't exist");
        }

        let logChannel : TextBasedChannelFields;
        if(logChannelRaw.type == "text") {
            logChannel = <TextChannel>logChannelRaw;
        }
        else if (logChannelRaw.type == "dm") {
            logChannel = <DMChannel>logChannelRaw;
        }
        else {
            throw new Error("Log channel isn't postable to");
        }

        let buf : LogMessage[] = []
        let curr = buf[0];
        for(let i of this.messageQueue) {
            if(isLongMessage(i) || isLongMessage(curr) || buf.length == 0 || (curr.short.length + i.short.length + 1) >= DISCORD_MESSAGE_CAP ) {
                let n = { ...i };
                buf.push(n);
                curr = n;
                continue;
            }
            else {
                curr.short += i.short;
            }
        }
        this.messageQueue = [];
        
        for(let i of buf) {
            let attach : Attachment|undefined;
            if(isLongMessage(i)) {
                attach = new Attachment( Buffer.from(i.long), i.filename);
            }
            // We know from up there that this *has* a send method. But discord.js 
            // doesn't have a "text-like channel" interface in its
            await logChannel.send(i.short, attach);
        }

        // we do this down here because we don't want to have messages in flight.
        if(this.timer) { clearTimeout(this.timer); }
        this.timer = undefined;

        // There might be messages already waiting, since we awaited up there.
        this.setTimer();
    }
}
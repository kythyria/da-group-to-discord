import { Client, TextChannel, DMChannel, Attachment, TextBasedChannelFields, Message } from 'discord.js';
import { addIndent, shallowArrayEquals } from './util';
import { inspect } from 'util';
import { DISCORD_MESSAGE_CAP, LOG_SUMMARY_WINDOW } from './constants';
import { invokeFailed } from './commandsystem/registry';

export type Statistic = { value: number, coalesces: boolean }
export interface LogMessageShort {short: string; statistics?: {[key: string]: Statistic} }
export interface LogMessageLong {short: string, statistics?: {[key: string]: Statistic}, long: string, filename?: string }
export type LogMessage = LogMessageShort | LogMessageLong;

export function isLongMessage(l: LogMessage) : l is LogMessageLong {
    return (!!l) && 'long' in l;
}

const REPORT_MS = 500;

function messageCombiner([existing, toAdd] : LogMessage[]) : LogMessage[] {
    if(isLongMessage(existing) || isLongMessage(toAdd)) {
        return [existing, toAdd];
    }

    if((existing.short.length + toAdd.short.length + 1) >= DISCORD_MESSAGE_CAP) {
        return [existing, toAdd];
    }

    let newMsg = { short: existing.short + "\n" + toAdd.short };
    return [newMsg];
}

interface TrackedStatistic {
    coalesces: boolean;

    // cumulative
    cma: number;
    cmax: number;
    cmin: number;

    // values in the current window
    window: number[];
    wma: number;
    wmax: number;
    wmin: number;
}

type CombineResult = {edit: string} | {append: string, attachment? : Attachment};

class Combiner {
    currentMessage?: string;
    repetitions: number;
    statistics: { [name: string]: TrackedStatistic };
    windowSize: number;
    
    constructor(windowSize: number) {
        this.statistics = {};
        this.repetitions = 0;
        this.windowSize = windowSize;
    }

    combine(newMsg: LogMessageShort) : CombineResult {
        if(newMsg.short != this.currentMessage || !this.shouldCoalesceStats(newMsg)) {
            this.resetStats(newMsg);
            return {append: this.formatSingle(newMsg)}
        }
        else {
            this.repetitions++;
            this.updateStats(newMsg);
            return {edit: this.formatSummary()};
        }
    }

    resetStats(newMsg?: LogMessageShort) {
        if(!newMsg) {
            this.currentMessage = undefined;
            this.repetitions = 0;
            this.statistics = {};
        }
        else {
            this.currentMessage = newMsg.short;
            this.repetitions = 0;
            this.statistics = {};
            for(let i of Object.entries(newMsg.statistics || {})) {
                this.statistics[i[0]] = {
                    coalesces: i[1].coalesces,
                    cma: i[1].value,
                    cmax: i[1].value,
                    cmin: i[1].value,
                    window: [i[1].value],
                    wma: i[1].value,
                    wmax: i[1].value,
                    wmin: i[1].value
                }
            }
        }
    }

    shouldCoalesceStats(newMsg: LogMessageShort) : boolean {
        let newStats = newMsg.statistics;
        if(!newStats) {
            return Object.getOwnPropertyNames(this.statistics).length == 0;
        }

        let existingNames = Object.getOwnPropertyNames(this.statistics).sort();
        let newNames = Object.getOwnPropertyNames(newMsg).sort();

        if(!shallowArrayEquals(existingNames, newNames)) {
            return false;
        }

        for(let i of newNames) {
            if(this.statistics[i].coalesces && newStats[i].coalesces) {
                continue;
            }
            else {
                return this.statistics[i].window[0] == newStats[i].value;
            }
        }
        return true;
    }

    updateStats(newMsg: LogMessageShort) {
        let newStats = Object.entries(newMsg.statistics||{});
        for(let [name, {value}] of newStats) {
            if(!value) { continue; }
            let curr = this.statistics[name];
            
            if (value < curr.cmin) { curr.cmin = value; }
            if (value > curr.cmax) { curr.cmax = value; }
            
            if(curr.window.length >= this.windowSize) {
                curr.window.pop();
            }

            curr.window.unshift(value);
            curr.wmax = curr.window.reduce((m,v) => v > m ? v : m);
            curr.wmin = curr.window.reduce((m,v) => v < m ? v : m);

            curr.cma = (value + (this.repetitions-1) * curr.cma) / this.repetitions;
            curr.wma = curr.window.reduce((m,v,i) => {
                return m + v * (this.windowSize - i);
            }, 0) / curr.window.reduce((m,v,i) => this.windowSize - i);
        }
    }

    formatSingle(msg: LogMessageShort) : string {
        let out = msg.short;
        if(msg.statistics) {
            out += " (";
            out += Object.entries(msg.statistics)
                .map(i => `${i[0]}: ${i[1].value}`)
                .join(", ");
            out += ")";
        }
        return out;
    }

    formatSummary() : string {
        let out = `${this.repetitions} identical messages.\n`;
        out += "Statistics: last/wmin/wmax/wavg cmin/cmax/cavg\n";
        out += Object.entries(this.statistics)
            .map(([name, stat]) => `\`${name}\` ${stat.window[0]}/${stat.wmin}/${stat.wmax}/${stat.wma} ${stat.cmin}/${stat.cmax}/${stat.cma}`)
            .join("\n");
        return out;        
    }
}

class DiscordLogThingCore {
    discord: Client;
    logTo : string;
    messageQueue: LogMessage[];
    oldestPendingTs?: Date;
    timer? : NodeJS.Timeout;
    timerCb : () => void;
    combiner : Combiner;
    previousMessage? : Message;

    constructor(discord: Client, logTo : string) {
        this.discord = discord;
        this.logTo = logTo;
        this.messageQueue = [];
        this.timerCb = this.postQueue.bind(this);
        this.combiner = new Combiner(LOG_SUMMARY_WINDOW);
    }

    submitLogItem(item: LogMessage) {
        
        this.messageQueue.push(item);
        if(isLongMessage(item)) {
            console.log(item.long);
        }
        else {
            console.log(this.combiner.formatSingle(item));
        }
        this.setTimer();
    }

    setTimer() {
        if(!this.timer && this.messageQueue.length > 0) {
            this.timer = this.discord.setTimeout(this.timerCb, REPORT_MS);
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
        this.oldestPendingTs = undefined;
        
        for(let i of buf) {
            let attach : Attachment|undefined;
            if(isLongMessage(i)) {
                attach = new Attachment( Buffer.from(i.long), i.filename);
            }
            await logChannel.send(i.short, attach);
        }

        // we do this down here because we don't want to have messages in flight.
        if(this.timer) { clearTimeout(this.timer); }
        this.timer = undefined;

        // There might be messages already waiting, since we awaited up there.
        this.setTimer();
    }
}

export class DiscordLogThing extends DiscordLogThingCore {
    constructor(discord: Client, logTo : string) {
        super(discord, logTo);
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
}
import { Channel, Message } from 'discord.js';
import * as StringScanner from './stringscanner';

export enum CommandPermission {
    // Sender must be owner of the bot instance.
    Owner = "owner",

    // Not implemented
    GuildAdmin = "guildAdmin",

    // Not implemented
    GuildModerator = "guildModerator",

    // Absolutely anyone
    Anyone = "anyone"
}

export interface CommandDefinition {
    name: string;
    description: string;
    params: Parameter[];
    permission: CommandPermission | ((cmd: ParsedCommand, provokingMessage: Message) => boolean);
    exec: ((cmd: ParsedCommand, provokingMessage: Message) => Promise<boolean>);
}

export interface Parameter {
    name: string;
    description: string;
    // switch: "--option" with no parameter
    // named: "--option value", value is quoted as in word
    // word: single word, or string quoted by a code block, or string quoted in double quotes.
    // trailing: the entire rest of the message, as one string
    // array: the entire rest of the message, broken into words
    type: "switch" | "named" | "word" | "trailing" | "array";
}

export interface ParsedCommand {
    originalText : string;
    commandName : string;
    arguments : string[][];
}

export interface ParseFailure {
    error: "noSuchCommand" | "genericSyntaxError" | "missingOptionValue" | "tooManyArguments" | "noSuchOption" | "argIsPositional";
    partialResult: ParsedCommand
}

export function isParseFailure(p: ParsedCommand|ParseFailure|null) : p is ParseFailure {
    return !!p && ('error' in p);
}

export function isParsedCommand(p: ParsedCommand|ParseFailure|null) : p is ParsedCommand {
    return !!p && 'commandName' in p;
}

/* command syntax:
<commandline> := <highlight> (", "|",")? <commandname> (<wsp> <parameter>)* (<wsp> <trailing>)?
<commandname> := <word>
<parameter>   := <option> | <quoted-word> | <code-span> | <word> | "--"
<option>      := "--" <word>
<quoted-word> := /"((?:.|"")*)"/
<code-span>   := /(`+)(.+)\1/
*/

export class CommandDispatcher {
    commands: CommandDefinition[];
    ownerId: string;

    constructor(cmds: CommandDefinition[]) {
        this.commands = cmds;
        this.ownerId = "";
    }

    parseMessage(msg: string, uid? : string) : ParsedCommand|ParseFailure|null {
        let reHighlight = /<@!?(\d+)>[,:]?\s+/y;
        let reWord = /()([^\s]+)/y; // to match the quoted sort
        let reWsp = /\s+/y;
        let reNoMoreOptions = /--/y;
        let reOption = /--([^\s]+)/y;
        let reQuoted = /(")((?:.|"")*)"/y;
        let reCodespan = /(`+)(.+)\1/y;

        let result : ParsedCommand = {
            originalText: msg,
            commandName: "_ping",
            arguments: []
        }

        let pusharg = (...vals : string[]) => {
            result.arguments.push(vals);
        };

        let scanner = StringScanner.scan(msg);

        let current = scanner({highlight: reHighlight});
        if(current === false) { return null; }
        if(uid) {
            if(!current || current.matches[1] != uid) {
                return null;
            }
        }

        current = scanner({word: reWord});
        if(current === false) {
            return result;
        }
        else if(current === null) {
            return result;
        }
        else {
            result.commandName = current.matches[0];
        }

        let cmddef = this.commands.find(i=> i.name == result.commandName.toLowerCase());
        if(!cmddef) {
            return { error: "noSuchCommand", partialResult: result };
        }

        let tokens = {
            option: reOption,
            noMoreOptions: reNoMoreOptions,
            word: reWord,
            quoted: reQuoted,
            codespan: reCodespan,
            wsp: reWsp
        };
        let moreOptions = true;
        let expectOptionValue = false;
        let positionals = cmddef.params.filter(i => ["word", "trailing", "array"].includes(i.type));
        if(positionals.length > 0 && positionals[0].type != "trailing") {
            while(current = scanner(tokens)) {
                if(current === null) {
                    return { error: "genericSyntaxError", partialResult: result };
                }
                else if(current.type == "wsp") {
                    continue;
                }
                else if(current.type == "word" || current.type == "quoted" || current.type == "codespan") {
                    if(expectOptionValue) {
                        result.arguments[result.arguments.length - 1 ].push(current.matches[2]);
                        expectOptionValue = false;
                    }
                    else if(positionals.length > 0) {
                        pusharg(positionals[0].name, current.matches[2]);
                        if(positionals[0].type != "array") {
                            // this dance is so that either tsc or tslint doesn't complain becuase positionals[0].type "can't" be "trailing"
                            // even after mutating it.
                            positionals.shift();
                            let p2 = positionals; 
                            if(p2.length > 0 && p2[0].type == "trailing") { break; }
                        }
                    }
                    else {
                        return { error: "tooManyArguments", partialResult: result };
                    }
                }
                else if(current.type == "option") {
                    if(moreOptions) {
                        let c = current;
                        let argdef = cmddef.params.find(i => i.name == c.matches[1].toLowerCase());
                        if(!argdef) {
                            return { error: "noSuchOption", partialResult: result };
                        }
                        if(argdef.type == "named") {
                            expectOptionValue = true;
                        }
                        else if(argdef.type != "switch") {
                            return { error: "argIsPositional", partialResult: result };
                        }
                        pusharg(argdef.name);
                    }
                    else {
                        if(expectOptionValue) {
                            result.arguments[result.arguments.length - 1 ].push(current.matches[0]);
                            expectOptionValue = false;
                        }
                        else if(positionals.length > 0) {
                            pusharg(positionals[0].name, current.matches[0]);
                            if(positionals[0].type != "array") {
                                // this dance is so that either tsc or tslint doesn't complain becuase positionals[0].type "can't" be "trailing"
                                // even after mutating it.
                                positionals.shift();
                                let p2 = positionals; 
                                if(p2.length > 0 && p2[0].type == "trailing") { break; }
                            }
                        }
                        else {
                            return { error: "tooManyArguments", partialResult: result };
                        }
                    }
                }
                else if(current.type == "noMoreOptions") {
                    if(moreOptions) { moreOptions = false; }
                    else {
                        if(expectOptionValue) {
                            result.arguments[result.arguments.length - 1 ].push(current.matches[0]);
                            expectOptionValue = false;
                        }
                        else if(positionals.length > 0) {
                            pusharg(positionals[0].name, current.matches[0]);
                            if(positionals[0].type != "array") {
                                // this dance is so that either tsc or tslint doesn't complain becuase positionals[0].type "can't" be "trailing"
                                // even after mutating it.
                                positionals.shift();
                                let p2 = positionals; 
                                if(p2.length > 0 && p2[0].type == "trailing") { break; }
                            }
                        }
                        else {
                            return { error: "tooManyArguments", partialResult: result };
                        }
                    }
                }
            }
        }
        
        if(positionals.length > 0 && positionals[0].type == "trailing") {
            current = scanner({whatever: /.*$/y});
            if(current) {
                result.arguments.push([positionals[0].name, current.matches[0]]);
            }
        }

        return result;
    }

    onMessage(msg: Message) {
        let cmd : ParsedCommand | ParseFailure | null;
        let isChannel = msg.channel.type != "dm";
        cmd = this.parseMessage(msg.content, isChannel ? msg.client.user.id : undefined);

        if(isParseFailure(cmd)) {
            this.printParseFailMessage(msg, cmd);
        }
        else if (isParsedCommand(cmd)) {
            let commandname = cmd.commandName;
            let cmddef = this.commands.find(i => i.name == commandname);
            if(cmddef) {
                if(!this.checkPermissions(msg, cmd, cmddef)) {
                    let isChannel = msg.channel.type != "dm";
                    let response = "";
                    if (isChannel) {
                        response += `<@${msg.author.id}>, `
                    }
                    response += "Insufficient permissions";
                    msg.channel.send(response);
                    return;
                }
                cmddef.exec(cmd, msg);
            }
        }
    }

    checkPermissions(msg: Message, cmd: ParsedCommand, cmddef: CommandDefinition) : boolean {
        if(typeof(cmddef.permission) == "function") {
            return cmddef.permission(cmd, msg);
        }

        if(cmddef.permission == CommandPermission.Anyone) { return true; }
        if(msg.author.id == this.ownerId) { return true; }

        return false;
    }

    printParseFailMessage(msg: Message, cmd: ParseFailure) {
        let isChannel = msg.channel.type != "dm";
        let response = "";
        if (isChannel) {
            response += `<@${msg.author.id}>, `
        }
        response += "error: "
        switch(cmd.error) {
            case "genericSyntaxError":
                response += "Syntax error.";
                break;
            case "argIsPositional":
                response += "Positional argument supplied as a named argument.";
                break;
            case "missingOptionValue":
                response += "Named argument requires a value";
                break;
            case "noSuchCommand":
                response += `\`${cmd.partialResult.commandName}\` is not a recognised command.`;
                break;
            case "noSuchOption":
                response += "Unrecognised named argument.";
                break;
            case "tooManyArguments":
                response += "Too many positional arguments.";
                break;                
        }

        msg.channel.send(response);
    }
}
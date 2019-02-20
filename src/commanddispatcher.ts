import { Message, Client as DiscordClient, User } from 'discord.js';
import * as StringScanner from './stringscanner';

export enum CommandPermission {
    Owner = "owner",
    GuildAdmin = "guildAdmin",
    GuildModerator = "guildModerator",
    Anyone = "anyone"
}

export interface CommandDefinition {
    name: string;
    description: string;
    params: Parameter[];
    permission: CommandPermission | ((cmd: ParsedCommand) => boolean);
    exec: ((cmd: ParsedCommand) => boolean);
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
    partialResult?: ParsedCommand
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

    constructor(cmds: CommandDefinition[]) {
        this.commands = cmds;
    }

    parseMessage(msg: string, uid? : string) : ParsedCommand|ParseFailure|null {
        let reHighlight = /<@!?(\d+)>/y;
        let reComma = /,[^\s]+/y;
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

        current = scanner({wsp: reWsp, comma: reComma});
        if(current === false) {
            return result;
        }
        else if(uid && current === null) {
            return result;
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
        if(positionals[0].type != "trailing") {
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
}
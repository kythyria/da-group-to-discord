import "reflect-metadata";
import { tryParseURL } from "../util";

export const COMMAND_KEY = Symbol("CommandMetadata");

export type TypeController = (param: string) => TypeControllerResult;
export type TypeControllerResult = { result: "error", message: string} | { result: "success", value: any};
export type CommandPermission = "nobody" | "anyone" | "owner"

export interface ParameterMetadata {
    name: string
    description?: string,
    optional: boolean,
    repeating: boolean,
    controller: TypeController,
    position: number | "named" | "switch" | "ambient"
}

export interface CommandMetadata {
    name: string,
    description?: string,
    permission: CommandPermission
    parameters: ParameterMetadata[],
}

function allowAllController(param: any) : TypeControllerResult {
    return {result: "success", value: param};
}

function ensureCommandMetadata(target: any) : CommandMetadata {
    let om : CommandMetadata = Reflect.getMetadata(COMMAND_KEY, target);
    if(!om) {
        om = {
            name: target.constructor.name,
            description: "",
            parameters: [],
            permission: "nobody",
        }
        Reflect.defineMetadata(COMMAND_KEY, om, target);
    }
    return om;
}

export function getCommandMetadata(target: any) : CommandMetadata {
    return Reflect.getMetadata(COMMAND_KEY, target.prototype);
}

export function Description(desc: string) {
    return function(target: any) {
        let om : CommandMetadata = ensureCommandMetadata(target.prototype);
        om.description = desc;
    }
}

export function Permission(perm: CommandPermission) {
    return function(target: any) {
        let om : CommandMetadata = ensureCommandMetadata(target.prototype);
        om.permission = perm;
    }
}

export function Ambient() : PropertyDecorator {
    return function(target: any, propertyName: string|symbol) {
        if(typeof(propertyName) == "symbol") {
            throw new Error("Parameters, even ambient ones, must have string names");
        }
        let om = ensureCommandMetadata(target);
        om.parameters.push({
            name: propertyName,
            description: "",
            optional: false,
            repeating: false,
            controller: allowAllController,
            position: "ambient"
        });
    }
}

export function Positional(position: number, typeController: any, description?: string) : PropertyDecorator {
    return function(target: any, propertyName: string|symbol) {
        if(typeof(propertyName) == "symbol") {
            throw new Error("Parameters must have string names");
        }
        let om = ensureCommandMetadata(target);
        om.parameters.push({
            name: propertyName,
            description: description,
            optional: false,
            repeating: false,
            controller: typeController,
            position: position
        });
    }
}

export function Named(typeController: any, description?: string) : PropertyDecorator {
    return function(target: any, propertyName: string|symbol) {
        if(typeof(propertyName) == "symbol") {
            throw new Error("Parameters must have string names");
        }
        let om = ensureCommandMetadata(target);
        om.parameters.push({
            name: propertyName,
            description: description,
            optional: true,
            repeating: false,
            controller: typeController,
            position: "named"
        });
    }
}

export interface ReplySink {
    write(msg: string): void;
    write(msg: Iterable<string>) : void
    flush(): Promise<void>
}

export interface CommandEnvironment {
    reply(msg: string) : Promise<void>;
    reply(msg: Iterable<string>) : Promise<void>;
    replyLong() : ReplySink;

    output(msg: string) : Promise<void>;
    output(msg: Iterable<string>) : Promise<void>;
    outputLong() : ReplySink;
}

export interface CommandFactory {
    new() : Command;
}

export interface Command {
    run(env: CommandEnvironment) : Promise<void>
}

export function URLParam(param: string) : TypeControllerResult {
    let url = tryParseURL(param);
    if(!url) {
        return {result: "error", message: "That isn't a URL at all."}
    }
    return {result: "success", value: url };
}

export function nameParam(param: string) : TypeControllerResult {
    if(param.match(/^[-a-zA-Z0-9]+$/)) {
        return {result: "success", value: param};
    }
    else {
        return {result: "error", message: "Not a valid name."};
    }
}

export function UUIDParam(param: string) : TypeControllerResult {
    if(param.match(/^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/i)) {
        return {result: "success", value: param};
    }
    else {
        return {result: "error", message: "That's not a real UUID."};
    }
}

export function intParam(param: string) : TypeControllerResult {
    let num = Number.parseInt(param)
    if(!Number.isNaN(num)) {
        return {result: "success", value: num};
    }
    else {
        return {result: "error", message: "Must be an integer."}
    }
}

export class DefaultBufferedSink implements ReplySink {
    private _msgLen: number;
    private _env: CommandEnvironment;
    private _buffer: string[];

    constructor(msgLen: number, env: CommandEnvironment) {
        this._msgLen = msgLen;
        this._env = env;
        this._buffer = [];
    }

    write(msg: Iterable<string>|string) : void {
        if(typeof(msg) == "string") {
            this._buffer.push(msg);
        }
        else {
            for(let i of msg) {
                this._buffer.push(i);
            }
        }
    }

    async flush() : Promise<void> {
        let msgbuf = "";
        for(let i of this._buffer) {
            if(msgbuf.length + i.length > this._msgLen) {
                await this._env.output(msgbuf);
                msgbuf = "";
            }
            msgbuf += i;
        }
        if(msgbuf.length > 0) {
            await this._env.output(msgbuf);
        }
    }
}

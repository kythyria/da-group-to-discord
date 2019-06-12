import { Command, COMMAND_KEY, CommandMetadata, ParameterMetadata, TypeControllerResult, CommandEnvironment, CommandFactory, getCommandMetadata } from "./commandobjects";
import { concatIterables } from "../util";

export type InvokeSuccess = { result: "success" };
export type InvokeFailure = { result: "fail", error: "nocommand" | "noparam" | "badparam" | "nopermission", message: string, errorSubject?: string, errorObject?: any }
export type InvokeResult = InvokeFailure | InvokeSuccess;
export function invokeSucceeded(res: InvokeResult) : res is InvokeSuccess {
    return res.result == "success";
}
export function invokeFailed(res: InvokeResult) : res is InvokeFailure {
    return res.result == "fail";
}

export class CommandRegistry {
    private _commands : Map<string, CommandFactory>;

    constructor() {
        this._commands = new Map();
    }

    get commands() : Map<string, CommandFactory> {
        return this._commands;
    }

    command(cmdname : string) : CommandFactory|undefined {
        return this._commands.get(cmdname);
    }

    register(cmd: CommandFactory) : void {
        let metadata = getCommandMetadata(cmd);
        this._commands.set(metadata.name.toLowerCase(), cmd);
    }

    unregister(cmd: CommandFactory|string) : void {
        if(typeof(cmd) == "string") {
            this._commands.delete(cmd);
        }
        else if(this._commands.get(cmd.name) == cmd) {
            this._commands.delete(cmd.name);
        }
        else {
            throw new Error("Tried to delete a different command with the same name or something that isn't a registered command.");
        }
    }

    registerDirectory(modules: {[path: string] : {[name: string] : CommandFactory}}) {
        for(let mod of Object.values(modules)) {
            for(let cmd of Object.values(mod)) {
                this.register(cmd);
            }
        }
    }

    async invoke(name: string, argv: string[], ambientArgs: any, environment: CommandEnvironment) : Promise<InvokeResult> {
        let command = this._commands.get(name.toLowerCase());
        if(!command) {
            return { result: "fail", error: "nocommand", message: "No command by this name."};
        }

        let descriptor : CommandMetadata = Reflect.getMetadata(COMMAND_KEY, command.prototype);
        if(!descriptor) {
            throw new Error("Attempted to invoke an object which is not a command");
        }

        let commandInstance : any = new command();

        if(!environment.checkPermission(descriptor.permission)) {
            return { result: "fail", error: "nopermission", message: "You don't have permission to do this."};
        }

        let positionals : ParameterMetadata[] = [];
        let nameds : Map<string, ParameterMetadata> = new Map();
        let ambients : ParameterMetadata[] = [];

        for(let i of descriptor.parameters) {
            if(i.position == "named" || i.position == "switch") {
                nameds.set(i.name, i);
            }
            else if(i.position == "ambient") {
                ambients.push(i);
            }
            else {
                nameds.set(i.name.toLowerCase(), i);
                positionals.push(i);
            }
        }

        positionals.sort((x,y) => (x.position as number) - (y.position as number));
        let allowNamed = true;
        for(let i = 0; i < argv.length; i++) {
            if(allowNamed && argv[i] == "--") {
                allowNamed = false;
                continue;
            }

            let paramValue : TypeControllerResult;
            let paramDesc : ParameterMetadata;

            if(allowNamed && argv[i].startsWith("--")) {
                let paramName = argv[i].substring(2);
                let maybeParamDesc = nameds.get(paramName.toLowerCase());

                if(!maybeParamDesc) {
                    return {result: "fail", error: "noparam", message: "Nonexistent parameter", errorSubject: paramName};
                }
                paramDesc = maybeParamDesc;

                if(typeof(paramDesc.position) == "number") {
                    let idx = positionals.findIndex(i => i.name == paramName);
                    if(!idx) {
                        return {result: "fail", error: "badparam", message: "Positional parameter specified twice", errorSubject: paramName};
                    }
                    positionals.splice(idx,1);
                }

                nameds.delete(paramName);

                if(paramDesc.position == "switch") {
                    paramValue = {result: "success", value: true};
                }
                else {
                    paramValue = paramDesc.controller(argv[++i]);
                }
            }
            else {
                if(positionals.length == 0) { continue; }

                let maybeParamDesc = positionals.shift();
                if(!maybeParamDesc) {
                    throw new Error("How did we get here? We checked there were positional arguments left, and yet here there are, none.");
                }
                paramDesc = maybeParamDesc;
                nameds.delete(paramDesc.name.toLowerCase());
                paramValue = paramDesc.controller(argv[i]);
            }

            if(paramValue.result == "error") {
                return {
                    result: "fail",
                    error: "badparam",
                    message: paramValue.message,
                    errorSubject: paramDesc.name
                };
            }

            if(paramDesc.repeating) {
                if (!commandInstance[paramDesc.name]) {
                    commandInstance[paramDesc.name] = [];
                }
                commandInstance[paramDesc.name].push(paramValue.value);
            }
            else {
                commandInstance[paramDesc.name] = paramValue.value;
            }
        }

        for(let i of ambients) {
            if(!Object.keys(ambientArgs).includes(i.name)) {
                throw new Error(`Ambient argument ${i.name} not present`);
            }
            commandInstance[i.name] = ambientArgs[i.name];
        }

        for (let i of concatIterables(positionals, nameds.values())) {
            if(!i.optional) {
                return {
                    result: "fail",
                    error: "noparam",
                    message: `Missing a required ${typeof(i.position) == "string" ? "named" : "positional"} argument`,
                    errorSubject: i.name,
                };
            }
        }

        await commandInstance.run(environment);

        return { result: "success"};
    }
    
}
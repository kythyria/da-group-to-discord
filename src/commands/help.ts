import { Description, Permission, Command, CommandEnvironment, Ambient, Positional, stringParam, getCommandMetadata, CommandMetadata } from "../commandsystem/commandobjects";
import { CommandRegistry } from "../commandsystem/registry";
import { concatIterables } from "../util";

@Description("Displays information about commands")
@Permission("anyone")
export class Help implements Command {
    @Ambient()
    commandRegistry! : CommandRegistry;

    @Positional(0, stringParam, "Command to get help for", {optional: true})
    command? : string;

    run(env: CommandEnvironment) : Promise<void> {
        if(this.command) {
            let cmdinfo = this.commandRegistry.command(this.command);
            if(!cmdinfo) {
                return env.reply("No such command.");
            }
            return this.specificCommand(env, getCommandMetadata(cmdinfo));
        }
        else
        {
            return this.listAllCommands(env);
        }
    }

    listAllCommands(env: CommandEnvironment) : Promise<void> {
        let out = env.outputLong();
        
        let commands = Array.from(this.commandRegistry.commands).map(i=>getCommandMetadata(i[1]));

        out.write("All commands:\n");
        for(let i of commands) {
            out.write(`\`${i.name}\` - ${i.description}\n`);
        }
        return out.flush();
    }

    specificCommand(env: CommandEnvironment, cmdinfo : CommandMetadata) : Promise<void> {
        let out = env.outputLong();
        out.write(`\`${cmdinfo.name}`);
        
        let nameds = cmdinfo.parameters.filter (i=> i.position == "named" || i.position == "switch");
        let positionals = cmdinfo.parameters.filter(i => typeof(i.position) == "number");

        for(let i of nameds) {
            let [lb,rb] = i.optional ? ["[","]"] : ["",""];
            let v = i.position == "named" ? ` <${i.name}>` : "";
            out.write(` ${lb}--${i.name}${v}${rb}`);
        }

        let bracketdepth = 0;
        for(let i of positionals) {
            let lb = "";
            if(i.optional) {
                bracketdepth++;
                lb = "[";
            }
            out.write(` ${lb}<${i.name}>`);
        }
        out.write("]".repeat(bracketdepth));
        out.write("`");
        if(cmdinfo.description) {
            out.write("\n" + cmdinfo.description);
        }
        out.write("\n");

        for(let i of concatIterables(positionals, nameds)) {
            if(i.position == "switch") {
                out.write(`\n\`--${i.name}\` ${i.description}`);
            }
            else {
                out.write(`\n\`<${i.name}>\` ${i.description}`)
            }
        }

        return out.flush();
    }
}
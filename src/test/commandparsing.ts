import { CommandDefinition, CommandDispatcher, ParsedCommand, CommandPermission } from '../commanddispatcher';

let commands : CommandDefinition[] = [
    {
        name: "foo",
        description: "Test the parser",
        exec: (cmd: ParsedCommand) => true,
        permission: CommandPermission.Anyone,
        params: [
            {name: "frobnicate", description: "Twiddle the thing", type: "switch"},
            {name: "garble", description: "Mangle the specified widget", type: "named"},
            {name: "gadget", description: "Gadget to use", type: "word"}
        ]
    },
    {
        name: "bar",
        description: "Test the parser, redux",
        exec: (cmd: ParsedCommand) => true,
        permission: CommandPermission.Anyone,
        params: [
            {name: "gadget", description: "Gadget to use", type: "word"},
            {name: "message", description: "Gadget to use", type: "trailing"}
        ]
    }
];

let disp = new CommandDispatcher(commands);
console.log(disp.parseMessage("foo --frobnicate --garble wark --garble what barrow --garble why"));
console.log(disp.parseMessage("bar what why who"));
console.log(disp.parseMessage("bar -- --gadget"));
import * as p5 from 'parse5';

export let emojiByDaEmoticon : Map<string, string> = new Map([
    ["https://e.deviantart.net/emoticons/b/biggrin.gif", "😀"],
    ["https://e.deviantart.net/emoticons/h/heart.gif", "❤️"],
]);

interface daHtmlState {
    strong: boolean;
    emph: boolean;
}

function* mapStateMany<TItem, TResult, TState>(items: Iterable<TItem>, state: TState, func : (item : TItem, state: TState) => IterableIterator<TResult>) : IterableIterator<TResult> {
    for(let i of items) {
        yield* func(i, state);
    }
}

export function daHtmlToDfm(input: string) : string {
    let inTree : any = p5.parse(input); // It's DOM-like, but with a typing that obscures this so you can't look at the children of a #text

    let inBody = inTree.childNodes[0].childNodes[1];
    let outText = "";

    let state : daHtmlState = {
        strong: false,
        emph: false
    }

    // TODO: Complete rewrite to actually emit markdown correctly rahter than just strip everything.

    function escapeText(txt : string) {
        const reMagicSymbols = /[*_`<:~]/;
        return txt.replace(reMagicSymbols, "\\$&");
    }

    function* palpableItem(i: any, state : daHtmlState) : IterableIterator<string> {
        switch(i.nodeName) {
            case "#text":
                yield escapeText(i.value);
                break;
            case "#comment":
                break;            
            case "br":
                yield "\n";
                break;
            case "img":
                let alt = i.attrs.find((j :any) => j.name == "alt");
                if(alt) {
                    let m = /:icon(.*):/.exec(alt.value);
                    if (m) {
                        yield m[1];
                    }
                    else {
                        yield alt.value;
                    }
                }
                else {
                    yield `[image]`
                }
                break;
            default:
                yield* mapStateMany(i.childNodes, state, palpableItem);
                break;
        }   
    }

    return Array.from(mapStateMany(inBody.childNodes, state, palpableItem)).join("");
}
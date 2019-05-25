import * as p5 from 'parse5';
import { stat } from 'fs';

export let emojiByDaEmoticon : Map<string, string> = new Map([
    ["https://e.deviantart.net/emoticons/b/biggrin.gif", "😀"],
    ["https://e.deviantart.net/emoticons/h/heart.gif", "❤️"],
]);

interface daHtmlState {
    strong: boolean;
    emph: boolean;
    remainingChars: number;
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
        emph: false,
        remainingChars: 768
    }

    // TODO: Complete rewrite to actually emit markdown correctly rahter than just strip everything.
    // TODO: End the truncation with a "..."

    function escapeText(txt : string) {
        const reMagicSymbols = /[*_`<:~]/;
        return txt.replace(reMagicSymbols, "\\$&");
    }

    function* palpableItem(i: any, state : daHtmlState) : IterableIterator<string> {
        if(state.remainingChars <= 0) { return; }
        switch(i.nodeName) {
            case "#text":
                let txt = escapeText(i.value);
                state.remainingChars -= txt.length;
                yield txt;
                break;
            case "#comment":
                break;            
            case "br":
                state.remainingChars--;
                yield "\n";
                break;
            case "img":
                let alt = i.attrs.find((j :any) => j.name == "alt");
                if(alt) {
                    let m = /:icon(.*):/.exec(alt.value);
                    if (m) {
                        state.remainingChars -= m[1].length;
                        yield m[1];
                    }
                    else {
                        state.remainingChars -= alt.value.length;
                        yield alt.value;
                    }
                }
                else {
                    state.remainingChars -= "[image]".length;
                    yield "[image]";
                }
                break;
            default:
                yield* mapStateMany(i.childNodes, state, palpableItem);
                break;
        }   
    }

    let result = Array.from(mapStateMany(inBody.childNodes, state, palpableItem));
    if(state.remainingChars <= 0) {
        result.push("...");
    }
    return result.join("");
}
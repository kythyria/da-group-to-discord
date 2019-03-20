import * as p5 from 'parse5';
import { ENGINE_METHOD_PKEY_METHS } from 'constants';
/*
"\"That is right... you like &nbsp;it, do you not?\" <br />
<br />
Wow.. so for this! This is a piece i have done for the incredible 
<span class=\"username-with-symbol u\">
    <a class=\"u regular username\" href=\"https://www.deviantart.com/fireskyfox\">FireSkyFox</a>
    <span class=\"user-symbol regular\" data-quicktip-text=\"\" data-show-tooltip=\"\" data-gruser-type=\"regular\"></span>
</span>
 !! :\"D
<br />
<br />
They have provided me with the amazing opportunity to draw they're oc in such a naught way! I am so pleased in the way this has turned out, 
and i worked my best on it! Even the background i am happy with! 
<img src=\"https://e.deviantart.net/emoticons/b/biggrin.gif\" width=\"15\" height=\"15\" alt=\":D\" data-embed-type=\"emoticon\" data-embed-id=\"366\" title=\":D (Big Grin)\"/> <br /><br />
Thank you so much for the commission and for letting me draw your sexy mare! I look forward to working with you again, friend! ^^<br />If you like you can commission for yourself! Just pm me! <br />Please comment and favorite! Your feedback is always welcome!"
*/
export let emojiByDaEmoticon : Map<string, string> = new Map([
    ["https://e.deviantart.net/emoticons/b/biggrin.gif", "😀"]
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
            case "br":
                yield "\n";
                break;
            case "img":
                let alt = i.attrs.find((j :any) => j.name == "alt");
                if(alt) {
                    yield alt.value;
                }
                else {
                    yield `[image]`
                }
            default:
                yield* mapStateMany(i.childNodes, state, palpableItem);
                break;
        }   
    }

    return Array.from(mapStateMany(inBody.childNodes, state, palpableItem)).join("");
}
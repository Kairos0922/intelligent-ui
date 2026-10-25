# Documentation style

This project uses ASD-STE100 Simplified Technical English (STE), Issue 9, for all English documentation.

STE is a controlled language for technical text. It uses a set of writing rules and a controlled dictionary. This guide gives the rules that apply to this repository. It does not replace the published standard.

## Scope

These documents obey this guide:

- `README.md`, `SDK.md`, `ADAPTERS.md`, and `ROADMAP.md`
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, and `CHANGELOG.md`
- `docs/` and `bench/`
- package README files and test reports
- GitHub issue forms and pull request templates

The `LICENSE` files and third-party license texts are legal texts. Do not edit them to obey STE.

Code blocks, API names, file paths, commands, and protocol strings are technical text. Keep these items accurate. Do not change them to obey STE.

## Writing rules

Use these rules for all prose:

- Use short sentences. Use a maximum of 20 words in a procedure.
- Use a maximum of 25 words in a description.
- Write one instruction in each sentence.
- Use the imperative form for steps.
- Use the active voice.
- Use one topic in each paragraph.
- Use a maximum of six sentences in a paragraph.
- Do not use contractions.
- Do not use semicolons.
- Do not use `e.g.`, `i.e.`, or `etc.`.
- Use `for example`, `that is`, or a complete list.
- Use a maximum of three words in a multi-word noun.
- Use one term for one item. Do not use synonyms for the same item.
- Define an abbreviation at the first use.
- Use American English spelling.
- Use a period at the end of a sentence.
- Use a colon to start a list.
- Do not use a phrasal verb when one verb gives the same meaning.

## Word use

Use a word only with its approved meaning. If a word is not in the STE dictionary, use a technical noun or a different sentence.

Do not use these words in prose:

- `seamless`, `robust`, `powerful`, `effortless`, `revolutionary`
- `leverage`, `utilize`, `facilitate`, `enable` as a general verb
- `cutting-edge`, `best-in-class`, `world-class`
- `simply`, `just`, `obviously`, `clearly` as filler
- `agnostic`, `empower`, `delight`
- `via`, `e.g.`, `i.e.`, `etc.`

Use these alternatives:

| Do not use | Use |
|---|---|
| `via` | `through` or `with` |
| `utilize` | `use` |
| `leverage` | `use` |
| `seamless` | `smooth` or `direct` |
| `robust` | `safe` or `reliable` |
| `agnostic` | `host-neutral` |
| `e.g.` | `for example` |
| `i.e.` | `that is` |
| `etc.` | a complete list |
| `don't` | `do not` |

## Project terms

Use these terms with these meanings:

| Term | Meaning |
|---|---|
| Intelligent UI | The project name. |
| IUI-1 | The JSON Lines protocol for one answer. |
| op | One JSON object in an IUI-1 stream. |
| block | One UI component in an answer. |
| host | The application that shows the answer. |
| adapter | A package that connects the core runtime to a host. |
| runtime | The code that compiles ops and mounts blocks. |
| answer | The assistant content for one turn. |
| answer surface | The UI area in a host that shows the answer. |
| prompt | The text or tool input that goes to the model. |
| tool | A function that the model can call. |
| action | A user interaction that can go back to the agent. |
| envelope | The `[iui-action]` message for a block action. |
| state path | A dotted path in a block `props` object. |
| demo block | A local test block for `billSplitter`, `rothCalc`, or `retroGame`. It is not part of the public repository or the SDK. |

## Check

Run this command before you commit a documentation change:

```bash
npm run check:docs
```

The checker finds selected problems, for example long sentences, contractions, banned words, and broken relative links. The checker is a guardrail. A human review is necessary for full STE compliance.

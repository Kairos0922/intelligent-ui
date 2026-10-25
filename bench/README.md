# Intelligent UI benchmark v0

The benchmark has 25 host-neutral tasks. It measures the model-facing half of Intelligent UI. Can a model produce a valid `render_iui` answer with the correct blocks for a personal-agent task?

The benchmark is not a visual quality test. It is not a model judge. It checks the wire contract, the local validator, and the shape of the result.

**Status:** The mock self-check passes. Real model results are not published. This repository has no provider credentials.

## Metrics

| Metric | Definition |
|---|---|
| Valid op rate | Raw ops that pass validation with no issue divided by all raw ops. |
| Repaired op rate | Raw ops that render only after repair divided by all raw ops. |
| Dropped op rate | Raw ops that cannot render divided by all raw ops. |
| Tasks with repair | Responses that needed one or more repairs. |
| Task success | All required block types are present with a usable data shape. The answer has unique component IDs, no more than 6 components, and at least one task keyword. |
| TTFT p50 and p95 | Time from request start to the first text or tool argument. |
| First block p50 and p95 | Time from request start to the first `comp` op in the stream. |

The first-block value is an approximation in tool mode. The runner detects the first `comp` when the tool arguments contain it. A tool-call JSON object is complete only at the end of the response. Fence mode gives the more accurate incremental value.

## Task set

The 25 tasks are in [`tasks.mjs`](tasks.mjs). They cover travel, cooking, money, health, learning, work, code, home, and decisions. Each task names the block types that a useful answer needs.

The task set includes these block groups:

- `chart` and `stats`: budgets, sales, subscriptions, trip costs, and product decisions.
- `timeline` and `calendar`: project status, launches, incidents, habits, and workouts.
- `matrix`: laptop, job-offer, and product comparisons.
- `code`, `diff`, and `fileTree`: code review and API design.
- `formula` and `flashcards`: meal quantities, renovation budgets, and study recall.
- `checklist` and `calculator`: cooking timelines.
- `packing`, `dayList`, `tabs`, `card`, `table`, and `chips`.

The task definitions are frozen for v0 after the first published run. Publish a `tasks-v1.mjs` file instead of editing this file after a results publication.

## Self-check

The self-check needs no API key.

```bash
npm run build:core
npm run bench:selfcheck
```

The mock provider sends deterministic and valid answers for each task. This is a harness test, not a model result. The expected result is 100 percent success and 0 percent repair.

The report is in `bench/results/`. Git ignores this directory.

## Real model runs

The runner accepts any OpenAI-compatible endpoint. Use environment variables for secrets. Do not put a key in a shell argument or a shared history file.

```bash
export IUI_BENCH_API_KEY=...
export IUI_BENCH_BASE_URL=https://api.openai.com/v1

# Tool mode, three models, three runs each
node bench/run.mjs --provider openai --mode tool --repeats 3 \
  --model gpt-4.1 --model gpt-4.1-mini --model o4-mini

# Fence mode, one model
node bench/run.mjs --provider openai --mode fence --repeats 3 \
  --model deepseek-chat --base-url https://api.deepseek.com/v1

# Local OpenAI-compatible endpoint
node bench/run.mjs --provider openai --mode fence \
  --base-url http://127.0.0.1:11434/v1 --model qwen2.5:14b
```

## Options

```text
--provider mock|openai        Default: mock
--mode fence|tool             Default: fence
--model <id>                  Repeatable. Required for openai.
--models <a,b>                Comma-separated alternative
--repeats <n>                 Default: 1
--base-url <url>              OpenAI-compatible base URL
--api-key <key>               Use IUI_BENCH_API_KEY or OPENAI_API_KEY
--temperature <n>             Default: 0.2
--max-tokens <n>              Default: 2400
--timeout-ms <n>              Default: 120000
--tool-choice auto|required|none
--filter <text>               Task ID, category, or prompt substring
--save-responses              Include truncated responses in the JSON file
--out <file.json>             Default: bench/results/<timestamp>.json
--list                        Print all task IDs
```

## Read a result

The runner prints a summary for each model. It writes a JSON file and a Markdown report. The Markdown report contains the summary table and the first 80 failures with the reason.

Use these rules to read the result:

- A high valid op rate with low task success shows a protocol problem. The model selects the wrong blocks or supplies too little data.
- A high repair rate with high success shows that the validator does useful work.
- A large difference between fence and tool first-block timing shows that the host should use the fence stream for progressive render.

## Limits

- The score is structural. It is not a human quality rating. A task can pass with poor prose.
- Each task has one prompt. There are no multi-turn follow-ups.
- There is no prompt-injection test suite.
- The benchmark does not test image generation.
- A response can contain model output. Keep `bench/results/` out of Git.
- Model endpoints and prices change. Record the model IDs and dates with each result.

## Repository hygiene

Git ignores `bench/results/`. Never commit an API key, a provider response, or `recon/` data. The task prompts are synthetic and safe to publish.

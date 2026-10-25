/* =========================================================================
   IUI benchmark v0 — 25 synthetic personal-agent tasks.
   -------------------------------------------------------------------------
   Each task names the block types a useful answer should contain. Scoring
   checks the rendered structure (not prose quality), because the benchmark
   measures whether a model can drive the wire format reliably.

   Keep this list stable after publishing results; add a v1 file instead of
   silently changing the denominator.
   ========================================================================= */

export const BENCH_TASKS = [
  {
    id: "travel-weekend",
    category: "travel",
    title: "Weekend itinerary",
    prompt: "Plan a relaxed two-day weekend on the Olympic Peninsula for two people who like short hikes and good coffee. Keep the driving under four hours a day.",
    keywords: ["weekend", "itinerary", "olympic"],
    required: ["dayList", "chips"],
  },
  {
    id: "cooking-roast",
    category: "cooking",
    title: "Roast chicken timeline",
    prompt: "Give me a roast chicken timeline for tonight, including when to start the potatoes and how long the bird should rest.",
    keywords: ["chicken", "roast", "potato"],
    required: ["checklist", "calculator"],
  },
  {
    id: "travel-packing",
    category: "travel",
    title: "Carry-on packing",
    prompt: "Pack for five rainy days in a coastal city in one carry-on. Include what to wear on the plane and what to wash in the sink.",
    keywords: ["carry-on", "packing", "rain"],
    required: ["packing"],
  },
  {
    id: "decision-laptops",
    category: "decision",
    title: "Laptop comparison",
    prompt: "Compare three laptops for a developer who runs local models: a 14-inch MacBook Pro, a ThinkPad X1, and a Framework 13. Show the trade-offs and recommend one.",
    keywords: ["laptop", "macbook", "framework"],
    required: ["matrix", "table"],
  },
  {
    id: "work-status",
    category: "work",
    title: "Project status",
    prompt: "Summarize the status of a software project that slipped two weeks: what changed, the current risks, and the next three milestones.",
    keywords: ["project", "risk", "milestone"],
    required: ["stats", "timeline"],
  },
  {
    id: "money-budget",
    category: "money",
    title: "Monthly budget",
    prompt: "Break down a $6,400 monthly budget for a couple in a coastal city. Show where the money goes and which two categories are easiest to cut.",
    keywords: ["budget", "rent", "savings"],
    required: ["chart", "formula"],
  },
  {
    id: "health-workout",
    category: "health",
    title: "Workout week",
    prompt: "Build a four-day beginner strength plan for next week. Include rest days, a warm-up, and a way to track completion.",
    keywords: ["workout", "strength", "rest"],
    required: ["calendar", "checklist"],
  },
  {
    id: "learning-plan",
    category: "learning",
    title: "Learning plan",
    prompt: "Make me a six-week plan to learn practical SQL for analytics, starting from spreadsheets and ending with a portfolio query set.",
    keywords: ["sql", "week", "practice"],
    required: ["timeline", "checklist"],
  },
  {
    id: "code-review",
    category: "code",
    title: "Code review",
    prompt: "Review this pull request approach: a Node service adds a cache but never invalidates it, retries writes on timeout, and logs full request bodies. List the blocking issues and a safer plan.",
    keywords: ["cache", "retry", "logging"],
    required: ["diff", "fileTree"],
  },
  {
    id: "work-incident",
    category: "work",
    title: "Incident review",
    prompt: "Write a blameless incident review for a 37-minute API outage caused by a bad config rollout. Include the timeline, impact, and three follow-ups.",
    keywords: ["incident", "outage", "config"],
    required: ["timeline", "stats"],
  },
  {
    id: "work-launch",
    category: "work",
    title: "Launch plan",
    prompt: "Plan the last two weeks before a developer-tool launch. Include freeze dates, docs review, support rotation, and the go/no-go checkpoint.",
    keywords: ["launch", "freeze", "docs"],
    required: ["calendar", "checklist"],
  },
  {
    id: "cooking-mealprep",
    category: "cooking",
    title: "Meal prep",
    prompt: "Plan Sunday meal prep for four weekday lunches with one oven session. Include a shopping quantity table and the order of operations.",
    keywords: ["meal", "lunch", "prep"],
    required: ["checklist", "formula"],
  },
  {
    id: "money-subscriptions",
    category: "money",
    title: "Subscription audit",
    prompt: "Audit these subscriptions: streaming $32/mo, two cloud storage plans $18/mo, a gym $65/mo, and four AI tools totaling $120/mo. Show the annual cost and what to cancel first.",
    keywords: ["subscription", "annual", "cancel"],
    required: ["stats", "table"],
  },
  {
    id: "decision-job-offer",
    category: "decision",
    title: "Job offer comparison",
    prompt: "Compare two job offers: one higher salary with a long commute, one lower salary with remote work and better learning. Show the trade-offs and a recommendation.",
    keywords: ["offer", "salary", "remote"],
    required: ["matrix", "stats"],
  },
  {
    id: "work-retro",
    category: "work",
    title: "Sprint retro",
    prompt: "Run a sprint retrospective for a team that missed its goal because reviews bunched up at the end. Include what went well, what to change, and two experiments.",
    keywords: ["sprint", "retro", "review"],
    required: ["checklist", "card"],
  },
  {
    id: "travel-budget",
    category: "travel",
    title: "Trip budget",
    prompt: "Estimate a seven-day Japan trip budget for one person from a West Coast city: flights, rail, hotels, food, and a $200 buffer. Show the total and the biggest lever.",
    keywords: ["japan", "flight", "hotel"],
    required: ["chart", "stats"],
  },
  {
    id: "health-habits",
    category: "health",
    title: "Habit tracker",
    prompt: "Design a two-week habit tracker for sleeping eight hours, walking 7,000 steps, and reading 20 minutes. Include a gentle restart rule for missed days.",
    keywords: ["habit", "sleep", "walk"],
    required: ["calendar", "checklist"],
  },
  {
    id: "learning-paper",
    category: "learning",
    title: "Paper summary",
    prompt: "Summarize a machine-learning paper about retrieval-augmented generation for a product manager. Include the claim, method, evidence, and one limitation.",
    keywords: ["retrieval", "paper", "evidence"],
    required: ["flashcards", "card"],
  },
  {
    id: "code-api",
    category: "code",
    title: "API design",
    prompt: "Design a small REST API for team invitations: endpoints, request/response shapes, idempotency, and the two most important error cases.",
    keywords: ["invite", "endpoint", "idempotency"],
    required: ["code", "table"],
  },
  {
    id: "work-sales",
    category: "work",
    title: "Sales dashboard",
    prompt: "Turn these numbers into a weekly sales dashboard: pipeline $820k, closed $190k, win rate 24%, average cycle 41 days, and four deals stuck in legal.",
    keywords: ["pipeline", "sales", "win"],
    required: ["chart", "stats"],
  },
  {
    id: "work-event",
    category: "work",
    title: "Event plan",
    prompt: "Plan a 40-person evening meetup in three weeks: venue, budget, run of show, volunteer roles, and a rain plan.",
    keywords: ["meetup", "venue", "volunteer"],
    required: ["calendar", "checklist"],
  },
  {
    id: "health-appointment",
    category: "health",
    title: "Appointment prep",
    prompt: "Help me prepare for a specialist appointment about recurring migraines. Include a symptom log, questions to ask, and what to bring.",
    keywords: ["migraine", "appointment", "symptom"],
    required: ["checklist", "card"],
  },
  {
    id: "work-weekly-review",
    category: "work",
    title: "Weekly review",
    prompt: "Do a weekly review of a week with three shipped tasks, two slipped tasks, and one difficult conversation. Show the pattern and next week's focus.",
    keywords: ["week", "shipped", "focus"],
    required: ["stats", "timeline"],
  },
  {
    id: "home-renovation",
    category: "home",
    title: "Renovation plan",
    prompt: "Plan a small bathroom renovation with a $12,000 budget over six weeks. Include the sequence, contingency, and the decision that most affects the schedule.",
    keywords: ["bathroom", "budget", "renovation"],
    required: ["formula", "timeline"],
  },
  {
    id: "decision-product",
    category: "decision",
    title: "Product decision",
    prompt: "We can build collaborative editing, offline mode, or better exports next quarter. Compare the options by reach, effort, and risk, then recommend one.",
    keywords: ["collaborative", "offline", "export"],
    required: ["matrix", "chart"],
  },
];

export function taskById(id) {
  return BENCH_TASKS.find((task) => task.id === id);
}

export function filterTasks(filter) {
  if (!filter) return BENCH_TASKS;
  const needle = filter.toLowerCase();
  return BENCH_TASKS.filter(
    (task) =>
      task.id.toLowerCase().includes(needle) ||
      task.category.toLowerCase().includes(needle) ||
      task.prompt.toLowerCase().includes(needle),
  );
}

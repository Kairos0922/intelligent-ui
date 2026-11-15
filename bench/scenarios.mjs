/* =========================================================================
   IUI scenario suite v1 — three product verticals.
   -------------------------------------------------------------------------
   The v0 benchmark measures whether a model can drive the wire format on 25
   mixed tasks. This suite measures whether complete, realistic tasks finish
   in each of the three stage-1a verticals:

     data-analysis  — dashboards, comparisons, provenance, filters
     daily-travel   — day plans, maps, calendars, packing, booking proposals
     daily-life     — routines, reminders, lists, schedules, budgets

   Registration is fixed before a run. Each scenario has exactly 20 tasks.
   Coverage is reported per scenario as completed tasks / registered tasks.
   A global average must never replace the three separate numbers.

   A task can require more than a usable block set:
     - requireAnswer: the first op must be a valid Answer Envelope
     - requireAction: the envelope must propose this declared action
     - interaction: a real block action followed by a second render
   ========================================================================= */

const STOP = new Set([
  "about",
  "after",
  "before",
  "daily",
  "monthly",
  "weekly",
  "plan",
  "plans",
  "planning",
  "review",
  "report",
  "summary",
  "check",
  "compare",
  "comparison",
  "analysis",
  "guide",
  "list",
  "tracker",
  "schedule",
  "routine",
  "template",
  "checklist",
]);

function keywords(title) {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP.has(word));
  const unique = [...new Set(words)];
  return (unique.length ? unique : title.toLowerCase().split(/\s+/)).slice(0, 3);
}

const DATA_BLOCKS = [
  "chart",
  "stats",
  "table",
  "matrix",
  "timeline",
  "card",
  "formula",
  "tabs",
  "checklist",
];
const TRAVEL_BLOCKS = [
  "dayList",
  "map",
  "calendar",
  "timeline",
  "checklist",
  "packing",
  "matrix",
  "table",
  "stats",
  "chips",
  "card",
  "tabs",
  "steps",
];
const LIFE_BLOCKS = [
  "checklist",
  "calendar",
  "packing",
  "calculator",
  "stats",
  "table",
  "timeline",
  "steps",
  "card",
  "formula",
  "tabs",
  "matrix",
];

/* ---------------------------------------------------------- capabilities */

const DATA_MANIFEST = {
  schemaVersion: "1.0",
  hostId: "iui-data-analysis",
  hostVersion: "1.0.0",
  locale: "en-US",
  timeZone: "UTC",
  capabilities: {
    canNotify: false,
    canPersist: true,
    canOpenWallet: false,
    canVerifyPass: false,
    canWriteCalendar: false,
    canDeepLink: true,
  },
  actions: [
    {
      name: "export_report",
      description: "Export this analysis as a CSV file",
      risk: "read",
      requiresConfirmation: false,
      idempotent: true,
      compensation: "none",
      timeoutMs: 15000,
    },
    {
      name: "filter_segment",
      description: "Filter the analysis to one customer segment",
      risk: "read",
      requiresConfirmation: false,
      idempotent: true,
      compensation: "none",
      timeoutMs: 15000,
      argsSchema: {
        type: "object",
        properties: { segment: { type: "string", minLength: 1 } },
        required: ["segment"],
      },
    },
  ],
};

const TRAVEL_MANIFEST = {
  schemaVersion: "1.0",
  hostId: "iui-daily-travel",
  hostVersion: "1.0.0",
  locale: "en-US",
  timeZone: "UTC",
  capabilities: {
    canNotify: true,
    canPersist: true,
    canOpenWallet: false,
    canVerifyPass: false,
    canWriteCalendar: true,
    canDeepLink: true,
  },
  actions: [
    {
      name: "check_availability",
      description: "Check live availability for a listed option",
      risk: "read",
      requiresConfirmation: false,
      idempotent: true,
      compensation: "none",
      timeoutMs: 20000,
      argsSchema: {
        type: "object",
        properties: { option: { type: "string", minLength: 1 } },
        required: ["option"],
      },
    },
    {
      name: "add_to_calendar",
      description: "Add the selected day plan to the calendar",
      risk: "reversible",
      requiresConfirmation: true,
      idempotent: true,
      compensation: "reversible",
      timeoutMs: 20000,
      argsSchema: {
        type: "object",
        properties: { date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
        required: ["date"],
      },
    },
  ],
};

const LIFE_MANIFEST = {
  schemaVersion: "1.0",
  hostId: "iui-daily-life",
  hostVersion: "1.0.0",
  locale: "en-US",
  timeZone: "UTC",
  capabilities: {
    canNotify: true,
    canPersist: true,
    canOpenWallet: false,
    canVerifyPass: false,
    canWriteCalendar: false,
    canDeepLink: true,
  },
  actions: [
    {
      name: "create_reminder",
      description: "Create a reminder for this item",
      risk: "reversible",
      requiresConfirmation: true,
      idempotent: true,
      compensation: "reversible",
      timeoutMs: 15000,
      argsSchema: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1 },
          at: { type: "string", minLength: 1 },
        },
        required: ["title", "at"],
      },
    },
    {
      name: "save_list",
      description: "Save this list to the host",
      risk: "reversible",
      requiresConfirmation: true,
      idempotent: true,
      compensation: "reversible",
      timeoutMs: 15000,
    },
  ],
};

/* --------------------------------------------------------------- helpers */

const TASK_KEYWORDS = {
  "travel-weekend": ["kyoto", "day 1", "day 2", "garden"],
  "travel-city": ["lisbon", "alfama", "map"],
  "travel-rain": ["indoor", "rain", "neighborhood"],
  "travel-budget": ["copenhagen", "budget", "transport"],
  "travel-family": ["amsterdam", "family", "checklist"],
  "travel-food": ["lyon", "market", "lunch", "dinner"],
  "travel-train": ["berlin", "vienna", "train", "flight"],
  "travel-packing": ["edinburgh", "packing", "rain"],
  "travel-bookable": ["porto", "calendar", "saturday"],
  "travel-road": ["denver", "moab", "route"],
  "travel-hotel": ["seville", "hotel", "availability"],
  "travel-events": ["utrecht", "events", "calendar"],
  "travel-museum": ["madrid", "museum", "ticket"],
  "travel-hike": ["innsbruck", "hike", "weather"],
  "travel-nighttrain": ["vienna", "venice", "train", "cabin"],
  "travel-visa": ["schengen", "visa", "appointment"],
  "travel-tracker": ["porto", "budget", "spending"],
  "travel-accessible": ["copenhagen", "wheelchair", "accessible"],
  "travel-multicity": ["prague", "vienna", "budapest"],
  "travel-debrief": ["lisbon", "trip", "cost"],
  "life-morning": ["morning", "routine", "backup"],
  "life-meals": ["dinner", "meal", "leftover"],
  "life-grocery": ["grocery", "budget", "aisle"],
  "life-bills": ["bills", "rent", "reminder"],
  "life-workout": ["workout", "beginner", "rest"],
  "life-cleaning": ["cleaning", "clean", "dust", "vacuum", "monthly"],
  "life-habits": ["sleep", "walking", "reading"],
  "life-weekly": ["weekly", "review", "summary"],
  "life-moving": ["moving", "packing", "checklist"],
  "life-pet": ["puppy", "vet", "feeding"],
  "life-study": ["study", "exam", "milestone"],
  "life-budget": ["income", "cost", "surplus"],
  "life-gifts": ["gift", "budget", "family"],
  "life-appointment": ["appointment", "questions", "documents"],
  "life-commute": ["commute", "door-to-door", "cost"],
  "life-errands": ["errands", "location", "saturday"],
  "life-family": ["family", "school", "appointment"],
  "life-okr": ["okr", "progress", "confidence"],
  "life-emergency": ["emergency", "kit", "dog"],
  "life-winddown": ["sleep", "screen", "wind-down", "wind down"],
};

function task(scenario, prefix, id, title, prompt, required, extra = {}) {
  const blocks = extra.blocks ?? (scenario === "data-analysis" ? DATA_BLOCKS : scenario === "daily-travel" ? TRAVEL_BLOCKS : LIFE_BLOCKS);
  const key = `${prefix}-${id}`;
  return {
    id: key,
    scenario,
    title,
    prompt,
    keywords: extra.keywords ?? TASK_KEYWORDS[key] ?? [...new Set([id, ...keywords(title)])],
    required,
    blocks: [...new Set([...required, ...blocks])],
    ...(extra.requireAnswer === undefined ? {} : { requireAnswer: extra.requireAnswer }),
    ...(extra.requireAction === undefined ? {} : { requireAction: extra.requireAction }),
    ...(extra.interaction === undefined ? {} : { interaction: extra.interaction }),
    ...(extra.data === undefined ? {} : { data: extra.data }),
    ...(extra.capabilities === undefined ? {} : { capabilities: extra.capabilities }),
  };
}

const DATA_TASKS = [
  task(
    "data-analysis",
    "data",
    "revenue",
    "Weekly revenue trend",
    "Our weekly revenue is in the attached table for the last eight weeks. Build a short analysis with the trend, the growth rate, and the one week that needs a second look. Keep it to three components.",
    ["chart", "stats"],
    {
      requireAnswer: true,
      requireAction: "export_report",
      capabilities: DATA_MANIFEST,
      data: {
        labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
        values: [42, 45, 44, 51, 49, 56, 61, 58],
      },
    },
  ),
  task(
    "data-analysis",
    "data",
    "cohort",
    "Cohort retention comparison",
    "Compare 30-day retention for the January and February cohorts. Show the curve, call out the largest gap, and add a compact table of the raw numbers.",
    ["chart", "table"],
    {
      requireAnswer: true,
      capabilities: DATA_MANIFEST,
      data: {
        labels: ["D0", "D7", "D14", "D21", "D30"],
        values: [100, 61, 44, 37, 31],
      },
    },
  ),
  task(
    "data-analysis",
    "data",
    "campaign",
    "Q3 campaign performance",
    "Review the Q3 campaign results. I need the three headline metrics, a comparison of the two channels, and a clear recommendation on where to move the next budget.",
    ["stats", "matrix"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "tickets",
    "Support ticket backlog",
    "Show the support backlog by age and priority. Flag the buckets that breach our 48-hour target and give the team a short action order.",
    ["table", "timeline"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "churn",
    "Churn driver matrix",
    "Analyze the churn drivers from the latest survey. Score each driver by impact and confidence, and put the two explanations in tabs so I can switch between the quantitative and qualitative view.",
    ["matrix", "tabs"],
    {
      requireAnswer: true,
      capabilities: DATA_MANIFEST,
      interaction: {
        kind: "block",
        action: "select",
        blockType: "tabs",
        payload: { value: "Qualitative" },
        nextValue: "Qualitative",
      },
    },
  ),
  task(
    "data-analysis",
    "data",
    "region",
    "Regional sales mix",
    "Break down sales by region for the last quarter. Show the mix, the fastest-growing region, and whether the pattern holds when the two smallest regions are excluded.",
    ["chart", "table"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "experiment",
    "Experiment readout",
    "Read out the checkout experiment. Report the primary metric, guardrail metrics, and whether the result is safe to ship. Use a compact stats block and one chart.",
    ["stats", "chart"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "funnel",
    "Funnel drop-off",
    "Where does the onboarding funnel lose the most users? Show each stage, the drop-off from the previous stage, and the single change with the best expected payoff.",
    ["chart", "stats"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "budget",
    "Budget variance",
    "Compare actual spend with the approved budget by department. Show the variance in a table and call out the two departments that need a conversation this week.",
    ["table", "stats"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "inventory",
    "Inventory risk",
    "Review inventory risk across the top SKUs. Rank stockout risk against holding cost, and add a filter action for the category the user picks.",
    ["matrix", "table"],
    {
      requireAnswer: true,
      requireAction: "filter_segment",
      capabilities: DATA_MANIFEST,
    },
  ),
  task(
    "data-analysis",
    "data",
    "nps",
    "NPS verbatim review",
    "Summarize the latest NPS verbatims. Put the score and sentiment mix in stats, then give the three recurring themes and one representative quote per theme in a card.",
    ["stats", "card"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "segments",
    "Usage segments",
    "Segment active users by usage pattern. Compare the segments on frequency, depth, and retention, then name the segment we should protect first.",
    ["matrix", "chart"],
    {
      requireAnswer: true,
      capabilities: DATA_MANIFEST,
      keywords: ["segments", "segment", "usage"],
    },
  ),
  task(
    "data-analysis",
    "data",
    "kpi",
    "Monthly KPI dashboard",
    "Build the monthly KPI dashboard. Put the four headline metrics in stats, the month-over-month trend in a chart, and add tabs for growth and efficiency so I can switch views.",
    ["stats", "chart", "tabs"],
    {
      requireAnswer: true,
      capabilities: DATA_MANIFEST,
      interaction: {
        kind: "block",
        action: "select",
        blockType: "tabs",
        payload: { value: "Efficiency" },
        nextValue: "Efficiency",
      },
    },
  ),
  task(
    "data-analysis",
    "data",
    "anomaly",
    "Anomaly review",
    "Review the alert history for the payments service. Put the incidents on a timeline, group them in a table, and tell me whether the last alert is a real anomaly or expected traffic.",
    ["timeline", "table"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "elasticity",
    "Price elasticity",
    "Estimate price elasticity from the attached price and demand points. Show the relationship in a chart and the calculation in a formula block. State the assumption behind the estimate.",
    ["chart", "formula"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "pipeline",
    "Pipeline forecast",
    "Forecast the next quarter pipeline from the current stages. Show the expected value by stage and the assumptions that would change the number most.",
    ["chart", "table"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "quality",
    "Data quality audit",
    "Audit the customer table for missing values, duplicates, and stale records. Show the defect counts, the affected columns, and a short ordered checklist for the cleanup.",
    ["stats", "checklist"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "clv",
    "Customer lifetime value",
    "Compare lifetime value for the three customer tiers. Show the payback period and the formula you used, then recommend which tier deserves more acquisition spend.",
    ["matrix", "formula"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "spend",
    "Ad spend allocation",
    "Allocate next month's ad budget across the four channels. Show current return, the proposed shift, and the risk of the shift in a matrix.",
    ["matrix", "stats"],
    { requireAnswer: true, capabilities: DATA_MANIFEST },
  ),
  task(
    "data-analysis",
    "data",
    "exec",
    "Executive data summary",
    "Write the executive data summary for the board. Lead with the conclusion, show the three headline metrics, and include the one table that supports the decision.",
    ["stats", "table"],
    {
      requireAnswer: true,
      requireAction: "export_report",
      capabilities: DATA_MANIFEST,
      keywords: ["executive", "exec", "data", "revenue"],
    },
  ),
];

const TRAVEL_TASKS = [
  task(
    "daily-travel",
    "travel",
    "weekend",
    "Weekend day plan",
    "Plan a two-day weekend in Kyoto for two people who like quiet gardens, short walks, and good coffee. Keep each day under four hours of travel and include a rainy-day swap.",
    ["dayList", "chips"],
  ),
  task(
    "daily-travel",
    "travel",
    "city",
    "Three-day city break",
    "Plan three days in Lisbon for a first-time visitor. Group the stops by neighborhood, keep the walking reasonable, and show the route on a map.",
    ["dayList", "map"],
  ),
  task(
    "daily-travel",
    "travel",
    "rain",
    "Rainy-day backup",
    "Our Saturday outdoor plan will be rained out. Give me an indoor backup that keeps the same neighborhood and budget, plus one warning about what to book early.",
    ["dayList", "card"],
  ),
  task(
    "daily-travel",
    "travel",
    "budget",
    "Weekend budget",
    "Build a realistic weekend budget for two in Copenhagen. Break down transport, food, stays, and activities, and flag the line most likely to overspend.",
    ["table", "stats"],
  ),
  task(
    "daily-travel",
    "travel",
    "family",
    "Family itinerary",
    "Plan a family day in Amsterdam with a seven-year-old and a grandparent. Keep transfers short, include two breaks, and give me a checklist for the day.",
    ["dayList", "checklist"],
  ),
  task(
    "daily-travel",
    "travel",
    "food",
    "Food-focused day",
    "Plan a food-focused day in Lyon. Include a market, a long lunch, a coffee stop, and a low-key dinner, with enough walking to balance the meals.",
    ["dayList", "card"],
  ),
  task(
    "daily-travel",
    "travel",
    "train",
    "Train versus flight",
    "Compare taking the train and flying from Berlin to Vienna for a Friday-to-Sunday trip. Show cost, door-to-door time, and the trade-off in a matrix.",
    ["matrix", "table"],
  ),
  task(
    "daily-travel",
    "travel",
    "packing",
    "Packing for a spring trip",
    "I am going to Edinburgh for four days in April. Give me a grouped packing list for wet, windy weather and a short pre-departure checklist.",
    ["packing", "checklist"],
  ),
  task(
    "daily-travel",
    "travel",
    "bookable",
    "Bookable day plan",
    "Plan next Saturday in Porto and add it to my calendar. Put the fixed times on a timeline and include a selectable calendar view. Ask before writing to the calendar.",
    ["timeline", "calendar"],
    {
      keywords: ["calendar", "porto"],
      requireAnswer: true,
      requireAction: "add_to_calendar",
      capabilities: TRAVEL_MANIFEST,
      interaction: {
        kind: "block",
        action: "select",
        blockType: "calendar",
        payload: { date: "2026-11-14" },
        setPath: "select",
        nextValue: "2026-11-14",
      },
    },
  ),
  task(
    "daily-travel",
    "travel",
    "road",
    "Road trip route",
    "Plan a four-day road trip from Denver to Moab. Show the route and overnight stops, keep daily driving under five hours, and add a filter for scenic versus easy days.",
    ["map", "dayList"],
    {
      interaction: {
        kind: "block",
        action: "filter",
        blockType: "map",
        payload: { value: "scenic" },
        setPath: "select",
        nextValue: "scenic",
      },
    },
  ),
  task(
    "daily-travel",
    "travel",
    "hotel",
    "Hotel comparison",
    "Compare three hotels in central Seville for a couple. Show price, location, breakfast, and cancellation policy, then recommend one and check live availability.",
    ["matrix", "table"],
    { requireAnswer: true, requireAction: "check_availability", capabilities: TRAVEL_MANIFEST },
  ),
  task(
    "daily-travel",
    "travel",
    "events",
    "Local events week",
    "Show the local events for the week of November 9 in Utrecht. Put them on a calendar and a timeline, and tell me which two are worth rearranging my week for.",
    ["calendar", "timeline"],
    {
      interaction: {
        kind: "block",
        action: "select",
        blockType: "calendar",
        payload: { date: "2026-11-12" },
        setPath: "select",
        nextValue: "2026-11-12",
      },
    },
  ),
  task(
    "daily-travel",
    "travel",
    "museum",
    "Museum day",
    "Plan a museum day in Madrid. Sequence the visits, include lunch and a rest, and warn me about the ticket that sells out first.",
    ["timeline", "dayList"],
  ),
  task(
    "daily-travel",
    "travel",
    "hike",
    "Hiking day",
    "Plan a day hike near Innsbruck for a moderately fit adult. Include the route, water and food stops, a weather cutoff, and a checklist for the pack.",
    ["checklist", "dayList"],
  ),
  task(
    "daily-travel",
    "travel",
    "nighttrain",
    "Night train plan",
    "Plan an overnight train from Vienna to Venice. Show the departure and arrival timeline, the cabin choice, and what to prepare before boarding.",
    ["timeline", "table"],
  ),
  task(
    "daily-travel",
    "travel",
    "visa",
    "Visa document checklist",
    "I am applying for a Schengen visa in three weeks. Give me a document checklist, the appointment timeline, and the one item people most often forget.",
    ["checklist", "card"],
  ),
  task(
    "daily-travel",
    "travel",
    "tracker",
    "Travel budget tracker",
    "Track my spending on a five-day trip to Porto. Show the budget, the amount spent so far, and the categories that are running hot.",
    ["stats", "table"],
    { keywords: ["budget", "porto"] },
  ),
  task(
    "daily-travel",
    "travel",
    "accessible",
    "Accessible itinerary",
    "Plan a wheelchair-accessible day in Copenhagen. Show the route, the accessible entrances, and a backup for each stop.",
    ["dayList", "map"],
  ),
  task(
    "daily-travel",
    "travel",
    "multicity",
    "Multi-city plan",
    "Plan a ten-day trip across Prague, Vienna, and Budapest. Show the day-by-day flow, the transfer days, and the one city where I should stay longer.",
    ["dayList", "timeline"],
    { keywords: ["prague", "vienna", "budapest"] },
  ),
  task(
    "daily-travel",
    "travel",
    "debrief",
    "Trip debrief",
    "Debrief my Lisbon trip. Show what worked, what to skip next time, and the three costs that were worth it.",
    ["stats", "card"],
  ),
];

const LIFE_TASKS = [
  task(
    "daily-life",
    "life",
    "morning",
    "Morning routine",
    "Build a 45-minute morning routine for a working parent. Keep it realistic, include a backup for late nights, and show the timing.",
    ["checklist", "calendar"],
  ),
  task(
    "daily-life",
    "life",
    "meals",
    "Weekly meal plan",
    "Plan five weeknight dinners for two people who want low-effort meals and one leftover night. Put the plan on a calendar and give me the prep order.",
    ["calendar", "checklist"],
  ),
  task(
    "daily-life",
    "life",
    "grocery",
    "Grocery run",
    "Turn this week's meal plan into a grocery run for two. Group the list by aisle, scale the quantities, and keep the total near the budget.",
    ["packing", "calculator"],
  ),
  task(
    "daily-life",
    "life",
    "bills",
    "Bill schedule",
    "Map my recurring bills for the next month. Show the dates, amounts, and the two weeks where cash flow is tightest, and create a reminder for the rent.",
    ["calendar", "table"],
    {
      requireAnswer: true,
      requireAction: "create_reminder",
      capabilities: LIFE_MANIFEST,
    },
  ),
  task(
    "daily-life",
    "life",
    "workout",
    "Workout plan",
    "Build a three-day home workout plan for a beginner. Show the step-by-step sequence, the rest days, and a simple way to track progress.",
    ["steps", "checklist"],
    {
      interaction: {
        kind: "block",
        action: "step",
        blockType: "steps",
        payload: { index: 1 },
        nextValue: 1,
      },
    },
  ),
  task(
    "daily-life",
    "life",
    "cleaning",
    "Home cleaning plan",
    "Make a weekly cleaning plan for a small apartment. Split it across weekdays, keep each session under 30 minutes, and include a monthly deep-clean checklist.",
    ["checklist", "calendar"],
  ),
  task(
    "daily-life",
    "life",
    "habits",
    "Habit tracker",
    "Set up a simple habit tracker for sleep, walking, and reading. Show the weekly target, the current streak, and the smallest version of each habit for a bad day.",
    ["stats", "calendar"],
  ),
  task(
    "daily-life",
    "life",
    "weekly",
    "Weekly review",
    "Create a 15-minute weekly review. Ask the three questions that matter, show the time plan, and put the outcome in a summary card.",
    ["checklist", "card"],
  ),
  task(
    "daily-life",
    "life",
    "moving",
    "Moving checklist",
    "I am moving apartments in six weeks. Build a week-by-week checklist, a packing plan by room, and save the list so I can come back to it.",
    ["checklist", "packing"],
    {
      requireAnswer: true,
      requireAction: "save_list",
      capabilities: LIFE_MANIFEST,
    },
  ),
  task(
    "daily-life",
    "life",
    "pet",
    "Pet care schedule",
    "Plan the week for a new puppy and a full-time job. Show feeding, walks, training, and vet reminders on a calendar, and create a reminder for the vet visit.",
    ["calendar", "checklist"],
    {
      keywords: ["puppy", "vet", "pet"],
      requireAnswer: true,
      requireAction: "create_reminder",
      capabilities: LIFE_MANIFEST,
    },
  ),
  task(
    "daily-life",
    "life",
    "study",
    "Study plan",
    "Build a four-week study plan for a professional exam. Show the weekly milestones, the daily time block, and the review points.",
    ["timeline", "checklist"],
  ),
  task(
    "daily-life",
    "life",
    "budget",
    "Personal budget check",
    "Check my monthly budget. Show income, fixed costs, flexible spending, and the formula for the surplus. Flag the one category to fix first.",
    ["stats", "formula"],
  ),
  task(
    "daily-life",
    "life",
    "gifts",
    "Gift planning",
    "Plan gifts for four family members on a 150 euro budget. Show the options in a table, keep one backup per person, and save the final list.",
    ["table", "checklist"],
    {
      requireAnswer: true,
      requireAction: "save_list",
      capabilities: LIFE_MANIFEST,
    },
  ),
  task(
    "daily-life",
    "life",
    "appointment",
    "Appointment prep",
    "Prepare me for a specialist appointment next week. Give me the questions to ask, the documents to bring, and a short checklist for the day before.",
    ["checklist", "card"],
  ),
  task(
    "daily-life",
    "life",
    "commute",
    "Commute plan",
    "Compare two commute options for a new job. Show door-to-door time, cost, and reliability, and tell me which one to try first.",
    ["timeline", "card"],
  ),
  task(
    "daily-life",
    "life",
    "errands",
    "Errand plan",
    "Plan Saturday errands around the city. Group them by location, keep the total under three hours, and show the order on a calendar.",
    ["checklist", "calendar"],
  ),
  task(
    "daily-life",
    "life",
    "family",
    "Family logistics",
    "Coordinate a week of family logistics: school runs, two appointments, and one evening event. Show the conflicts and the simplest fix.",
    ["calendar", "table"],
    {
      requireAnswer: true,
      requireAction: "create_reminder",
      capabilities: LIFE_MANIFEST,
    },
  ),
  task(
    "daily-life",
    "life",
    "okr",
    "Personal OKR check-in",
    "Check in on my personal OKRs for the quarter. Show progress, confidence, and the one objective that needs a smaller next step.",
    ["stats", "timeline"],
  ),
  task(
    "daily-life",
    "life",
    "emergency",
    "Emergency kit",
    "Build a home emergency kit for two adults and a dog. Group it by category, show what is missing, and save the list.",
    ["packing", "checklist"],
    {
      requireAnswer: true,
      requireAction: "save_list",
      capabilities: LIFE_MANIFEST,
    },
  ),
  task(
    "daily-life",
    "life",
    "winddown",
    "Evening wind-down",
    "Design a 30-minute evening wind-down for better sleep. Keep it screen-light, include a fallback for late nights, and show the steps.",
    ["checklist", "card"],
  ),
];

export const SCENARIOS = [
  {
    id: "data-analysis",
    title: "Data analysis",
    description: "Dashboards, comparisons, provenance, and filtering.",
    blocks: DATA_BLOCKS,
    capabilities: DATA_MANIFEST,
    tasks: DATA_TASKS,
  },
  {
    id: "daily-travel",
    title: "Daily travel planning",
    description: "Day plans, routes, calendars, packing, and booking proposals.",
    blocks: TRAVEL_BLOCKS,
    capabilities: TRAVEL_MANIFEST,
    tasks: TRAVEL_TASKS,
  },
  {
    id: "daily-life",
    title: "Daily life",
    description: "Routines, reminders, lists, schedules, and budgets.",
    blocks: LIFE_BLOCKS,
    capabilities: LIFE_MANIFEST,
    tasks: LIFE_TASKS,
  },
];

export const SCENARIO_TASKS = SCENARIOS.flatMap((scenario) => scenario.tasks);

export const SCENARIO_IDS = SCENARIOS.map((scenario) => scenario.id);

export function scenarioById(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

export function taskById(id) {
  return SCENARIO_TASKS.find((task) => task.id === id) ?? null;
}

export function filterScenarioTasks({ scenario, ids, limit } = {}) {
  let tasks = SCENARIO_TASKS;
  if (scenario) tasks = tasks.filter((item) => item.scenario === scenario);
  if (ids?.length) {
    const wanted = new Set(ids);
    tasks = tasks.filter((item) => wanted.has(item.id));
  }
  const count = Number(limit);
  if (Number.isInteger(count) && count > 0) tasks = tasks.slice(0, count);
  return tasks;
}

/** Every scenario must register exactly this many tasks. */
export const TASKS_PER_SCENARIO = 20;

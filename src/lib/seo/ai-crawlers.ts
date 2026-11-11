/**
 * AI crawler policy, split by what each agent actually does.
 *
 * These are named lists rather than literals inside robots.ts for one reason:
 * a test can assert an agent is in the RIGHT group. The first version of this
 * policy was guarded by tests that only checked each name appeared *somewhere*
 * in the file, which passed happily while GPTBot and ClaudeBot sat in neither
 * group and inherited the blanket "*" allow.
 *
 * The line is retrieval vs. corpus-building:
 *
 *  - SEARCH agents fetch a page to answer a question a person is asking right
 *    now, and cite the source back. That citation is the entire point — for a
 *    site whose problem is being mistaken for a fork, being the page an
 *    assistant quotes is worth more than a ranking.
 *
 *  - TRAINING agents fetch pages in bulk to build model training sets. No
 *    citation, no referral, nothing given up by refusing them.
 *
 * Two placements are worth stating explicitly, because both look wrong at a
 * glance and are not:
 *
 *  - GPTBot and ClaudeBot are TRAINING. They are the vendors' general/training
 *    crawlers, and are distinct from OAI-SearchBot and Claude-SearchBot, which
 *    are the retrieval agents behind ChatGPT search and Claude's search. Being
 *    cited by either assistant does not require the training crawler.
 *
 *  - Google-Extended is TRAINING, and this one costs something. It is a single
 *    token covering both Gemini training AND Gemini/Vertex grounding, so
 *    refusing it gives up direct Gemini grounding as well. It does NOT affect
 *    Google Search or AI Overviews, which crawl as Googlebot and are unaffected
 *    by anything in this file. Under a "training refused" policy it cannot sit
 *    in the allow group without contradicting the policy.
 *
 * robots.txt is a request, not an enforcement mechanism. A crawler that ignores
 * it is unaffected by this file; blocking that is a CDN concern, not this one.
 */

/** Retrieval agents that answer a live question and cite the source. */
export const AI_SEARCH_AGENTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
] as const;

/** Bulk crawlers that build training corpora. */
export const AI_TRAINING_AGENTS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "Applebot-Extended",
] as const;

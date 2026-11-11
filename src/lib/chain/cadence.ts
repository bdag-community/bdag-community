/**
 * Poll cadences that more than one layer has to agree on.
 *
 * There is no `server-only` import here on purpose. Everything else in
 * lib/chain talks to an upstream and must never reach a browser; this module
 * holds integers and nothing else, so the client that does the polling, the
 * route handler that answers it and the server-side cache behind that route
 * can all read the same number instead of each keeping its own copy.
 *
 * The node board used to keep three: the client polled every 10s, the cache
 * held for 20s and the route advertised s-maxage=10. Half of those requests
 * could only ever return bytes the client already had, and any future edit had
 * to find all three to stay coherent. One constant, three readers.
 */

/**
 * Node board: client poll interval, cache TTL and cache hint, in milliseconds.
 *
 * 20s is the probe cadence NODES_SECTION.refreshNote promises readers, so this
 * is the number that has to move if that sentence ever changes. Note the
 * consequence of polling at exactly the TTL: with stale-while-revalidate the
 * client is handed the snapshot assembled one cycle ago, so the "last checked"
 * age it renders runs roughly 20-40s rather than 0-20s. That is the honest
 * reading — the data really is that old — and the promise it sits next to is
 * about how often the server probes, which remains exactly every 20s.
 */
export const NODES_POLL_MS = 20_000;

/** The same cadence as an integer number of seconds, for Cache-Control. */
export const NODES_POLL_S = NODES_POLL_MS / 1000;

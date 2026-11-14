# Cache Lifetime

## Problem

A lookup can reuse a stored record after the source has changed, or it can drop a usable record to make room for one that is already too old. Three decisions prevent that. Freshness says how long the stored record may be reused. Capacity says which record leaves when the cache is full. Invalidation removes a record before that time because the caller knows the stored value should not be reused.

This page stores a person's name. Time is an integer tick the page passes in. It is not a wall clock. A record inserted at `storedAt` receives `expiresAt = storedAt + 5`. It is fresh while `now < expiresAt` and expired when `now >= expiresAt`. An insert at tick 0 is fresh at tick 4 and expired at tick 5. A hit updates recency so later eviction can see which record was used. The hit does not change `storedAt` or `expiresAt`.

The cache holds 2 records. Recency is a counter that starts at 1 and increases by 1 on every insert and every fresh hit. When a new key arrives and both slots are still occupied by fresh records, the entry with the lowest recency is the one that leaves. Two inserts in the same tick still have an order, because the counter moves when the tick does not.

`invalidate` removes that key immediately and records the reason `invalidated`. Editing the source does not invalidate. The next lookup keeps returning the stored name until the entry is invalidated or it expires.

There is no background revalidation and no network. A lookup either returns the stored value or reads the source in that same turn.

## Interactive Demonstration

The sidebar defines freshness, capacity, and invalidation. It shows the absolute check `now < storedAt + ttl`, and it names background revalidation, debouncing, request cancellation, in-flight duplicates, and retries as issues this example does not cover. Those names are text, not links. The policy stated there is TTL 5, capacity 2, hits do not extend TTL, and expired entries are dropped before LRU eviction.

The stage is the scenario toolbar, the Lookup window, and the explanation. The window has a key field, a Lookup button, the clock, the latest result, and source fields labeled Ada, Bea, and Cam. The source starts as Ada Lovelace, Bea Atlas, and Cam Rivera. Changing a field writes the source only. The explanation says what the latest state shows, then lists the cache, the evictions, and the hit/source log. The table keeps a row that is past `expiresAt` until a later read or insert removes it. Ada, Bea, and Cam each use one lane color on the source field, the cache row, and the log.

- First hit resets the clock, looks up `ada`, then looks up `ada` again. The log has one source read of Ada Lovelace and one hit. `storedAt` stays 0 and `expiresAt` stays 5.
- Expire resets, looks up `ada`, advances to tick 4, looks up `ada`, advances to tick 5, and looks up `ada` again. The lookup at 4 is a hit. The lookup at 5 drops the old row as `expired` and stores a new one with `storedAt` 5 and `expiresAt` 10.
- Stale edit resets, looks up `ada`, sets Ada's source to `Ada Lovelace (revised)`, looks up again, invalidates `ada`, and looks up again. The lookup before invalidation still shows Ada Lovelace. The page ends on Ada Lovelace (revised), logged as a source read, with an `invalidated` eviction.
- Evict resets and looks up `ada`, `bea`, then `cam`. Ada is the capacity eviction. The cache shows Bea and Cam.
- Advance 1 adds one tick. Stored rows stay where they are.
- Advance to expiry sets the clock to the smallest `expiresAt` among stored rows. An empty cache leaves the clock unchanged. The row stays in the table and reads as expired until a later lookup or insert removes it.
- Clear restores tick 0, an empty cache, empty logs, the three source names, and the key `ada`.
- An unknown key logs a miss and does not insert a row.

## Technical Approach

`createLookupCache` stores entries in insertion order and keeps the recency counter. `read`, `insert`, `invalidate`, and `snapshot` each take `now`. The cache does not store a clock of its own.

`read` returns `{ hit: false, reason: "missing" }` when the key is absent. When `now >= expiresAt` it deletes that entry, appends an eviction with reason `expired`, and returns `{ hit: false, reason: "expired" }`. When `now < expiresAt` it sets recency to the next integer and returns `{ hit: true, value }`. `storedAt` and `expiresAt` stay as they were.

`insert` first drops every stored entry with `now >= expiresAt`, each with reason `expired`. If the key is already present, it resets `value`, `storedAt`, `expiresAt` to `now + 5`, and recency. That replacement does not evict the other occupant. If the key is new and two entries remain, it evicts the lowest recency with reason `capacity`, then stores the new entry. `invalidate` removes the key when it is present and records reason `invalidated`. A missing key adds no eviction. `snapshot` returns every entry still stored, including entries that are expired and not yet removed, with freshness `fresh` or `expired`. The eviction list is capped at 50, keeping the newest rows.

`useLookup` holds the tick, the source, the cache, and a log of `{ kind: "hit" | "source" | "miss", key, value, at }` capped at 50. `lookup` calls `cache.read` at the current tick. A hit logs `hit` and does not read the source. On `expired` or `missing`, a key that exists in the source logs `source` and inserts the current source value. A key the source does not have logs `miss` with `value: null` and inserts nothing. `setSource` replaces that source value and leaves the cache alone. `advance` adds ticks. `advanceToExpiry` sets the tick to the smallest stored `expiresAt`, or leaves it when the cache is empty. `reset` returns to tick 0, the three default names, an empty cache, and empty logs.

`describeCache` is pure. An empty log produces `No lookup has run yet.` Otherwise the copy is derived from the latest log row, the freshness of stored entries, and the latest eviction.

`CacheLifetimeLab` renders that session. The tick lives in the session. The component does not call `Date.now`, `performance.now`, or `setTimeout`. Scenario buttons call reset, lookup, setSource, invalidate, and advance in one turn.

## Trade-offs

Expiry is absolute from insert. A sliding TTL would keep a record fresh for as long as readers hit it, and the page would no longer show that the stored name has a fixed age. Recency still moves on a hit, so a fresh record that was just read is the last one capacity drops.

Expired rows stay visible after Advance. Removing them inside Advance would make the clock and the table change together, and it would hide the rule that only a read or an insert applies expiry. The table can therefore show two rows when a later insert is about to find room by dropping them first.

Recency is a counter rather than the tick. Using the tick as recency would tie ada and bea when both are inserted at 0. The counter gives one victim. The lowest recency is the least recently inserted or hit.

Capacity is 2 so the third name is enough to show eviction. A larger limit would need a longer scenario to reach the same choice. The limit is a count of keys, not a count of bytes.

Invalidation is a separate call. Binding it to every source edit would make the stale-edit scenario unable to show the cached name after the field changes. The page keeps those steps apart on purpose.

There is no background revalidation. A refresh that ran by itself would need another clock and would hide the moment the source is read. This lookup reads the source when the cache reports the key missing or expired, and again after invalidation.

Each log keeps 50 rows and drops the oldest. The page has no network time to chart.

## Validation

Tests pass the tick in as an argument. They do not sleep, call the network, or read a wall clock.

- Cache tests cover a hit at tick 4 that keeps `expiresAt` at 5 and `storedAt` at 0 while recency increases, a snapshot that still lists that entry as expired at tick 5 before it is read, a read at tick 5 that returns `expired` and removes it, equal-tick LRU that hits ada and then evicts bea for cam while ada's `expiresAt` stays 5, an insert of cam at tick 5 that evicts ada and bea as `expired` with no capacity eviction, invalidate followed by a `missing` read, replacement of a fresh key that keeps the other occupant, and an eviction log capped at 50.
- Session tests cover one source read then one hit, a hit at tick 4 and a source read at tick 5 whose new `expiresAt` is 10, a source edit that leaves the cached value until invalidate and then logs a source read of the new value, ada then bea then cam at tick 0 evicting ada for capacity, advance past expiry leaving the row stored until a later insert, an unknown key that logs a miss and inserts nothing, advance-to-expiry on an empty cache and on the earliest `expiresAt`, reset, and a lookup log capped at 50.
- Copy tests cover the idle sentence `No lookup has run yet.`, a hit, an expired entry that is still stored, and a capacity eviction that names ada.
- Interaction tests render `CacheLifetimeLab`. They cover idle copy and clock 0, the Key field's accessible name, an optional initial tick, First hit, Expire, Stale edit, Evict, Advance 1, Advance to expiry, a source edit that leaves the cached result in place, a second lookup that still returns the cached name, an unknown key, and Clear.

`pnpm check` runs Oxlint, the test suite, and the production build.

## Production Considerations

Give each stored record an absolute expiry, and define the boundary in one place: fresh while `now < expiresAt`, expired when `now >= expiresAt`. A sliding expiry is a different policy and should be chosen explicitly.

Bound the cache. Drop expired entries before spending a capacity slot on a new key. Decide the eviction order with a value that cannot tie, or define the tie break. Invalidate on the write that changes the source. A source write that skips invalidation keeps serving the previous value until expiry.

Background revalidation, debouncing, request cancellation, in-flight duplicate suppression, and retries are separate mechanisms. They do not replace the freshness check, the capacity rule, or invalidation.

Keep hit, source, and eviction logs in development, and cap them. This page does not record network latency, because it does not make a request.

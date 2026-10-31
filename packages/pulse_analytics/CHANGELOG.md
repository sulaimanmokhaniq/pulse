## 0.2.0

- Feature flags: `isEnabled`, `flags`, `onFlagsChanged` and `reloadFlags`.
- Flags are cached on device per user, so they work offline and on cold start.
- The first read of each flag records a `$feature_flag_called` exposure event.
- New option `flagsRefreshInterval` (default 5 minutes).

## 0.1.0

- `track`, `identify`, `reset`, `flush` and `close`.
- Batching, retries with backoff, and a persistent offline queue.
- `MemoryStorage` and `FileStorage`.

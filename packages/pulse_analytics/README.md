# pulse_analytics

Dart and Flutter SDK for [Pulse](https://github.com/sulaimanmokhaniq/pulse),
a product analytics platform.

- `track` and `identify` with a persistent anonymous id
- Batching (up to 100 events per request) on a size or time trigger
- Offline queue persisted to disk, restored on the next launch
- Retries with exponential backoff and jitter; invalid batches are dropped, not retried forever
- Idempotent: every event carries a `messageId`, so retries are never double counted
- Never throws and never blocks your UI on the network
- Pure Dart core, no Flutter dependency; works in Flutter, CLI and server apps

## Install

```yaml
dependencies:
  pulse_analytics: ^0.1.0
```

## Use

```dart
import 'package:path_provider/path_provider.dart';
import 'package:pulse_analytics/io.dart';
import 'package:pulse_analytics/pulse_analytics.dart';

final dir = await getApplicationSupportDirectory();
final pulse = await Pulse.init(PulseConfig(
  apiKey: 'pk_...',
  host: 'https://your-pulse-api.example.com',
  storage: FileStorage(Directory('${dir.path}/pulse')),
  context: {'appVersion': '1.2.0'},
));

pulse.track('product_viewed', properties: {'productId': 'sku-1', 'price': 49});

// After login. Earlier anonymous events are linked to this user.
pulse.identify('user-42', traits: {'plan': 'pro'});

// On logout.
pulse.reset();

// Before the app is suspended.
await pulse.flush();
```

On Flutter web, use `MemoryStorage()` instead of `FileStorage`.

## Configuration

| Option | Default | |
| --- | --- | --- |
| `flushAt` | 20 | Send when this many events are queued |
| `flushInterval` | 10 s | Send at least this often |
| `maxBatchSize` | 100 | Events per request |
| `maxQueueSize` | 1000 | Oldest events are dropped beyond this |
| `maxRetryDelay` | 5 min | Cap for exponential backoff |
| `context` | `{}` | Sent with every event |
| `debug` | false | Log activity |

## How delivery works

Events are appended to an in-memory queue that is written to storage after
every change. A flush sends the oldest batch. `2xx` removes it from the queue;
`400` and `413` drop it, since retrying a malformed batch can't succeed; network
errors, `401`, `429` and `5xx` keep it and back off. Only one flush runs at a
time.

## Example

```bash
PULSE_HOST=http://localhost:3000 PULSE_KEY=pk_... dart run example/example.dart
```

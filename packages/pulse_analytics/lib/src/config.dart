import 'storage.dart';

class PulseConfig {
  PulseConfig({
    required this.apiKey,
    required this.host,
    PulseStorage? storage,
    this.flushAt = 20,
    this.flushInterval = const Duration(seconds: 10),
    this.maxBatchSize = 100,
    this.maxQueueSize = 1000,
    this.maxRetryDelay = const Duration(minutes: 5),
    this.context = const {},
    this.debug = false,
  }) : storage = storage ?? MemoryStorage();

  /// Project API key, starting with `pk_`.
  final String apiKey;

  /// Base URL of the Pulse API, e.g. `https://pulse-api.example.com`.
  final String host;

  final PulseStorage storage;

  /// Flush as soon as this many events are queued.
  final int flushAt;

  /// Flush queued events at least this often.
  final Duration flushInterval;

  /// Events per request. The API accepts at most 100.
  final int maxBatchSize;

  /// Oldest events are dropped beyond this, so a device that stays offline
  /// for weeks can't fill its disk.
  final int maxQueueSize;

  final Duration maxRetryDelay;

  /// Sent with every event, e.g. `{'os': 'android', 'appVersion': '1.2.0'}`.
  final Map<String, Object?> context;

  /// Log SDK activity with `print`.
  final bool debug;
}

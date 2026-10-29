import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'uuid.dart';

const sdkVersion = '0.1.0';

const _anonymousIdKey = 'anonymous_id';
const _userIdKey = 'user_id';
const _queueKey = 'queue';

/// Pulse analytics client.
///
/// ```dart
/// final pulse = await Pulse.init(PulseConfig(apiKey: 'pk_...', host: 'https://...'));
/// pulse.track('product_viewed', properties: {'productId': 'sku-1'});
/// ```
///
/// Calls never throw and never block on the network. Events are queued,
/// persisted, and sent in batches in the background.
class Pulse {
  Pulse._(this._config, this._client, this._anonymousId, this._userId, this._queue);

  /// Creates a client and restores identity and any events queued while offline.
  static Future<Pulse> init(PulseConfig config, {http.Client? client}) async {
    final storage = config.storage;
    var anonymousId = await storage.read(_anonymousIdKey);
    if (anonymousId == null) {
      anonymousId = uuidV4();
      await storage.write(_anonymousIdKey, anonymousId);
    }
    final userId = await storage.read(_userIdKey);
    final queue = _decodeQueue(await storage.read(_queueKey));

    final pulse = Pulse._(config, client ?? http.Client(), anonymousId, userId, queue);
    pulse._timer = Timer.periodic(config.flushInterval, (_) => pulse.flush());
    if (queue.isNotEmpty) unawaited(pulse.flush());
    return pulse;
  }

  final PulseConfig _config;
  final http.Client _client;
  String _anonymousId;
  String? _userId;
  final List<Map<String, Object?>> _queue;

  Timer? _timer;
  Future<void>? _inFlight;
  Future<void> _persisting = Future.value();
  int _failures = 0;
  int _sending = 0; // events at the head of the queue that are in flight
  DateTime? _retryAfter;
  bool _closed = false;

  String get anonymousId => _anonymousId;
  String? get userId => _userId;
  String get distinctId => _userId ?? _anonymousId;
  int get queueLength => _queue.length;

  /// Records that the current user did something.
  void track(String event, {Map<String, Object?>? properties}) {
    _enqueue({
      'type': 'track',
      'event': event,
      'distinctId': distinctId,
      if (_userId != null) 'userId': _userId,
      if (properties != null) 'properties': properties,
    });
  }

  /// Links the current device to [userId] and saves [traits] on their profile.
  ///
  /// The identify event is sent under the anonymous id, which lets the server
  /// connect earlier anonymous activity to the user.
  void identify(String userId, {Map<String, Object?>? traits}) {
    _enqueue({
      'type': 'identify',
      'distinctId': _anonymousId,
      'userId': userId,
      if (traits != null) 'traits': traits,
    });
    _userId = userId;
    unawaited(_config.storage.write(_userIdKey, userId));
  }

  /// Forgets the user, e.g. on logout. Later events use a new anonymous id.
  void reset() {
    _userId = null;
    _anonymousId = uuidV4();
    unawaited(_config.storage.write(_userIdKey, null));
    unawaited(_config.storage.write(_anonymousIdKey, _anonymousId));
  }

  /// Sends queued events now. Resolves when the attempt finishes; failures
  /// are retried later, never thrown.
  Future<void> flush() {
    return _inFlight ??= _flushAll().whenComplete(() => _inFlight = null);
  }

  /// Flushes once more, then stops the timer and closes the HTTP client.
  Future<void> close() async {
    if (_closed) return;
    _timer?.cancel();
    _retryAfter = null;
    await flush();
    await _persisting;
    _closed = true;
    _client.close();
  }

  void _enqueue(Map<String, Object?> event) {
    if (_closed) return;
    event['messageId'] = uuidV4();
    event['timestamp'] = DateTime.now().toUtc().toIso8601String();
    event['context'] = {
      'library': {'name': 'pulse_analytics', 'version': sdkVersion},
      ..._config.context,
    };
    _queue.add(event);
    if (_queue.length > _config.maxQueueSize) {
      // Drop the oldest events that aren't currently being sent.
      final dropped = min(_queue.length - _config.maxQueueSize, _queue.length - _sending - 1);
      _queue.removeRange(_sending, _sending + dropped);
      _log('queue full, dropped $dropped oldest events');
    }
    _persist();
    if (_queue.length >= _config.flushAt) unawaited(flush());
  }

  Future<void> _flushAll() async {
    while (_queue.isNotEmpty) {
      if (_retryAfter != null && DateTime.now().isBefore(_retryAfter!)) return;
      final batch = _queue.take(_config.maxBatchSize).toList();
      _sending = batch.length;
      final outcome = await _send(batch);
      _sending = 0;
      if (outcome == _Outcome.retry) return;
      // Sent, or rejected as invalid (retrying would never succeed).
      _queue.removeRange(0, batch.length);
      _persist();
    }
  }

  Future<_Outcome> _send(List<Map<String, Object?>> batch) async {
    try {
      final response = await _client
          .post(
            Uri.parse('${_config.host}/v1/batch'),
            headers: {
              'Authorization': 'Bearer ${_config.apiKey}',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({'batch': batch, 'sentAt': DateTime.now().toUtc().toIso8601String()}),
          )
          .timeout(const Duration(seconds: 30));

      final status = response.statusCode;
      if (status >= 200 && status < 300) {
        _failures = 0;
        _retryAfter = null;
        _log('sent ${batch.length} events');
        return _Outcome.done;
      }
      if (status == 400 || status == 413) {
        _log('dropped ${batch.length} events rejected by the API ($status): ${response.body}');
        return _Outcome.done;
      }
      // 401: keep events in case the key is fixed in a later release.
      // 429 and 5xx: transient.
      _log('send failed with $status, will retry');
      return _scheduleRetry();
    } catch (e) {
      _log('send failed ($e), will retry');
      return _scheduleRetry();
    }
  }

  _Outcome _scheduleRetry() {
    _failures++;
    // Exponential backoff with jitter, so a fleet of devices coming back
    // online doesn't hammer the API in lockstep.
    final base = Duration(seconds: 1) * pow(2, min(_failures, 16));
    final capped = base > _config.maxRetryDelay ? _config.maxRetryDelay : base;
    final jittered = capped * (0.5 + Random().nextDouble() / 2);
    _retryAfter = DateTime.now().add(jittered);
    return _Outcome.retry;
  }

  // Writes are chained so they land in order.
  void _persist() {
    final snapshot = jsonEncode(_queue);
    _persisting = _persisting.then((_) => _config.storage.write(_queueKey, snapshot)).catchError((Object e) {
      _log('could not persist queue: $e');
    });
  }

  void _log(String message) {
    if (_config.debug) print('[pulse] $message');
  }

  static List<Map<String, Object?>> _decodeQueue(String? raw) {
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List).cast<Map<String, Object?>>().toList();
    } catch (_) {
      return []; // corrupt file; start fresh rather than crash the app
    }
  }
}

enum _Outcome { done, retry }

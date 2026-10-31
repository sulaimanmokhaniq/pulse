import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pulse_analytics/io.dart';
import 'package:pulse_analytics/pulse_analytics.dart';
import 'package:test/test.dart';

/// Fake API that records batches and answers with a scripted status.
class FakeApi {
  final batches = <List<Map<String, dynamic>>>[];
  final requests = <http.Request>[];
  final flagRequests = <http.Request>[];
  int status = 202;
  bool offline = false;

  /// Flags returned for each distinct id; ids not listed get [defaultFlags].
  final flagsFor = <String, Map<String, bool>>{};
  Map<String, bool> defaultFlags = {};

  late final client = MockClient((request) async {
    if (offline) throw const SocketException('offline');
    if (request.url.path == '/v1/flags/evaluate') {
      flagRequests.add(request);
      final id = (jsonDecode(request.body) as Map<String, dynamic>)['distinctId'] as String;
      return http.Response(jsonEncode({'flags': flagsFor[id] ?? defaultFlags}), 200);
    }
    requests.add(request);
    final body = jsonDecode(request.body) as Map<String, dynamic>;
    if (status >= 200 && status < 300) {
      batches.add((body['batch'] as List).cast<Map<String, dynamic>>());
    }
    return http.Response('{}', status);
  });

  List<Map<String, dynamic>> get events => batches.expand((b) => b).toList();
}

PulseConfig config(PulseStorage storage, {int flushAt = 100, int maxQueueSize = 1000}) => PulseConfig(
      apiKey: 'pk_test',
      host: 'https://api.test',
      storage: storage,
      flushAt: flushAt,
      flushInterval: const Duration(hours: 1),
      maxQueueSize: maxQueueSize,
      maxRetryDelay: Duration.zero,
      context: {'appVersion': '1.0.0'},
    );

void main() {
  late FakeApi api;
  late MemoryStorage storage;

  setUp(() {
    api = FakeApi();
    storage = MemoryStorage();
  });

  test('sends tracked events in the API format', () async {
    final pulse = await Pulse.init(config(storage), client: api.client);
    pulse.track('product_viewed', properties: {'sku': 'a'});
    await pulse.flush();

    expect(api.requests.single.url.toString(), 'https://api.test/v1/batch');
    expect(api.requests.single.headers['Authorization'], 'Bearer pk_test');
    final body = jsonDecode(api.requests.single.body) as Map<String, dynamic>;
    expect(body['sentAt'], isA<String>());

    final event = api.events.single;
    expect(event['type'], 'track');
    expect(event['event'], 'product_viewed');
    expect(event['distinctId'], pulse.anonymousId);
    expect(event['properties'], {'sku': 'a'});
    expect(event['messageId'], matches(RegExp(r'^[0-9a-f-]{36}$')));
    expect(DateTime.parse(event['timestamp'] as String).isUtc, isTrue);
    expect(event['context'], {
      'library': {'name': 'pulse_analytics', 'version': sdkVersion},
      'appVersion': '1.0.0',
    });
    expect(pulse.queueLength, 0);
  });

  test('identify links the anonymous id, then events use the user id', () async {
    final pulse = await Pulse.init(config(storage), client: api.client);
    final anon = pulse.anonymousId;
    pulse.identify('user-1', traits: {'plan': 'pro'});
    pulse.track('checkout');
    await pulse.flush();

    expect(api.events[0], containsPair('distinctId', anon));
    expect(api.events[0], containsPair('userId', 'user-1'));
    expect(api.events[0], containsPair('traits', {'plan': 'pro'}));
    expect(api.events[1], containsPair('distinctId', 'user-1'));
  });

  test('reset forgets the user and rotates the anonymous id', () async {
    final pulse = await Pulse.init(config(storage), client: api.client);
    final anon = pulse.anonymousId;
    pulse.identify('user-1');
    pulse.reset();
    expect(pulse.userId, isNull);
    expect(pulse.anonymousId, isNot(anon));
  });

  test('flushes automatically once flushAt events are queued', () async {
    final pulse = await Pulse.init(config(storage, flushAt: 3), client: api.client);
    pulse.track('a');
    pulse.track('b');
    expect(api.batches, isEmpty);
    pulse.track('c');
    await pulse.flush();
    expect(api.batches.single.length, 3);
  });

  test('splits large queues into batches of at most 100', () async {
    final pulse = await Pulse.init(config(storage), client: api.client);
    for (var i = 0; i < 250; i++) {
      pulse.track('e$i');
    }
    await pulse.flush();
    expect(api.batches.map((b) => b.length), [100, 100, 50]);
  });

  test('keeps events while offline and sends them when back online', () async {
    final pulse = await Pulse.init(config(storage), client: api.client);
    api.offline = true;
    pulse.track('offline_event');
    await pulse.flush();
    expect(pulse.queueLength, 1);

    api.offline = false;
    await pulse.flush();
    expect(api.events.single['event'], 'offline_event');
    expect(pulse.queueLength, 0);
  });

  test('retries server errors but drops batches the API rejects as invalid', () async {
    final pulse = await Pulse.init(config(storage), client: api.client);
    api.status = 503;
    pulse.track('a');
    await pulse.flush();
    expect(pulse.queueLength, 1);

    api.status = 400;
    await pulse.flush();
    expect(pulse.queueLength, 0);
  });

  test('restores the queue and identity after an app restart', () async {
    api.offline = true;
    final first = await Pulse.init(config(storage), client: api.client);
    first.identify('user-1');
    first.track('before_restart');
    await first.close();

    api.offline = false;
    final second = await Pulse.init(config(storage), client: api.client);
    await second.flush();
    expect(second.userId, 'user-1');
    expect(second.anonymousId, first.anonymousId);
    expect(api.events.map((e) => e['type']), ['identify', 'track']);
  });

  test('caps the queue by dropping the oldest events', () async {
    api.offline = true;
    final pulse = await Pulse.init(config(storage, maxQueueSize: 5), client: api.client);
    for (var i = 0; i < 8; i++) {
      pulse.track('e$i');
    }
    api.offline = false;
    await pulse.flush();
    expect(api.events.map((e) => e['event']), ['e3', 'e4', 'e5', 'e6', 'e7']);
  });

  test('only one flush runs at a time', () async {
    final gate = Completer<void>();
    var calls = 0;
    final client = MockClient((request) async {
      if (request.url.path != '/v1/batch') return http.Response('{"flags":{}}', 200);
      calls++;
      await gate.future;
      return http.Response('{}', 202);
    });
    final pulse = await Pulse.init(config(storage), client: client);
    pulse.track('a');
    final f1 = pulse.flush();
    final f2 = pulse.flush();
    gate.complete();
    await Future.wait([f1, f2]);
    expect(calls, 1);
  });

  test('FileStorage persists across instances and survives corrupt files', () async {
    final dir = await Directory.systemTemp.createTemp('pulse_test');
    addTearDown(() => dir.delete(recursive: true));

    await FileStorage(dir).write('queue', '[{"event":"x"}]');
    expect(await FileStorage(dir).read('queue'), '[{"event":"x"}]');
    await FileStorage(dir).write('queue', null);
    expect(await FileStorage(dir).read('queue'), isNull);

    await File('${dir.path}/pulse_queue.json').writeAsString('{not json');
    final pulse = await Pulse.init(config(FileStorage(dir)), client: api.client);
    expect(pulse.queueLength, 0);
  });

  group('feature flags', () {
    test('fetches flags on init for the current user', () async {
      api.defaultFlags = {'new_checkout': true, 'promo': false};
      final pulse = await Pulse.init(config(storage), client: api.client);
      await pulse.reloadFlags();

      final req = api.flagRequests.first;
      expect(req.url.toString(), 'https://api.test/v1/flags/evaluate');
      expect(req.headers['Authorization'], 'Bearer pk_test');
      expect(jsonDecode(req.body), {'distinctId': pulse.anonymousId});
      expect(pulse.flags, {'new_checkout': true, 'promo': false});
      expect(pulse.isEnabled('new_checkout'), isTrue);
      expect(pulse.isEnabled('promo'), isFalse);
    });

    test('unknown flags fall back to the default', () async {
      final pulse = await Pulse.init(config(storage), client: api.client);
      await pulse.reloadFlags();
      expect(pulse.isEnabled('missing'), isFalse);
      expect(pulse.isEnabled('missing', defaultValue: true), isTrue);
    });

    test('records one exposure event per flag value', () async {
      api.defaultFlags = {'new_checkout': true};
      final pulse = await Pulse.init(config(storage), client: api.client);
      await pulse.reloadFlags();
      for (var i = 0; i < 5; i++) {
        pulse.isEnabled('new_checkout');
      }
      pulse.isEnabled('missing'); // unknown flags aren't exposures
      await pulse.flush();

      final exposures = api.events.where((e) => e['event'] == flagExposureEvent).toList();
      expect(exposures.length, 1);
      expect(exposures.single['properties'], {'flag': 'new_checkout', 'enabled': true});
    });

    test('serves cached flags offline on the next launch', () async {
      api.defaultFlags = {'new_checkout': true};
      final first = await Pulse.init(config(storage), client: api.client);
      await first.reloadFlags();
      await first.close();

      final offlineApi = FakeApi()..offline = true;
      final second = await Pulse.init(config(storage), client: offlineApi.client);
      expect(second.isEnabled('new_checkout'), isTrue);
      await second.reloadFlags(); // fails quietly, keeps the cache
      expect(second.isEnabled('new_checkout'), isTrue);
    });

    test('re-fetches after identify and does not reuse another user\'s cache', () async {
      final pulse = await Pulse.init(config(storage), client: api.client);
      api.flagsFor['user-42'] = {'beta': true};
      await pulse.reloadFlags();
      expect(pulse.isEnabled('beta'), isFalse);

      pulse.identify('user-42');
      await pulse.reloadFlags();
      expect(pulse.isEnabled('beta'), isTrue);
      expect(jsonDecode(api.flagRequests.last.body), {'distinctId': 'user-42'});

      pulse.reset();
      expect(pulse.flags, {'beta': true}); // until the fetch for the new id lands
      await pulse.reloadFlags();
      expect(pulse.isEnabled('beta'), isFalse);
    });

    test('emits on onFlagsChanged only when flags change', () async {
      api.defaultFlags = {'a': true};
      final pulse = await Pulse.init(config(storage), client: api.client);
      final seen = <Map<String, bool>>[];
      final sub = pulse.onFlagsChanged.listen(seen.add);
      await pulse.reloadFlags();
      await pulse.reloadFlags();
      api.defaultFlags = {'a': false};
      await pulse.reloadFlags();
      await Future<void>.delayed(Duration.zero);
      await sub.cancel();
      expect(seen, [
        {'a': true},
        {'a': false},
      ]);
    });
  });
}

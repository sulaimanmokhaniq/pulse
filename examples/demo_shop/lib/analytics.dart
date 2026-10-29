import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:pulse_analytics/io.dart';
import 'package:pulse_analytics/pulse_analytics.dart';

// Pass these at build time:
//   flutter run --dart-define=PULSE_HOST=https://... --dart-define=PULSE_KEY=pk_...
const _host = String.fromEnvironment('PULSE_HOST', defaultValue: 'http://localhost:3000');
const _key = String.fromEnvironment('PULSE_KEY');

late final Pulse pulse;

/// [storage] and [client] are overridable for tests.
Future<void> initAnalytics({PulseStorage? storage, http.Client? client}) async {
  if (_key.isEmpty) {
    debugPrint('PULSE_KEY is not set; events will be rejected by the API.');
  }
  storage ??= kIsWeb
      ? MemoryStorage() // no file system on the web
      : FileStorage(Directory('${(await getApplicationSupportDirectory()).path}/pulse'));

  pulse = await Pulse.init(
      PulseConfig(
        apiKey: _key,
        host: _host,
        storage: storage,
        flushAt: 10,
        context: {
          'os': kIsWeb ? 'web' : defaultTargetPlatform.name,
          'appVersion': '1.0.0',
        },
        debug: kDebugMode,
      ),
      client: client);
}

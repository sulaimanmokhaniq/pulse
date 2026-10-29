// Sends a few events to a Pulse API.
//
//   PULSE_HOST=http://localhost:3000 PULSE_KEY=pk_... dart run example/example.dart
import 'dart:io';

import 'package:pulse_analytics/io.dart';
import 'package:pulse_analytics/pulse_analytics.dart';

Future<void> main() async {
  final pulse = await Pulse.init(PulseConfig(
    apiKey: Platform.environment['PULSE_KEY'] ?? 'pk_missing',
    host: Platform.environment['PULSE_HOST'] ?? 'http://localhost:3000',
    storage: FileStorage(Directory('.pulse')),
    context: {'os': Platform.operatingSystem},
    debug: true,
  ));

  pulse.track('app_opened');
  pulse.track('product_viewed', properties: {'productId': 'sku-1', 'price': 49.0});
  pulse.identify('user-42', traits: {'plan': 'free', 'country': 'SA'});
  pulse.track('added_to_cart', properties: {'productId': 'sku-1'});

  await pulse.close();
}

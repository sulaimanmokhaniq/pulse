import 'dart:convert';

import 'package:demo_shop/analytics.dart';
import 'package:demo_shop/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pulse_analytics/pulse_analytics.dart';

void main() {
  final sent = <Map<String, dynamic>>[];
  var flagsOn = true;

  setUpAll(() async {
    final client = MockClient((request) async {
      if (request.url.path == '/v1/flags/evaluate') {
        return http.Response(
            jsonEncode({
              'flags': flagsOn ? {'promo_banner': true} : {'promo_banner': false}
            }),
            200);
      }
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      sent.addAll((body['batch'] as List).cast<Map<String, dynamic>>());
      return http.Response('{"accepted":1}', 202);
    });
    await initAnalytics(storage: MemoryStorage(), client: client);
    await pulse.reloadFlags();
  });

  testWidgets('browsing and buying sends the funnel events', (tester) async {
    await tester.pumpWidget(const DemoShopApp());
    await tester.tap(find.text('Saudi Coffee Beans'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add to cart'));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Cart'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pay 45 SAR'));
    await tester.pumpAndSettle();
    expect(find.text('Order placed'), findsOneWidget);

    await tester.runAsync(pulse.flush);
    expect(sent.where((e) => e['event'] != flagExposureEvent).map((e) => e['event']), [
      'product_list_viewed',
      'product_viewed',
      'added_to_cart',
      'cart_viewed',
      'checkout_started',
      'purchase_completed',
    ]);
    expect(sent.last['properties'], containsPair('revenue', 45.0));
  });

  testWidgets('the promo banner follows the promo_banner flag', (tester) async {
    await tester.pumpWidget(const DemoShopApp());
    expect(find.text('Free shipping on every order this week'), findsOneWidget);

    flagsOn = false;
    await tester.runAsync(pulse.reloadFlags);
    await tester.pump();
    expect(find.text('Free shipping on every order this week'), findsNothing);

    await tester.runAsync(pulse.flush);
    final exposures = sent.where((e) => e['event'] == flagExposureEvent).map((e) => e['properties']);
    expect(
        exposures,
        containsAll([
          {'flag': 'promo_banner', 'enabled': true},
          {'flag': 'promo_banner', 'enabled': false},
        ]));
  });
}

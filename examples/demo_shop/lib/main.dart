import 'package:flutter/material.dart';

import 'analytics.dart';
import 'catalog.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initAnalytics();
  pulse.track('app_opened');
  runApp(const DemoShopApp());
}

class DemoShopApp extends StatefulWidget {
  const DemoShopApp({super.key});

  @override
  State<DemoShopApp> createState() => _DemoShopAppState();
}

class _DemoShopAppState extends State<DemoShopApp> {
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    // Send what's queued before the OS suspends the app.
    _lifecycle = AppLifecycleListener(onPause: pulse.flush, onHide: pulse.flush);
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Demo Shop',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF0F766E), useMaterial3: true),
      darkTheme: ThemeData(
        colorSchemeSeed: const Color(0xFF0F766E),
        brightness: Brightness.dark,
        useMaterial3: true,
      ),
      home: const ShopScreen(),
    );
  }
}

/// App-wide state kept deliberately simple for a demo.
class Cart extends ChangeNotifier {
  final items = <Product>[];

  double get total => items.fold(0, (sum, p) => sum + p.price);

  void add(Product p) {
    items.add(p);
    notifyListeners();
  }

  void clear() {
    items.clear();
    notifyListeners();
  }
}

final cart = Cart();

class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key});

  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen> {
  String? _user;

  @override
  void initState() {
    super.initState();
    _user = pulse.userId;
    pulse.track('product_list_viewed', properties: {'count': catalog.length});
  }

  Future<void> _signIn() async {
    final username = await showDialog<String>(context: context, builder: (_) => const _SignInDialog());
    if (username == null || username.isEmpty) return;
    // Use an opaque id, never an email or phone number: Pulse stores no PII by default.
    pulse.identify(username, traits: {'plan': 'free', 'country': 'SA'});
    pulse.track('signed_in');
    setState(() => _user = username);
  }

  void _signOut() {
    pulse.track('signed_out');
    pulse.reset();
    setState(() => _user = null);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Demo Shop'),
        actions: [
          TextButton(
            onPressed: _user == null ? _signIn : _signOut,
            child: Text(_user == null ? 'Sign in' : 'Sign out'),
          ),
          ListenableBuilder(
            listenable: cart,
            builder: (context, _) => IconButton(
              tooltip: 'Cart',
              icon: Badge(
                isLabelVisible: cart.items.isNotEmpty,
                label: Text('${cart.items.length}'),
                child: const Icon(Icons.shopping_cart_outlined),
              ),
              onPressed: () {
                // An "added to cart" snackbar would cover the Pay button.
                ScaffoldMessenger.of(context).hideCurrentSnackBar();
                Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen()));
              },
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_user != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text('Signed in as $_user', style: Theme.of(context).textTheme.bodySmall),
            ),
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 220,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.85,
              ),
              itemCount: catalog.length,
              itemBuilder: (context, i) => _ProductCard(product: catalog[i]),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => ProductScreen(product: product)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Center(child: Text(product.emoji, style: const TextStyle(fontSize: 56)))),
              Text(product.name, style: Theme.of(context).textTheme.titleSmall),
              Text(sar(product.price)),
            ],
          ),
        ),
      ),
    );
  }
}

class ProductScreen extends StatefulWidget {
  const ProductScreen({super.key, required this.product});

  final Product product;

  @override
  State<ProductScreen> createState() => _ProductScreenState();
}

class _ProductScreenState extends State<ProductScreen> {
  Map<String, Object?> get _props => {
        'productId': widget.product.id,
        'name': widget.product.name,
        'category': widget.product.category,
        'price': widget.product.price,
        'currency': 'SAR',
      };

  @override
  void initState() {
    super.initState();
    pulse.track('product_viewed', properties: _props);
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    return Scaffold(
      appBar: AppBar(title: Text(p.name)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: Center(child: Text(p.emoji, style: const TextStyle(fontSize: 120)))),
            Text(p.name, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text(sar(p.price), style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 24),
            FilledButton.icon(
              icon: const Icon(Icons.add_shopping_cart),
              label: const Text('Add to cart'),
              onPressed: () {
                cart.add(p);
                pulse.track('added_to_cart', properties: {..._props, 'cartSize': cart.items.length});
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${p.name} added to cart')));
              },
            ),
          ],
        ),
      ),
    );
  }
}

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  @override
  void initState() {
    super.initState();
    pulse.track('cart_viewed', properties: {'items': cart.items.length, 'total': cart.total});
  }

  void _checkout() {
    final total = cart.total;
    final items = cart.items.length;
    pulse.track('checkout_started', properties: {'items': items, 'total': total, 'currency': 'SAR'});
    pulse.track('purchase_completed', properties: {'items': items, 'revenue': total, 'currency': 'SAR'});
    cart.clear();
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Order placed'),
        content: Text('Thanks! You paid ${sar(total)}.'),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
      ),
    ).then((_) {
      if (mounted) Navigator.pop(context);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cart')),
      body: ListenableBuilder(
        listenable: cart,
        builder: (context, _) {
          if (cart.items.isEmpty) return const Center(child: Text('Your cart is empty'));
          return Column(
            children: [
              Expanded(
                child: ListView(
                  children: [
                    for (final p in cart.items)
                      ListTile(
                          leading: Text(p.emoji, style: const TextStyle(fontSize: 28)),
                          title: Text(p.name),
                          trailing: Text(sar(p.price))),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: FilledButton(onPressed: _checkout, child: Text('Pay ${sar(cart.total)}')),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SignInDialog extends StatefulWidget {
  const _SignInDialog();

  @override
  State<_SignInDialog> createState() => _SignInDialogState();
}

class _SignInDialogState extends State<_SignInDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Sign in'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        decoration: const InputDecoration(labelText: 'Username', hintText: 'e.g. sara'),
        onSubmitted: (v) => Navigator.pop(context, v.trim()),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(context, _controller.text.trim()), child: const Text('Sign in')),
      ],
    );
  }
}

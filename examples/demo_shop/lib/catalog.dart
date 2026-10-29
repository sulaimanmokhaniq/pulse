class Product {
  const Product(this.id, this.name, this.price, this.emoji, this.category);

  final String id;
  final String name;
  final double price;
  final String emoji;
  final String category;
}

const catalog = [
  Product('sku-coffee', 'Saudi Coffee Beans', 45, '☕', 'grocery'),
  Product('sku-dates', 'Sukkari Dates Box', 60, '🌴', 'grocery'),
  Product('sku-oud', 'Oud Perfume', 220, '🧴', 'beauty'),
  Product('sku-sandals', 'Leather Sandals', 180, '🩴', 'fashion'),
  Product('sku-dallah', 'Brass Dallah', 150, '🫖', 'home'),
  Product('sku-earbuds', 'Wireless Earbuds', 299, '🎧', 'electronics'),
];

String sar(double amount) => '${amount.toStringAsFixed(0)} SAR';

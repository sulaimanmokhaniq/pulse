/// Key-value persistence used for the anonymous id, user id and offline queue.
///
/// Use [MemoryStorage] in tests or on platforms without a file system, and
/// `FileStorage` from `package:pulse_analytics/io.dart` on mobile and desktop.
abstract interface class PulseStorage {
  Future<String?> read(String key);
  Future<void> write(String key, String? value);
}

/// Non-persistent storage. Queued events are lost when the app exits.
class MemoryStorage implements PulseStorage {
  final _values = <String, String>{};

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String? value) async {
    if (value == null) {
      _values.remove(key);
    } else {
      _values[key] = value;
    }
  }
}

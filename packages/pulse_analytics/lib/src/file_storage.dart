import 'dart:io';

import 'storage.dart';

/// Stores each key as a small file in [directory]. In Flutter, pass the
/// directory from `getApplicationSupportDirectory()` (path_provider).
class FileStorage implements PulseStorage {
  FileStorage(this.directory);

  final Directory directory;

  File _file(String key) => File('${directory.path}/pulse_$key.json');

  @override
  Future<String?> read(String key) async {
    final file = _file(key);
    try {
      return await file.exists() ? await file.readAsString() : null;
    } on FileSystemException {
      return null;
    }
  }

  @override
  Future<void> write(String key, String? value) async {
    final file = _file(key);
    if (value == null) {
      if (await file.exists()) await file.delete();
      return;
    }
    await directory.create(recursive: true);
    // Write then rename so a crash mid-write never leaves a truncated queue.
    final tmp = File('${file.path}.tmp');
    await tmp.writeAsString(value, flush: true);
    await tmp.rename(file.path);
  }
}

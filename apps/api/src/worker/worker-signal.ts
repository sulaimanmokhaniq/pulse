import { Injectable } from '@nestjs/common';

// Lets the ingest path nudge an in-process worker so new events are written
// right away instead of waiting out the idle poll delay.
@Injectable()
export class WorkerSignal {
  private listener?: () => void;

  onNotify(listener: () => void) {
    this.listener = listener;
  }

  notify() {
    this.listener?.();
  }
}

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthedRequest } from './api-key.guard';

// Rate-limit per API key rather than per IP: many app users share one key, and
// one noisy project should not affect others.
@Injectable()
export class ProjectThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return (req as AuthedRequest).apiKey?.keyId ?? req.ip;
  }
}

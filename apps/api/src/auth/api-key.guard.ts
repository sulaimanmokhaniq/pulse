import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { KeyKind, prefixFor } from './api-key';
import { ApiKeysService, ResolvedKey } from './api-keys.service';

export interface AuthedRequest extends Request {
  apiKey: ResolvedKey;
}

export function extractApiKey(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  const alt = req.headers['x-api-key'];
  return typeof alt === 'string' ? alt.trim() : undefined;
}

// @Injectable on the base emits the constructor metadata the subclasses inherit.
@Injectable()
abstract class KeyGuard implements CanActivate {
  protected abstract readonly kind: KeyKind;

  constructor(private readonly keys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const raw = extractApiKey(req);
    if (!raw || !raw.startsWith(prefixFor(this.kind))) {
      throw new UnauthorizedException(`Missing or malformed ${this.kind} key`);
    }

    const resolved = await this.keys.resolve(raw);
    // The prefix is only a hint; the stored kind is what grants access.
    if (!resolved || resolved.kind !== this.kind) throw new UnauthorizedException('Invalid API key');
    req.apiKey = resolved;
    return true;
  }
}

/** Ingest keys (pk_), which client apps use to send events. */
@Injectable()
export class ApiKeyGuard extends KeyGuard {
  protected readonly kind = 'ingest';
}

/** Secret keys (sk_), which servers use to read analytics. */
@Injectable()
export class SecretKeyGuard extends KeyGuard {
  protected readonly kind = 'secret';
}

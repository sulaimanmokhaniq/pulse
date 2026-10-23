import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { API_KEY_PREFIX } from './api-key';
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

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const raw = extractApiKey(req);
    if (!raw || !raw.startsWith(API_KEY_PREFIX)) throw new UnauthorizedException('Missing or malformed API key');

    const resolved = await this.keys.resolve(raw);
    if (!resolved) throw new UnauthorizedException('Invalid API key');
    req.apiKey = resolved;
    return true;
  }
}

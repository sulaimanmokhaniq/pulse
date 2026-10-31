import { Module } from '@nestjs/common';
import { ApiKeyGuard, SecretKeyGuard } from './api-key.guard';
import { ApiKeysService } from './api-keys.service';

@Module({
  providers: [ApiKeysService, ApiKeyGuard, SecretKeyGuard],
  exports: [ApiKeysService, ApiKeyGuard, SecretKeyGuard],
})
export class AuthModule {}

import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard, AuthedRequest } from '../auth/api-key.guard';
import { ProjectThrottlerGuard } from '../auth/project-throttler.guard';
import { BatchDto } from './batch.dto';
import { IngestService } from './ingest.service';

@Controller('v1')
@UseGuards(ApiKeyGuard, ProjectThrottlerGuard)
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post('batch')
  @HttpCode(202)
  async batch(@Req() req: AuthedRequest, @Body() body: BatchDto) {
    const accepted = await this.ingest.enqueue(req.apiKey.projectId, body);
    return { accepted };
  }
}

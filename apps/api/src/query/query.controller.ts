import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthedRequest, SecretKeyGuard } from '../auth/api-key.guard';
import { ProjectThrottlerGuard } from '../auth/project-throttler.guard';
import { TrendsQueryDto } from './query.dto';
import { QueryService } from './query.service';

@Controller('v1/query')
@UseGuards(SecretKeyGuard, ProjectThrottlerGuard)
export class QueryController {
  constructor(private readonly query: QueryService) {}

  @Get('events')
  async events(@Req() req: AuthedRequest) {
    return { events: await this.query.listEvents(req.apiKey.projectId) };
  }

  @Get('trends')
  async trends(@Req() req: AuthedRequest, @Query() q: TrendsQueryDto) {
    return this.query.trend(req.apiKey.projectId, q.event, q.days);
  }
}

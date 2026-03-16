import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { AgentsService, CreateAgentPayload } from './agents.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  list() {
    return {
      items: this.agentsService.list(),
    };
  }

  @Post()
  create(@Body() body: CreateAgentPayload) {
    try {
      return {
        agent: this.agentsService.create(body),
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unable to create agent');
    }
  }
}

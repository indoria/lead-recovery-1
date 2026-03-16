import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomerListItem } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async list(): Promise<{ items: CustomerListItem[] }> {
    return { items: await this.customersService.list() };
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<{ customer: CustomerListItem }> {
    const customer = await this.customersService.getById(id);
    if (!customer) {
      throw new NotFoundException(`Customer not found: ${id}`);
    }

    return {
      customer,
    };
  }
}

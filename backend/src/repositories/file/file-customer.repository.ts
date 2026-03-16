import { Injectable } from '@nestjs/common';
import { Customer } from '../../common/models/customer.model';
import { CrmDataStoreService } from '../../data/crm-data-store.service';
import { CustomerRepository } from '../customer.repository';

@Injectable()
export class FileCustomerRepository implements CustomerRepository {
  constructor(private readonly dataStore: CrmDataStoreService) {}

  async findAll(): Promise<Customer[]> {
    return this.dataStore.listCustomers();
  }

  async findById(id: string): Promise<Customer | null> {
    return this.dataStore.getCustomerById(id) ?? null;
  }
}

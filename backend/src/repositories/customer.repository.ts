import { Customer } from '../common/models/customer.model';

export interface CustomerRepository {
  findAll(): Promise<Customer[]>;
  findById(id: string): Promise<Customer | null>;
}

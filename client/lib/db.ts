import Dexie, { type Table } from 'dexie';
import type { House, HouseConfig, DeliveryLog, Bill, User } from './api';

export type SyncAction = {
  id?: number;
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: any;
  createdAt: number;
};

export class BillManagerDB extends Dexie {
  houses!: Table<House, number>;
  houseConfigs!: Table<HouseConfig, number>;
  deliveryLogs!: Table<DeliveryLog, number>;
  bills!: Table<Bill, number>;
  users!: Table<User, string>; // uuid is string
  syncQueue!: Table<SyncAction, number>;

  constructor() {
    super('BillManagerDB');
    this.version(1).stores({
      houses: 'id, houseNo, phoneNo',
      houseConfigs: 'id, houseId, shift, supplierId',
      deliveryLogs: 'id, houseId, supplierId, shift, deliveredAt',
      bills: 'id, houseId, month, year',
      users: 'uuid, username, role',
      syncQueue: '++id, createdAt'
    });
  }
}

export const db = new BillManagerDB();

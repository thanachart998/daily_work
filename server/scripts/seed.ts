import { closeDb, getDb } from '../db/connection.js';
import { seedSampleData } from '../services/seedService.js';
import { config } from '../config.js';

// เพิ่มข้อมูลตัวอย่าง: npm run seed
getDb();
const r = seedSampleData();
console.log(`เพิ่มข้อมูลตัวอย่าง ${r.inserted} งาน (${r.from} ถึง ${r.to}) ลงใน ${config.dbPath}`);
closeDb();

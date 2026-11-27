import { closeDb, getDb } from '../db/connection.js';
import { config } from '../config.js';

// สร้างฐานข้อมูลและตาราง (ปกติระบบทำให้อัตโนมัติเมื่อ npm start): npm run init-db
const db = getDb();
const version = db.pragma('user_version', { simple: true });
console.log(`ฐานข้อมูลพร้อมใช้งาน: ${config.dbPath} (schema v${version})`);
closeDb();

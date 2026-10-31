import mysql from 'mysql2/promise';
import { config } from '../config.js';

export const mysqlPool = mysql.createPool({
  host: config.mysqlHost,
  port: config.mysqlPort,
  user: config.mysqlUser,
  password: config.mysqlPassword,
  database: config.mysqlDatabase,
  waitForConnections: true,
  connectionLimit: config.mysqlPoolSize,
  queueLimit: 0,
});

const sqlite = require('better-sqlite3');
const db = new sqlite('./data/kanban.db');

// Get schema
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table'").all();
console.log("Schema:", JSON.stringify(schema, null, 2));

// Get all tasks
const tasks = db.prepare("SELECT * FROM tasks").all();
console.log("\nAll tasks:", JSON.stringify(tasks, null, 2));
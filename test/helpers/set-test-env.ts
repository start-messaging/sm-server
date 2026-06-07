// The schema is built once in global-setup.ts; individual app instances must
// not re-run synchronize (parallel workers would race on enum creation).
process.env.DB_SYNCHRONIZE = 'false';

import mongoose from 'mongoose';

export async function connectMongo() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27028/labrador?replicaSet=rs0&directConnection=true';
  await mongoose.connect(uri);
  return mongoose.connection;
}

/**
 * Run `fn(session)` inside a MongoDB multi-document transaction
 * (requires a replica set — docker-compose starts mongod with --replSet rs0).
 */
export async function withMongoTransaction(fn, trace = []) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    trace.push({ db: 'mongodb', step: 'startTransaction()' });
    const result = await fn(session, trace);
    await session.commitTransaction();
    trace.push({ db: 'mongodb', step: 'commitTransaction()' });
    return result;
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    trace.push({ db: 'mongodb', step: 'abortTransaction()', detail: err.message, ok: false });
    throw err;
  } finally {
    await session.endSession();
  }
}

import mongoose from 'mongoose';

// Append-only audit trail. `metadata` is free-form: each action stores what it needs.
const activityLogSchema = new mongoose.Schema(
  {
    userId: { type: Number, index: true },          // users.user_id in MySQL (null for anonymous)
    userName: String,
    action: { type: String, required: true, index: true }, // e.g. request.create, order.submit
    entity: {
      type: { type: String },                        // request | equipment | booking | ...
      id: mongoose.Schema.Types.Mixed,
    },
    ip: String,
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    adminNote: String,
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { collection: 'activity_logs', versionKey: false }
);

export default mongoose.model('ActivityLog', activityLogSchema);

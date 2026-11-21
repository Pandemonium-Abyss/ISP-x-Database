import mongoose from 'mongoose';

// Each instrument records different readings, so `readings` is schemaless.
// e.g. pH meter -> { slope: 98.7, offset_mV: -3 }; centrifuge -> { rpm_measured: 14980 }
const maintenanceLogSchema = new mongoose.Schema(
  {
    equipmentId: { type: Number, required: true, index: true },
    performedBy: Number,
    performedByName: String,
    kind: { type: String, enum: ['calibration', 'repair', 'inspection', 'cleaning'], required: true },
    notes: String,
    readings: { type: mongoose.Schema.Types.Mixed, default: {} },
    attachments: [{ path: String, name: String, _id: false }],
    nextDueAt: Date,
    performedAt: { type: Date, default: Date.now },
  },
  { collection: 'maintenance_logs', versionKey: false }
);

export default mongoose.model('MaintenanceLog', maintenanceLogSchema);

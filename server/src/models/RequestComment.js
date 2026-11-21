import mongoose from 'mongoose';

// Discussion thread attached to a SQL request (replaces scattered email threads).
const requestCommentSchema = new mongoose.Schema(
  {
    requestId: { type: Number, required: true, index: true }, // requests.request_id
    userId: { type: Number, required: true },
    userName: String,
    body: { type: String, required: true, trim: true },
    attachments: [{ path: String, name: String, size: Number, mimeType: String, _id: false }],
    reactions: [{ userId: Number, emoji: String, _id: false }],
    editedAt: Date,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'request_comments', versionKey: false }
);

export default mongoose.model('RequestComment', requestCommentSchema);

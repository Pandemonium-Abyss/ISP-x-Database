import mongoose from 'mongoose';

// Lab-wide notice board: the "what's going on" feed for new members.
const announcementSchema = new mongoose.Schema(
  {
    authorId: Number,
    authorName: String,
    title: { type: String, required: true },
    body: { type: String, required: true },
    tags: [String],
    pinned: { type: Boolean, default: false },
    audience: { type: String, enum: ['all', 'members', 'staff'], default: 'all' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
  },
  { collection: 'announcements', versionKey: false }
);

export default mongoose.model('Announcement', announcementSchema);

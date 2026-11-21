import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, index: true },
    type: { type: String, default: 'info' }, // info | request | order | booking | announcement
    title: { type: String, required: true },
    message: String,
    link: String,
    isRead: { type: Boolean, default: false, index: true },
    sentAt: { type: Date, default: Date.now },
  },
  { collection: 'notifications', versionKey: false }
);

export default mongoose.model('Notification', notificationSchema);

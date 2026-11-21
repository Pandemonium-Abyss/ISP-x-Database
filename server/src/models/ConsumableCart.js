import mongoose from 'mongoose';

// Draft consumables order (the lab's "shopping cart"); one per user.
const cartSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, unique: true },
    items: [
      {
        consumableId: { type: Number, required: true },
        name: String,
        unit: String,
        quantity: { type: Number, required: true, min: 1 },
        _id: false,
      },
    ],
    note: String,
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'consumable_carts', versionKey: false }
);

export default mongoose.model('ConsumableCart', cartSchema);

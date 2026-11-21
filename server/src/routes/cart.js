import { Router } from 'express';
import { query } from '../config/mysql.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { logActivity } from '../services/activity.js';
import { ConsumableCart } from '../models/index.js';
import { submitConsumablesOrder } from '../services/transactions/submitConsumablesOrder.js';

const r = Router();
r.use(requireAuth);

async function cartWithStock(userId) {
  const cart = (await ConsumableCart.findOne({ userId }).lean()) || { userId, items: [] };
  if (!cart.items.length) return { ...cart, total: 0 };
  const rows = await query('SELECT consumable_id, stock_quantity, unit_cost FROM consumables WHERE consumable_id IN (?)',
    [cart.items.map((i) => i.consumableId)]);
  const byId = Object.fromEntries(rows.map((x) => [x.consumable_id, x]));
  const items = cart.items.map((i) => ({
    ...i,
    stock_quantity: byId[i.consumableId]?.stock_quantity ?? 0,
    unit_cost: byId[i.consumableId]?.unit_cost ?? 0,
    exists: !!byId[i.consumableId],
  }));
  return { ...cart, items, total: items.reduce((s, i) => s + i.quantity * i.unit_cost, 0) };
}

r.get('/', ah(async (req, res) => res.json(await cartWithStock(req.user.user_id))));

// Add item (or increase quantity) — upsert + positional array update
r.post('/items', ah(async (req, res) => {
  const consumableId = Number(req.body.consumableId);
  const quantity = Number(req.body.quantity || 1);
  if (!Number.isInteger(quantity) || quantity < 1) throw new HttpError(400, 'Quantity must be a positive whole number');
  const [c] = await query('SELECT consumable_id, name, unit FROM consumables WHERE consumable_id = ?', [consumableId]);
  if (!c) throw new HttpError(404, 'Consumable not found');
  const userId = req.user.user_id;
  const inc = await ConsumableCart.updateOne(
    { userId, 'items.consumableId': consumableId },
    { $inc: { 'items.$.quantity': quantity }, $set: { updatedAt: new Date() } }
  );
  if (inc.matchedCount === 0) {
    await ConsumableCart.updateOne(
      { userId },
      { $push: { items: { consumableId, name: c.name, unit: c.unit, quantity } }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );
  }
  await logActivity(req, 'cart.add', { type: 'consumable', id: consumableId }, { quantity });
  res.status(201).json(await cartWithStock(userId));
}));

r.patch('/items/:consumableId', ah(async (req, res) => {
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) throw new HttpError(400, 'Quantity must be a positive whole number');
  const result = await ConsumableCart.updateOne(
    { userId: req.user.user_id, 'items.consumableId': Number(req.params.consumableId) },
    { $set: { 'items.$.quantity': quantity, updatedAt: new Date() } }
  );
  if (!result.matchedCount) throw new HttpError(404, 'Item not in cart');
  await logActivity(req, 'cart.update', { type: 'consumable', id: Number(req.params.consumableId) }, { quantity });
  res.json(await cartWithStock(req.user.user_id));
}));

r.delete('/items/:consumableId', ah(async (req, res) => {
  await ConsumableCart.updateOne(
    { userId: req.user.user_id },
    { $pull: { items: { consumableId: Number(req.params.consumableId) } }, $set: { updatedAt: new Date() } }
  );
  await logActivity(req, 'cart.remove', { type: 'consumable', id: Number(req.params.consumableId) });
  res.json(await cartWithStock(req.user.user_id));
}));

r.delete('/', ah(async (req, res) => {
  await ConsumableCart.deleteOne({ userId: req.user.user_id });
  await logActivity(req, 'cart.clear', { type: 'cart' });
  res.json(await cartWithStock(req.user.user_id));
}));

// Checkout — the hybrid MySQL + MongoDB transaction
r.post('/checkout', ah(async (req, res) => {
  const simulateFailure = req.user.role === 'admin' ? req.body.simulateFailure : undefined;
  const result = await submitConsumablesOrder({
    req, user: req.user,
    title: req.body.title, priority: req.body.priority, description: req.body.description,
    simulateFailure,
  });
  res.status(201).json(result);
}));

export default r;

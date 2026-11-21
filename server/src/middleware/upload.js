import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function makeUploader(subdir, { imagesOnly = false, maxMb = 5 } = {}) {
  const dir = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (imagesOnly && !IMAGE_TYPES.includes(file.mimetype)) {
        return cb(Object.assign(new Error('Only PNG, JPEG, WEBP or GIF images are allowed'), { status: 400 }));
      }
      cb(null, true);
    },
  });
}

export const avatarUpload = makeUploader('avatars', { imagesOnly: true, maxMb: 2 });
export const equipmentUpload = makeUploader('equipment', { imagesOnly: true, maxMb: 5 });
export const attachmentUpload = makeUploader('attachments', { maxMb: 10 });

/** Public path stored in the DB, e.g. "/uploads/avatars/123.png" */
export const publicPath = (subdir, file) => (file ? `/uploads/${subdir}/${file.filename}` : null);

/** Remove a previously stored local file (ignore if missing). */
export function removeLocalFile(publicUrl) {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return;
  const abs = path.join(UPLOAD_ROOT, publicUrl.replace('/uploads/', ''));
  if (abs.startsWith(UPLOAD_ROOT)) fs.rm(abs, { force: true }, () => {});
}

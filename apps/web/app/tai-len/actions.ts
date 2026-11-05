'use server';

import { appDb } from '@sa/db';
import { cancelUpload, finishUpload, sendChunk, startUpload } from '../../server/ingest';
import { requireShop } from '../../server/session';

async function who() {
  const { user, shop } = await requireShop();
  return { userId: user.id, shopId: shop.id };
}

export async function startUploadAction(input: unknown) {
  return startUpload(appDb(), await who(), input);
}

export async function sendChunkAction(uploadId: unknown, records: unknown) {
  return sendChunk(appDb(), await who(), uploadId, records);
}

export async function finishUploadAction(uploadId: unknown, input: unknown) {
  return finishUpload(appDb(), await who(), uploadId, input);
}

export async function cancelUploadAction(uploadId: unknown) {
  await cancelUpload(appDb(), await who(), uploadId);
}

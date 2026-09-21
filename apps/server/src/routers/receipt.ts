import { TRPCError } from '@trpc/server'
import { and, eq, isNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { schema, type Db } from '@family-pool/db'
import { z } from 'zod'
import { requirePoolMembership, requirePoolOwner } from '../pools/authorization.js'
import { requireRoomMembership, requireRoomOwner } from '../rooms/authorization.js'
import { extractReceiptAmount } from '../receipts/ocr.js'
import { protectedProcedure, router } from '../trpc.js'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function uploadRoot() {
  return path.resolve(process.env.RECEIPT_UPLOAD_DIR ?? '../../data/receipts')
}

function extensionFor(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported image type. Use JPG, PNG, or WebP.' })
}

function decodeBase64Image(dataBase64: string, mimeType: string) {
  const prefix = `data:${mimeType};base64,`
  const raw = dataBase64.startsWith(prefix) ? dataBase64.slice(prefix.length) : dataBase64
  const buffer = Buffer.from(raw, 'base64')
  if (buffer.byteLength === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Uploaded image is empty.' })
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'Receipt images must be 5MB or smaller.' })
  }
  return buffer
}

function getActivePoolMembership(db: Db, poolId: string, userId: string) {
  const membership = db
    .select()
    .from(schema.poolMemberships)
    .where(and(eq(schema.poolMemberships.poolId, poolId), eq(schema.poolMemberships.userId, userId), isNull(schema.poolMemberships.leftAt)))
    .get()
  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You must be an active pool member to submit receipts.' })
  }
  return membership
}

function readImageDataUrl(imagePath: string) {
  const fullPath = path.join(uploadRoot(), imagePath)
  if (!existsSync(fullPath)) return null
  const ext = path.extname(fullPath).slice(1).toLowerCase()
  const mimeType = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'application/octet-stream'
  return `data:${mimeType};base64,${readFileSync(fullPath).toString('base64')}`
}

function receiptView(receipt: typeof schema.receipts.$inferSelect, uploader?: { email: string; displayName: string | null }) {
  return {
    ...receipt,
    uploader: uploader ?? null,
    imageDataUrl: readImageDataUrl(receipt.imagePath),
  }
}

export const receiptRouter = router({
  uploadAndExtract: protectedProcedure
    .input(
      z.object({
        poolId: z.string(),
        fileName: z.string().min(1).max(200),
        mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        dataBase64: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { pool } = requirePoolMembership(ctx.db, input.poolId, ctx.currentUserId)
      getActivePoolMembership(ctx.db, input.poolId, ctx.currentUserId)

      if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported image type. Use JPG, PNG, or WebP.' })
      }

      const image = decodeBase64Image(input.dataBase64, input.mimeType)
      const receiptId = randomUUID()
      const ext = extensionFor(input.mimeType)
      const relativePath = path.join(pool.roomId, input.poolId, `${receiptId}.${ext}`)
      const fullPath = path.join(uploadRoot(), relativePath)
      mkdirSync(path.dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, image)

      const ocr = await extractReceiptAmount({ fileName: input.fileName, mimeType: input.mimeType, image })
      const receipt = ctx.db
        .insert(schema.receipts)
        .values({
          id: receiptId,
          poolId: input.poolId,
          uploadedByUserId: ctx.currentUserId,
          imagePath: relativePath,
          extractedAmount: ocr.extractedAmount,
          ocrRaw: JSON.stringify(ocr.raw),
        })
        .returning()
        .get()

      return receiptView(receipt)
    }),

  confirmAmount: protectedProcedure
    .input(z.object({ receiptId: z.string(), confirmedAmount: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const receipt = ctx.db.select().from(schema.receipts).where(eq(schema.receipts.id, input.receiptId)).get()
      if (!receipt) throw new TRPCError({ code: 'NOT_FOUND' })
      if (receipt.uploadedByUserId !== ctx.currentUserId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the uploader can confirm this receipt amount.' })
      }
      if (receipt.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only pending receipts can be confirmed.' })
      }

      return receiptView(
        ctx.db
          .update(schema.receipts)
          .set({ confirmedAmount: input.confirmedAmount })
          .where(eq(schema.receipts.id, input.receiptId))
          .returning()
          .get(),
      )
    }),

  approve: protectedProcedure.input(z.object({ receiptId: z.string() })).mutation(({ ctx, input }) => {
    const receipt = ctx.db.select().from(schema.receipts).where(eq(schema.receipts.id, input.receiptId)).get()
    if (!receipt) throw new TRPCError({ code: 'NOT_FOUND' })
    requirePoolOwner(ctx.db, receipt.poolId, ctx.currentUserId)
    if (receipt.status !== 'pending') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This receipt has already been reviewed.' })
    }
    if (!receipt.confirmedAmount || receipt.confirmedAmount <= 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Receipt amount must be confirmed before approval.' })
    }

    const membership = getActivePoolMembership(ctx.db, receipt.poolId, receipt.uploadedByUserId)
    const existingLedgerEntry = ctx.db
      .select()
      .from(schema.poolLedgerEntries)
      .where(eq(schema.poolLedgerEntries.receiptId, receipt.id))
      .get()
    if (existingLedgerEntry) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This receipt already has a ledger entry.' })
    }

    ctx.db
      .insert(schema.poolLedgerEntries)
      .values({
        poolMembershipId: membership.id,
        receiptId: receipt.id,
        amountDelta: receipt.confirmedAmount,
        reason: 'contribution',
      })
      .run()

    return receiptView(
      ctx.db
        .update(schema.receipts)
        .set({ status: 'approved', reviewedByUserId: ctx.currentUserId, reviewedAt: new Date() })
        .where(eq(schema.receipts.id, receipt.id))
        .returning()
        .get(),
    )
  }),

  reject: protectedProcedure.input(z.object({ receiptId: z.string() })).mutation(({ ctx, input }) => {
    const receipt = ctx.db.select().from(schema.receipts).where(eq(schema.receipts.id, input.receiptId)).get()
    if (!receipt) throw new TRPCError({ code: 'NOT_FOUND' })
    requirePoolOwner(ctx.db, receipt.poolId, ctx.currentUserId)
    if (receipt.status !== 'pending') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This receipt has already been reviewed.' })
    }

    return receiptView(
      ctx.db
        .update(schema.receipts)
        .set({ status: 'rejected', reviewedByUserId: ctx.currentUserId, reviewedAt: new Date() })
        .where(eq(schema.receipts.id, receipt.id))
        .returning()
        .get(),
    )
  }),

  listForPool: protectedProcedure.input(z.object({ poolId: z.string() })).query(({ ctx, input }) => {
    requirePoolMembership(ctx.db, input.poolId, ctx.currentUserId)
    const rows = ctx.db
      .select({ receipt: schema.receipts, email: schema.users.email, displayName: schema.users.displayName })
      .from(schema.receipts)
      .innerJoin(schema.users, eq(schema.users.id, schema.receipts.uploadedByUserId))
      .where(eq(schema.receipts.poolId, input.poolId))
      .all()
      .sort((a, b) => b.receipt.createdAt.getTime() - a.receipt.createdAt.getTime())

    return rows.map((row) => receiptView(row.receipt, { email: row.email, displayName: row.displayName }))
  }),

  listPendingForRoom: protectedProcedure.input(z.object({ roomId: z.string() })).query(({ ctx, input }) => {
    const membership = requireRoomMembership(ctx.db, input.roomId, ctx.currentUserId)
    requireRoomOwner(membership)
    const rows = ctx.db
      .select({
        receipt: schema.receipts,
        poolName: schema.pools.name,
        email: schema.users.email,
        displayName: schema.users.displayName,
      })
      .from(schema.receipts)
      .innerJoin(schema.pools, eq(schema.pools.id, schema.receipts.poolId))
      .innerJoin(schema.users, eq(schema.users.id, schema.receipts.uploadedByUserId))
      .where(and(eq(schema.pools.roomId, input.roomId), eq(schema.receipts.status, 'pending')))
      .all()
      .sort((a, b) => b.receipt.createdAt.getTime() - a.receipt.createdAt.getTime())

    return rows.map((row) => ({
      ...receiptView(row.receipt, { email: row.email, displayName: row.displayName }),
      poolName: row.poolName,
    }))
  }),
})

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { trpc } from '@/lib/trpc'
import { formatIDR } from '@/lib/money'
import { toastError, toastSuccess } from '@/lib/feedback'

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function statusVariant(status: 'pending' | 'approved' | 'rejected') {
  if (status === 'approved') return 'default' as const
  if (status === 'rejected') return 'destructive' as const
  return 'secondary' as const
}

export function ReceiptPanel({ poolId, isOwner }: { poolId: string; isOwner: boolean }) {
  const utils = trpc.useUtils()
  const receipts = trpc.receipt.listForPool.useQuery({ poolId })
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [draftReceiptId, setDraftReceiptId] = useState<string | null>(null)
  const [confirmedAmount, setConfirmedAmount] = useState('')

  const invalidateReceipts = async () => {
    await utils.receipt.listForPool.invalidate({ poolId })
    await utils.pool.getStatus.invalidate({ poolId })
    await utils.pool.getArisanStatus.invalidate({ poolId })
  }

  const upload = trpc.receipt.uploadAndExtract.useMutation({
    onSuccess: (receipt) => {
      setUploadError(null)
      toastSuccess('Receipt uploaded — confirm the amount')
      setDraftReceiptId(receipt.id)
      setConfirmedAmount(String(receipt.extractedAmount ?? ''))
      invalidateReceipts()
    },
    onError: (error) => {
      setUploadError(error.message)
      toastError(error, 'Could not upload receipt.')
    },
  })
  const confirm = trpc.receipt.confirmAmount.useMutation({
    onSuccess: () => {
      toastSuccess('Receipt submitted for approval')
      setDraftReceiptId(null)
      setConfirmedAmount('')
      invalidateReceipts()
    },
    onError: (error) => toastError(error, 'Could not submit receipt.'),
  })
  const approve = trpc.receipt.approve.useMutation({
    onSuccess: () => {
      toastSuccess('Receipt approved')
      invalidateReceipts()
    },
    onError: (error) => toastError(error, 'Could not approve receipt.'),
  })
  const reject = trpc.receipt.reject.useMutation({
    onSuccess: () => {
      toastSuccess('Receipt rejected')
      invalidateReceipts()
    },
    onError: (error) => toastError(error, 'Could not reject receipt.'),
  })

  const draft = receipts.data?.find((receipt) => receipt.id === draftReceiptId)

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Receipts</CardTitle>
        <CardDescription>
          Upload a transfer receipt, confirm the OCR amount, then wait for the owner to approve it.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Submit a receipt</p>
            <p className="text-muted-foreground text-sm">JPG, PNG, or WebP up to 5MB.</p>
          </div>
          <label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={upload.isPending}
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                try {
                  const dataBase64 = await fileToDataUrl(file)
                  upload.mutate({ poolId, fileName: file.name, mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp', dataBase64 })
                } catch (error) {
                  setUploadError(error instanceof Error ? error.message : 'Could not read that image.')
                }
              }}
            />
            <Button type="button" variant="outline" disabled={upload.isPending} asChild>
              <span>
                <Upload /> {upload.isPending ? 'Uploading...' : 'Upload receipt'}
              </span>
            </Button>
          </label>
        </div>

        {uploadError && <p className="text-destructive text-sm">{uploadError}</p>}

        {draft && (
          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[120px_1fr]">
            {draft.imageDataUrl && <img src={draft.imageDataUrl} alt="Uploaded receipt preview" className="h-28 w-full rounded-md object-cover sm:w-28" />}
            <form
              className="grid content-start gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                const amount = Math.round(Number(confirmedAmount))
                if (!Number.isFinite(amount) || amount <= 0) return
                confirm.mutate({ receiptId: draft.id, confirmedAmount: amount })
              }}
            >
              <div>
                <p className="text-sm font-medium">Confirm the amount</p>
                <p className="text-muted-foreground text-sm">
                  OCR guessed {draft.extractedAmount ? formatIDR(draft.extractedAmount) : 'no amount'} — correct it before submitting for approval.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  required
                  type="number"
                  min={1}
                  placeholder="Confirmed amount (IDR)"
                  value={confirmedAmount}
                  onChange={(event) => setConfirmedAmount(event.target.value)}
                />
                <Button type="submit" disabled={confirm.isPending}>
                  {confirm.isPending ? 'Submitting...' : 'Submit for approval'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {receipts.isLoading && <LoadingState label="Loading receipts..." />}
        {receipts.data?.length === 0 && (
          <EmptyState
            title="No receipts yet"
            description="Upload a transfer receipt and confirm the extracted amount to submit it for owner approval."
          />
        )}
        {receipts.data && receipts.data.length > 0 && (
          <div className="divide-y rounded-lg border">
            {receipts.data.map((receipt) => (
              <div key={receipt.id} className="grid gap-3 p-3 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                {receipt.imageDataUrl ? (
                  <img src={receipt.imageDataUrl} alt="Receipt" className="h-16 w-16 rounded-md object-cover" />
                ) : (
                  <div className="bg-muted h-16 w-16 rounded-md" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{receipt.uploader?.displayName ?? receipt.uploader?.email ?? 'Unknown member'}</p>
                    <Badge variant={statusVariant(receipt.status)}>{receipt.status}</Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Confirmed: {receipt.confirmedAmount ? formatIDR(receipt.confirmedAmount) : 'not confirmed yet'} · OCR: {receipt.extractedAmount ? formatIDR(receipt.extractedAmount) : '—'}
                  </p>
                </div>
                {isOwner && receipt.status === 'pending' && receipt.confirmedAmount && (
                  <div className="flex gap-2 sm:justify-end">
                    <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ receiptId: receipt.id })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={reject.isPending} onClick={() => reject.mutate({ receiptId: receipt.id })}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

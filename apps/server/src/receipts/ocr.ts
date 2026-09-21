export type ReceiptOcrResult = {
  extractedAmount: number | null
  raw: Record<string, unknown>
}

type OcrServiceResponse = {
  text?: string
  amountCandidates?: number[]
  bestGuessAmount?: number | null
  raw?: Record<string, unknown>
}

export function extractAmountFromText(text: string): number | null {
  const matches = [...text.matchAll(/(?:rp\s*)?([0-9][0-9.,\s]{2,})/gi)]
    .map((match) => match[1]?.replace(/[^0-9]/g, ''))
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0)

  return matches.length > 0 ? Math.max(...matches) : null
}

async function callOcrService(input: {
  serviceUrl: string
  fileName: string
  mimeType: string
  image: Buffer
}): Promise<ReceiptOcrResult> {
  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(input.image)], { type: input.mimeType }), input.fileName)

  const response = await fetch(input.serviceUrl, { method: 'POST', body: form })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OCR service failed (${response.status}): ${body}`)
  }

  const data = (await response.json()) as OcrServiceResponse
  return {
    extractedAmount: data.bestGuessAmount ?? null,
    raw: {
      provider: 'self-hosted-ocr-service',
      serviceUrl: input.serviceUrl,
      text: data.text ?? '',
      amountCandidates: data.amountCandidates ?? [],
      ...(data.raw ?? {}),
    },
  }
}

export async function extractReceiptAmount(input: {
  fileName: string
  mimeType: string
  image: Buffer
}): Promise<ReceiptOcrResult> {
  const serviceUrl = process.env.OCR_SERVICE_URL
  if (serviceUrl) {
    return callOcrService({ serviceUrl, ...input })
  }

  return {
    extractedAmount: extractAmountFromText(input.fileName),
    raw: {
      provider: 'local-placeholder',
      reason: 'OCR_SERVICE_URL not configured',
      fileName: input.fileName,
      mimeType: input.mimeType,
      bytes: input.image.byteLength,
    },
  }
}

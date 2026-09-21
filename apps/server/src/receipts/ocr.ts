export type ReceiptOcrResult = {
  extractedAmount: number | null
  raw: Record<string, unknown>
}

export function extractAmountFromText(text: string): number | null {
  const matches = [...text.matchAll(/(?:rp\s*)?([0-9][0-9.,\s]{2,})/gi)]
    .map((match) => match[1]?.replace(/[^0-9]/g, ''))
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0)

  return matches.length > 0 ? Math.max(...matches) : null
}

export async function extractReceiptAmount(input: {
  fileName: string
  mimeType: string
  image: Buffer
}): Promise<ReceiptOcrResult> {
  // The cloud provider is intentionally isolated here so the upload/approval
  // flow can be exercised locally without leaking a browser-side key. Once a
  // VISION_API_KEY-backed provider is chosen, only this function should need to
  // change; callers already persist both the best guess and the raw response.
  const configuredProvider = process.env.VISION_PROVIDER
  if (!process.env.VISION_API_KEY || !configuredProvider) {
    return {
      extractedAmount: extractAmountFromText(input.fileName),
      raw: {
        provider: 'local-placeholder',
        reason: 'VISION_API_KEY/VISION_PROVIDER not configured',
        fileName: input.fileName,
        mimeType: input.mimeType,
        bytes: input.image.byteLength,
      },
    }
  }

  throw new Error(`Unsupported VISION_PROVIDER: ${configuredProvider}`)
}

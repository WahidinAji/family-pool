# OCR service

Self-hosted receipt OCR service for Family Pool.

It is intentionally a small compiled Go service that wraps the Tesseract CLI,
extracts raw text, parses amount candidates, and returns JSON to the TypeScript
server. The app talks to it through `OCR_SERVICE_URL`, so the implementation can
later be swapped to ONNX/PaddleOCR without changing the app API.

## API

```http
GET /healthz
POST /v1/receipt-ocr
Content-Type: multipart/form-data

file=<image/jpeg|image/png|image/webp, max 5MB>
```

Response:

```json
{
  "text": "Transfer Berhasil ... Rp 125.000 ...",
  "amountCandidates": [125000],
  "bestGuessAmount": 125000,
  "raw": {
    "engine": "tesseract",
    "lang": "ind+eng",
    "durationMs": 431,
    "fileName": "receipt.jpg",
    "mimeType": "image/jpeg",
    "bytes": 12345
  }
}
```

## Local development

Install Tesseract with Indonesian + English language data, then run:

```sh
cd services/ocr
go test ./...
go run ./cmd/ocr-service
```

Point the app server at it:

```env
OCR_SERVICE_URL=http://localhost:8080/v1/receipt-ocr
```

If `OCR_SERVICE_URL` is unset, the TypeScript server keeps using its local
filename-text fallback so receipt development still works without OCR installed.

## Docker

From the repo root:

```sh
docker build -f services/ocr/Dockerfile -t family-pool-ocr .
docker run --rm -p 8080:8080 family-pool-ocr
```

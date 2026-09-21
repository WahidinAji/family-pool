# Receipt OCR

Family Pool uses a replaceable HTTP OCR boundary instead of calling a cloud
vision provider directly from the app.

Default v1 setup:

```text
apps/server
  -> OCR_SERVICE_URL
  -> services/ocr (Go + Tesseract)
  -> raw text + amount candidates
  -> uploader confirms amount
  -> owner approves
```

The OCR service is deliberately not trusted as final truth. It only proposes an
amount; the uploader must confirm/correct it and the room owner must approve the
receipt before a ledger entry is written.

## Environment

```env
OCR_SERVICE_URL=http://localhost:8080/v1/receipt-ocr
```

If unset, the server falls back to a local development heuristic that extracts
amount-like text from the uploaded filename. This keeps UI work possible without
Tesseract installed.

## Run locally

Terminal 1:

```sh
cd services/ocr
go run ./cmd/ocr-service
```

Terminal 2:

```sh
OCR_SERVICE_URL=http://localhost:8080/v1/receipt-ocr pnpm dev:server
```

## Docker

```sh
docker compose -f infra/docker/docker-compose.ocr.yml up --build
```

The production compose file should wire the app service with:

```env
OCR_SERVICE_URL=http://ocr:8080/v1/receipt-ocr
```

## Future swaps

Keep the same HTTP API and replace only `services/ocr` internals if Tesseract is
not accurate enough. Possible future engines: ONNX Runtime, PaddleOCR in a
separate service, or a different compiled OCR stack.

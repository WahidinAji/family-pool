FROM golang:1.24-bookworm AS build
WORKDIR /src
COPY services/ocr/go.mod ./
RUN go mod download
COPY services/ocr/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/ocr-service ./cmd/ocr-service

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-ind \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/ocr-service /usr/local/bin/ocr-service
ENV OCR_ADDR=:8080
ENV TESSERACT_LANG=ind+eng
EXPOSE 8080
CMD ["ocr-service"]

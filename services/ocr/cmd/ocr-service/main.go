package main

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/family-pool/ocr-service/internal/amount"
	"github.com/family-pool/ocr-service/internal/tesseract"
)

const maxUploadBytes = 5 << 20

type ocrResponse struct {
	Text             string         `json:"text"`
	AmountCandidates []int64        `json:"amountCandidates"`
	BestGuessAmount  *int64         `json:"bestGuessAmount"`
	Raw              map[string]any `json:"raw"`
}

type errorResponse struct {
	Error string `json:"error"`
}

func main() {
	addr := getenv("OCR_ADDR", ":8080")
	runner := tesseract.NewRunner()
	if lang := os.Getenv("TESSERACT_LANG"); lang != "" {
		runner.Lang = lang
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
	})
	mux.HandleFunc("POST /v1/receipt-ocr", handleReceiptOCR(runner))

	slog.Info("starting OCR service", "addr", addr, "lang", runner.Lang)
	if err := http.ListenAndServe(addr, requestLogger(mux)); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func handleReceiptOCR(runner tesseract.Runner) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
		if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
			writeError(w, http.StatusBadRequest, "expected multipart form with a file field up to 5MB")
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "missing file field")
			return
		}
		defer file.Close()

		contentType := header.Header.Get("Content-Type")
		if !allowedContentType(contentType) {
			writeError(w, http.StatusBadRequest, "unsupported image type; use image/jpeg, image/png, or image/webp")
			return
		}

		tmp, err := os.CreateTemp("", "family-pool-receipt-*"+extensionFor(contentType))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not create temp file")
			return
		}
		tmpPath := tmp.Name()
		defer os.Remove(tmpPath)
		defer tmp.Close()

		written, err := io.Copy(tmp, file)
		if err != nil {
			writeError(w, http.StatusBadRequest, "could not read uploaded file")
			return
		}
		if written == 0 {
			writeError(w, http.StatusBadRequest, "uploaded file is empty")
			return
		}
		if err := tmp.Close(); err != nil {
			writeError(w, http.StatusInternalServerError, "could not finish temp file")
			return
		}

		result, err := runner.Extract(r.Context(), tmpPath)
		if err != nil {
			status := http.StatusBadGateway
			if errors.Is(err, os.ErrNotExist) {
				status = http.StatusInternalServerError
			}
			writeError(w, status, err.Error())
			return
		}

		candidates := amount.Candidates(result.Text)
		writeJSON(w, http.StatusOK, ocrResponse{
			Text:             result.Text,
			AmountCandidates: candidates,
			BestGuessAmount:  amount.BestGuess(candidates),
			Raw: map[string]any{
				"engine":     "tesseract",
				"lang":       runner.Lang,
				"durationMs": result.DurationMS,
				"fileName":   filepath.Base(header.Filename),
				"mimeType":   contentType,
				"bytes":      written,
			},
		})
	}
}

func allowedContentType(contentType string) bool {
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	return contentType == "image/jpeg" || contentType == "image/png" || contentType == "image/webp"
}

func extensionFor(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	default:
		return ".img"
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Error("could not encode response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, errorResponse{Error: message})
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "durationMs", time.Since(started).Milliseconds())
	})
}

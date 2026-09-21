package tesseract

import (
	"context"
	"fmt"
	"os/exec"
	"time"
)

type Result struct {
	Text       string `json:"text"`
	DurationMS int64  `json:"durationMs"`
}

type Runner struct {
	Binary  string
	Lang    string
	Timeout time.Duration
}

func NewRunner() Runner {
	return Runner{Binary: "tesseract", Lang: "ind+eng", Timeout: 20 * time.Second}
}

func (r Runner) Extract(ctx context.Context, imagePath string) (Result, error) {
	binary := r.Binary
	if binary == "" {
		binary = "tesseract"
	}
	lang := r.Lang
	if lang == "" {
		lang = "ind+eng"
	}
	timeout := r.Timeout
	if timeout == 0 {
		timeout = 20 * time.Second
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	started := time.Now()
	cmd := exec.CommandContext(ctx, binary, imagePath, "stdout", "-l", lang, "--psm", "6")
	output, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return Result{}, fmt.Errorf("tesseract timed out after %s", timeout)
	}
	if err != nil {
		return Result{}, fmt.Errorf("tesseract failed: %w: %s", err, string(output))
	}
	return Result{Text: string(output), DurationMS: time.Since(started).Milliseconds()}, nil
}

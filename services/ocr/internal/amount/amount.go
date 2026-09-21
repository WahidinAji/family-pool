package amount

import (
	"regexp"
	"strconv"
	"strings"
)

var amountPattern = regexp.MustCompile(`(?i)(?:rp\s*)?([0-9][0-9.,\s]{2,})`)
var nonDigitPattern = regexp.MustCompile(`[^0-9]`)

func Candidates(text string) []int64 {
	matches := amountPattern.FindAllStringSubmatch(text, -1)
	seen := map[int64]bool{}
	out := make([]int64, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		digits := nonDigitPattern.ReplaceAllString(match[1], "")
		digits = strings.TrimLeft(digits, "0")
		if digits == "" {
			continue
		}
		value, err := strconv.ParseInt(digits, 10, 64)
		if err != nil || value < 1000 || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func BestGuess(candidates []int64) *int64 {
	if len(candidates) == 0 {
		return nil
	}
	best := candidates[0]
	for _, candidate := range candidates[1:] {
		if candidate > best {
			best = candidate
		}
	}
	return &best
}

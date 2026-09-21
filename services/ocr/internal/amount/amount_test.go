package amount

import "testing"

func TestCandidatesExtractsIndonesianRupiah(t *testing.T) {
	got := Candidates("Transfer berhasil Rp 125.000 pada 21 Sep")
	if len(got) != 1 || got[0] != 125000 {
		t.Fatalf("Candidates() = %#v, want [125000]", got)
	}
}

func TestBestGuessChoosesLargestAmount(t *testing.T) {
	candidates := Candidates("admin 2.500 subtotal 122.500 total Rp 125.000")
	best := BestGuess(candidates)
	if best == nil || *best != 125000 {
		t.Fatalf("BestGuess() = %v from %#v, want 125000", best, candidates)
	}
}

func TestBestGuessReturnsNilWithoutCandidates(t *testing.T) {
	if best := BestGuess(Candidates("no amount here")); best != nil {
		t.Fatalf("BestGuess() = %v, want nil", *best)
	}
}

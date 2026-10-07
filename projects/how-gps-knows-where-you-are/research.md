# Research — How GPS Knows Where You Are

Every factual claim used in the script links to a source here. Retrieved 2026-10-06.

## Key facts

| # | Claim (as used in script) | Source | Verified |
|---|---|---|---|
| 1 | Phones are typically accurate to within ~4.9 m (16 ft) under open sky; worse near buildings, bridges, trees | GPS.gov, "GPS Accuracy" — https://archive.gps.gov/systems/gps/performance/accuracy/ | Yes |
| 2 | More than thirty operational satellites (31 as of 3 Jul 2023; a 13 Apr 2026 CGSIC briefing lists 32); US commits to at least 24 | GPS.gov, "Space Segment" — https://www.gps.gov/space-segment ; CGSIC briefing Apr 2026 — https://www.gps.gov/sites/default/files/2026-04/Mediate%2020260421_CGSIC%20MD%2031_FINAL.pdf | Yes ("more than thirty" stays true for both) |
| 3 | Orbit altitude ≈ 20,200 km (MEO); each satellite circles Earth twice a day | GPS.gov, "Space Segment" — https://www.gps.gov/space-segment | Yes |
| 4 | Satellites carry atomic clocks | GPS.gov, "Space Segment" (satellite block descriptions) — https://www.gps.gov/space-segment ; Ashby 2003 (below) | Yes |
| 5 | Signal from overhead satellite takes ≈ 0.07 s | Derived: 20,200 km ÷ 299,792 km/s = 0.0674 s (overhead; longer near the horizon) | Calculated |
| 6 | 1 µs of timing error ≈ 300 m of range error | Derived: 1×10⁻⁶ s × 299,792,458 m/s = 299.8 m | Calculated |
| 7 | Receiver needs 4 satellites: 3 for position, 1 to solve its own clock error | Standard GNSS principle; e.g. US Patent 5,490,073 background section — https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5490073 | Yes (textbook principle; a NASA/ESA primer would be a better citation) |
| 8 | Speed slows satellite clocks ≈ 7 µs/day (special relativity) | R. Pogge, Ohio State, "GPS and Relativity" — https://www.astronomy.ohio-state.edu/pogge.1/Ast162/Unit5/gps | Yes |
| 9 | Weaker gravity speeds them ≈ 45 µs/day (general relativity) | Pogge (above) | Yes |
| 10 | Net ≈ +38 µs/day | Pogge (above): "45-7=38" | Yes |
| 11 | Uncorrected, errors would accumulate ≈ 10 km per day | Pogge (above) | Yes |
| 12 | Satellite clocks are adjusted lower in frequency before launch to compensate | N. Ashby, "Relativity in the Global Positioning System", Living Reviews in Relativity 6 (2003) — https://pmc.ncbi.nlm.nih.gov/articles/PMC5253894/ ("the satellite clocks are adjusted lower in frequency…") | Yes |
| 13 | ISS ≈ 400 km; geostationary orbit 35,786 km (chart comparison) | NASA ISS reference — https://www.nasa.gov/reference/international-space-station/ ; ESA "Types of orbits" — https://www.esa.int/Enabling_Support/Space_Transportation/Types_of_orbits | Yes |

## Simplifications (deliberate, flagged)
- Trilateration is drawn in 2D (circles) for clarity; in reality the ranges are spheres. The narration says "sphere".
- "Overhead" travel time stated; slant ranges are longer.

## Open questions
- None blocking.

# Script — How GPS Knows Where You Are

Narration is the source of truth in storyboard.json; this file mirrors it with
visual notes and fact references (numbers in brackets → research.md).

## s1-hook — Title
NARRATION: Your phone can find you to within about five metres, out under open sky. It does it by listening to clocks in space. [1]
VISUAL: Title card. "How GPS knows where you are."

## s2-constellation — Statistic + chart
NARRATION: More than thirty GPS satellites circle the Earth, about twenty thousand kilometres up. Each carries atomic clocks, and broadcasts the exact time and its own position, over and over. [2][3][4]
VISUAL: 20,200 km. Bars: ISS 400 km · GPS 20,200 km · Geostationary 35,786 km. [13]

## s3-delay — Steps (cued to narration)
NARRATION: Your phone notes when each signal arrives. The signal travels at the speed of light, so the delay reveals the distance. From a satellite overhead, about seven hundredths of a second means twenty thousand kilometres. [5]
VISUAL: 1 Timestamp sent → 2 Travels at light speed → 3 Delay measured → 4 Delay × c = distance.

## s4-trilateration — Diagram (cued)
NARRATION: One distance puts you somewhere on a giant sphere around that satellite. A second distance narrows it down. A third leaves a single point. And a fourth satellite corrects the cheap clock inside your phone. [7]
VISUAL: Range rings appear one by one on the cue words; intersection point marked; "+1 for the clock".

## s5-sensitivity — Statistic
NARRATION: That's why timing is everything. A clock that is off by just one millionth of a second puts you about three hundred metres from where you are. [6]
VISUAL: 300 m / "from a one-microsecond timing error".

## s6-relativity — Comparison (cued)
NARRATION: And the satellite clocks do drift, because of Einstein. Their speed slows them by about seven microseconds a day. The weaker gravity up there speeds them up by forty five. Overall, they gain thirty eight microseconds every day. [8][9][10]
VISUAL: −7 µs (speed) · +45 µs (gravity) · = +38 µs per day (highlight).

## s7-uncorrected — Statistic
NARRATION: Left alone, that would add roughly ten kilometres of error every day. So before launch, engineers set the satellite clocks to tick slightly slow. [11][12]
VISUAL: ~10 km per day, uncorrected.

## s8-outro — Title
NARRATION: GPS is really a timing system. Get the time right, and your position follows.
VISUAL: "Clocks in space. Distance by delay."

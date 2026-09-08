/**
 * Shared calendar date-grid and event-layout math. Used by both the
 * calendar page's server load (to compute query ranges) and its Svelte
 * component (to position events on the day/week/month grids), so it lives
 * outside $lib/server rather than alongside the rest of the calendar sync
 * code.
 */

export interface CalendarEventLike {
	startAt: Date | string;
	endAt: Date | string;
	allDay: boolean;
}

export function startOfLocalDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

export function endOfLocalDay(date: Date): Date {
	return new Date(addLocalDays(startOfLocalDay(date), 1).getTime() - 1);
}

/** Sunday-start week. */
export function startOfLocalWeek(date: Date): Date {
	const d = startOfLocalDay(date);
	d.setDate(d.getDate() - d.getDay());
	return d;
}

export function weekDays(date: Date): Date[] {
	const start = startOfLocalWeek(date);
	return Array.from({ length: 7 }, (_, i) => addLocalDays(start, i));
}

/** First day shown on a 6-row month grid (the Sunday on/before the 1st). */
export function monthGridStart(date: Date): Date {
	return startOfLocalWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function monthGridDays(date: Date): Date[] {
	const start = monthGridStart(date);
	return Array.from({ length: 42 }, (_, i) => addLocalDays(start, i));
}

/**
 * Format/parse "YYYY-MM-DD" using local calendar fields — NOT
 * `toISOString().slice(0, 10)` / `new Date(dateOnlyString)`, both of which
 * go through UTC and can land on the wrong day depending on the runtime's
 * timezone offset (the same class of bug fixed in calendar sync's date
 * parsing).
 */
export function toLocalDateParam(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function parseLocalDateParam(value: string): Date {
	const [y, m, d] = value.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/**
 * The [start, endExclusive) range of local calendar days an event touches.
 * Using "last instant before end" rather than special-casing all-day
 * events means this works uniformly for both: an all-day event's stored
 * endAt is already an exclusive local-midnight boundary (see
 * calendar/sync.ts), and a timed event ending exactly at midnight
 * correctly does NOT spill into the next day's cell.
 */
export function eventDayRange(event: CalendarEventLike): { start: Date; endExclusive: Date } {
	const start = new Date(event.startAt);
	const end = new Date(event.endAt);
	const lastInstant = new Date(Math.max(end.getTime() - 1, start.getTime()));
	return {
		start: startOfLocalDay(start),
		endExclusive: addLocalDays(startOfLocalDay(lastInstant), 1)
	};
}

/**
 * Whether an event should render as a spanning colored bar (the "all day"
 * row in month/week view) rather than a timed block in the hourly grid.
 * All-day events always qualify — including single-day ones like holidays
 * — so they stand out the way they do in Skylight/Google Calendar; timed
 * events only qualify once they cross a calendar-day boundary.
 */
export function isBarEvent(event: CalendarEventLike): boolean {
	if (event.allDay) return true;
	const { start, endExclusive } = eventDayRange(event);
	return addLocalDays(start, 1) < endExclusive;
}

export function eventsOnDay<T extends CalendarEventLike>(events: T[], day: Date): T[] {
	const dayStart = startOfLocalDay(day);
	const dayEnd = addLocalDays(dayStart, 1);
	return events.filter((e) => {
		const { start, endExclusive } = eventDayRange(e);
		return start < dayEnd && endExclusive > dayStart;
	});
}

export interface BarSegment<T> {
	event: T;
	lane: number;
	colStart: number;
	colSpan: number;
	continuesBefore: boolean;
	continuesAfter: boolean;
}

/**
 * Lays out spanning bars (multi-day/all-day events) across a row of
 * consecutive days, assigning each a lane so overlapping bars stack
 * instead of colliding. `rowDays` should be a contiguous run of days (a
 * week, for month/week grids).
 */
export function layoutBarRow<T extends CalendarEventLike>(
	events: T[],
	rowDays: Date[]
): BarSegment<T>[] {
	const rowStart = startOfLocalDay(rowDays[0]);
	const rowEndExclusive = addLocalDays(startOfLocalDay(rowDays[rowDays.length - 1]), 1);

	const items = events
		.map((event) => ({ event, ...eventDayRange(event) }))
		.filter((i) => i.start < rowEndExclusive && i.endExclusive > rowStart)
		.sort(
			(a, b) =>
				a.start.getTime() - b.start.getTime() ||
				b.endExclusive.getTime() -
					b.start.getTime() -
					(a.endExclusive.getTime() - a.start.getTime())
		);

	const laneEnds: Date[] = [];
	const bars: BarSegment<T>[] = [];

	for (const item of items) {
		let lane = laneEnds.findIndex((end) => end <= item.start);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(item.endExclusive);
		} else {
			laneEnds[lane] = item.endExclusive;
		}

		const clippedStart = item.start < rowStart ? rowStart : item.start;
		const clippedEnd = item.endExclusive > rowEndExclusive ? rowEndExclusive : item.endExclusive;

		bars.push({
			event: item.event,
			lane,
			colStart: Math.round((clippedStart.getTime() - rowStart.getTime()) / 86_400_000),
			colSpan: Math.max(
				1,
				Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 86_400_000)
			),
			continuesBefore: item.start < rowStart,
			continuesAfter: item.endExclusive > rowEndExclusive
		});
	}

	return bars;
}

export interface FamilyMemberLike {
	id: string;
	name: string;
	colorHex: string;
	avatarEmoji: string;
	email?: string | null;
}

export interface CalendarOwnerLike {
	familyMember?: FamilyMemberLike | null;
	account?: { familyMember: FamilyMemberLike } | null;
}

/**
 * Who "owns" a calendar (and therefore the events on it) — either the
 * family member directly (local-only calendars, e.g. for kids with no
 * connected Google account) or the family member behind the connected
 * Google account. Every calendar has exactly one or the other.
 */
export function calendarOwner<T extends CalendarOwnerLike>(calendar: T): FamilyMemberLike {
	const owner = calendar.familyMember ?? calendar.account?.familyMember;
	if (!owner) throw new Error('Calendar has neither a local owner nor a connected account');
	return owner;
}

export interface TimeBlock<T> {
	event: T;
	topPct: number;
	heightPct: number;
	col: number;
	cols: number;
}

/**
 * Lays out timed (non-bar) events within a single day's hourly grid, side
 * by side when they overlap. Column sharing is computed once across the
 * whole day rather than per overlap-cluster — a reasonable simplification
 * for a household calendar's event density.
 */
export function layoutTimeColumn<T extends CalendarEventLike>(
	events: T[],
	day: Date
): TimeBlock<T>[] {
	const dayStart = startOfLocalDay(day);
	const dayEnd = addLocalDays(dayStart, 1);
	const MIN_DURATION_MIN = 30;

	const items = events
		.map((event) => {
			const start = new Date(event.startAt);
			const end = new Date(event.endAt);
			const startMin = Math.max(
				0,
				(Math.max(start.getTime(), dayStart.getTime()) - dayStart.getTime()) / 60_000
			);
			let endMin = Math.min(
				1440,
				(Math.min(end.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60_000
			);
			if (endMin - startMin < MIN_DURATION_MIN)
				endMin = Math.min(1440, startMin + MIN_DURATION_MIN);
			return { event, startMin, endMin };
		})
		.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

	const columns: { endMin: number }[] = [];
	const placed: { event: T; startMin: number; endMin: number; col: number }[] = [];

	for (const item of items) {
		let col = columns.findIndex((c) => c.endMin <= item.startMin);
		if (col === -1) {
			col = columns.length;
			columns.push({ endMin: item.endMin });
		} else {
			columns[col].endMin = item.endMin;
		}
		placed.push({ ...item, col });
	}

	const cols = Math.max(1, columns.length);

	return placed.map((p) => ({
		event: p.event,
		topPct: (p.startMin / 1440) * 100,
		heightPct: ((p.endMin - p.startMin) / 1440) * 100,
		col: p.col,
		cols
	}));
}

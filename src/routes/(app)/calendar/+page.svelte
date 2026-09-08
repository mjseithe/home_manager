<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import {
		addLocalDays,
		calendarOwner,
		eventDayRange,
		eventsOnDay,
		isBarEvent,
		layoutBarRow,
		layoutTimeColumn,
		monthGridDays,
		startOfLocalDay,
		toLocalDateParam,
		weekDays
	} from '$lib/calendar-layout';

	let { data }: PageProps = $props();
	type EventT = (typeof data.events)[number];

	const dayHeaderFmt = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
	const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
	const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
	const dayNumFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric' });
	const weekdayShortFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
	const weekRangeFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
	const weekRangeYearFmt = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	const hourFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric' });

	const HOURS = Array.from({ length: 24 }, (_, i) => i);
	const HOUR_HEIGHT_PX = 72;
	const MONTH_BAR_LANE_CAP = 3;
	const MONTH_CHIP_CAP = 2;
	const WEEK_BAR_LANE_CAP = 4;

	const anchor = $derived(new Date(data.anchor));

	function isSameDay(a: Date, b: Date) {
		return a.toDateString() === b.toDateString();
	}

	function eventOwner(event: EventT) {
		return calendarOwner(event.calendar);
	}

	// Live-updating "now" line for the day/week hourly grids.
	let now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(id);
	});
	const nowPct = $derived(((now.getHours() * 60 + now.getMinutes()) / 1440) * 100);

	const monthGrid = $derived(data.view === 'month' ? monthGridDays(anchor) : []);
	const monthRows = $derived.by(() => {
		const rows: Date[][] = [];
		for (let i = 0; i < monthGrid.length; i += 7) rows.push(monthGrid.slice(i, i + 7));
		return rows;
	});

	// Full Sun–Sat week: used for the week header/nav math and the multi-day
	// bar layout, both of which only render in week view.
	const weekGrid = $derived(data.view === 'week' ? weekDays(anchor) : []);
	// Columns actually drawn in the hourly grid: the full week for week view,
	// but just the single selected day for day view (day view previously
	// reused weekGrid here, which rendered all 7 days instead of one).
	const gridDays = $derived(data.view === 'week' ? weekGrid : data.view === 'day' ? [anchor] : []);

	const barEvents = $derived(data.events.filter(isBarEvent));
	const timedEvents = $derived(data.events.filter((e) => !isBarEvent(e)));

	function monthRowBars(row: Date[]) {
		return layoutBarRow(barEvents, row);
	}
	function monthRowLanes(row: Date[]) {
		const maxLane = monthRowBars(row).reduce((m, b) => Math.max(m, b.lane), -1);
		return Math.min(MONTH_BAR_LANE_CAP, maxLane + 1);
	}
	function monthDayChips(day: Date) {
		return eventsOnDay(timedEvents, day);
	}

	const weekBars = $derived(layoutBarRow(barEvents, weekGrid));
	const weekBarLanes = $derived(
		Math.min(WEEK_BAR_LANE_CAP, weekBars.reduce((m, b) => Math.max(m, b.lane), -1) + 1)
	);

	function dayTimedBlocks(day: Date) {
		return layoutTimeColumn(eventsOnDay(timedEvents, day), day);
	}

	const dayAllDayEvents = $derived(data.view === 'day' ? eventsOnDay(barEvents, anchor) : []);

	const agendaGroups = $derived.by(() => {
		if (data.view !== 'agenda') return [];
		const map = new Map<string, EventT[]>();
		for (const event of data.events) {
			const { start, endExclusive } = eventDayRange(event);
			let cursor = start;
			while (cursor < endExclusive) {
				const key = cursor.toDateString();
				if (!map.has(key)) map.set(key, []);
				map.get(key)!.push(event);
				cursor = addLocalDays(cursor, 1);
			}
		}
		return [...map.entries()]
			.map(([key, events]) => ({ day: new Date(key), events }))
			.sort((a, b) => a.day.getTime() - b.day.getTime());
	});

	function navUrl(overrides: { view?: string; date?: string }) {
		const params = new URLSearchParams();
		params.set('view', overrides.view ?? data.view);
		params.set('date', overrides.date ?? toLocalDateParam(anchor));
		for (const id of data.hiddenMembers) params.append('hide', id);
		return `/calendar?${params.toString()}`;
	}

	function toggleHideUrl(memberId: string) {
		const hidden = new Set(data.hiddenMembers);
		if (hidden.has(memberId)) hidden.delete(memberId);
		else hidden.add(memberId);

		const params = new URLSearchParams();
		params.set('view', data.view);
		params.set('date', toLocalDateParam(anchor));
		for (const id of hidden) params.append('hide', id);
		return `/calendar?${params.toString()}`;
	}

	function shiftedDate(steps: number) {
		const d = new Date(anchor);
		if (data.view === 'month') d.setMonth(d.getMonth() + steps);
		else if (data.view === 'week') d.setDate(d.getDate() + steps * 7);
		else if (data.view === 'agenda') d.setDate(d.getDate() + steps * 14);
		else d.setDate(d.getDate() + steps);
		return toLocalDateParam(d);
	}

	function hourLabel(h: number) {
		return hourFmt.format(new Date(2000, 0, 1, h));
	}

	function barStyle(bar: { lane: number; colStart: number; colSpan: number }, cols: number) {
		return `top:${bar.lane * 26}px; left:calc(${(bar.colStart / cols) * 100}% + 2px); width:calc(${(bar.colSpan / cols) * 100}% - 4px);`;
	}

	let hourGridEl: HTMLDivElement | undefined = $state();
	$effect(() => {
		// Re-run whenever we're on (or navigate within) the day/week view, so
		// the hourly grid opens scrolled to a sensible time instead of 12 AM.
		void data.view;
		void data.anchor;
		if ((data.view === 'day' || data.view === 'week') && hourGridEl) {
			hourGridEl.scrollTop = Math.max(0, 7 * HOUR_HEIGHT_PX - 32);
		}
	});

	// --- Add/edit event modal ---

	interface ModalState {
		mode: 'create' | 'edit';
		eventId?: string;
		familyMemberId: string;
		title: string;
		description: string;
		location: string;
		allDay: boolean;
		startDate: string;
		startTime: string;
		endDate: string;
		endTime: string;
	}

	let modal: ModalState | null = $state(null);
	let modalError: string | null = $state(null);
	let deleteFormEl: HTMLFormElement | undefined = $state();

	function timeInputValue(d: Date) {
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}

	function defaultFamilyMemberId() {
		return data.familyMembers[0]?.id ?? '';
	}

	function openCreateModal(day?: Date, hour?: number) {
		const d = day ?? anchor;
		const dateStr = toLocalDateParam(d);
		const startHour = hour ?? 9;
		modal = {
			mode: 'create',
			familyMemberId: defaultFamilyMemberId(),
			title: '',
			description: '',
			location: '',
			allDay: hour === undefined,
			startDate: dateStr,
			startTime: `${String(startHour).padStart(2, '0')}:00`,
			endDate: dateStr,
			endTime: `${String(Math.min(startHour + 1, 23)).padStart(2, '0')}:00`
		};
		modalError = null;
	}

	function openEditModal(event: EventT) {
		const owner = eventOwner(event);
		const start = new Date(event.startAt);
		const end = new Date(event.endAt);
		// All-day `endAt` is stored exclusive (the day after the last actual
		// day); show the user the inclusive last day instead.
		const endDisplay = event.allDay ? addLocalDays(startOfLocalDay(end), -1) : end;
		modal = {
			mode: 'edit',
			eventId: event.id,
			familyMemberId: owner.id,
			title: event.title,
			description: event.description ?? '',
			location: event.location ?? '',
			allDay: event.allDay,
			startDate: toLocalDateParam(start),
			startTime: timeInputValue(start),
			endDate: toLocalDateParam(endDisplay),
			endTime: timeInputValue(end)
		};
		modalError = null;
	}

	function closeModal() {
		modal = null;
		modalError = null;
	}

	function confirmDelete() {
		if (confirm('Delete this event? This removes it from Home Manager and Google Calendar.')) {
			deleteFormEl?.requestSubmit();
		}
	}
</script>

<svelte:head>
	<title>Calendar · Home Manager</title>
</svelte:head>

<div class="relative flex h-full flex-col gap-5">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-3xl font-extrabold tracking-tight text-slate-800">
			{#if data.view === 'month'}
				{monthFmt.format(anchor)}
			{:else if data.view === 'week'}
				{#if weekGrid[0].getFullYear() === weekGrid[6].getFullYear()}
					{weekRangeFmt.format(weekGrid[0])} – {weekRangeYearFmt.format(weekGrid[6])}
				{:else}
					{weekRangeYearFmt.format(weekGrid[0])} – {weekRangeYearFmt.format(weekGrid[6])}
				{/if}
			{:else if data.view === 'day'}
				{dayHeaderFmt.format(anchor)}
			{:else}
				Agenda
			{/if}
		</h1>

		<div class="flex flex-wrap items-center gap-2">
			<div class="flex overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
				{#each [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['agenda', 'Agenda']] as [v, label] (v)}
					<a
						href={navUrl({ view: v })}
						class="px-4 py-2.5 text-sm font-bold transition {data.view === v
							? 'bg-blue-600 text-white'
							: 'text-slate-500 hover:bg-slate-50'}">{label}</a
					>
				{/each}
			</div>

			<a
				href={navUrl({ date: shiftedDate(-1) })}
				class="rounded-full border border-slate-200 bg-white px-3.5 py-2.5 text-lg leading-none shadow-sm"
				>‹</a
			>
			<a
				href={navUrl({ date: toLocalDateParam(new Date()) })}
				class="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm"
				>Today</a
			>
			<a
				href={navUrl({ date: shiftedDate(1) })}
				class="rounded-full border border-slate-200 bg-white px-3.5 py-2.5 text-lg leading-none shadow-sm"
				>›</a
			>

			<form method="POST" action="?/sync" use:enhance>
				<button
					type="submit"
					class="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm"
					>🔄 Sync</button
				>
			</form>
		</div>
	</div>

	{#if data.error}
		<div class="rounded-2xl bg-red-100 px-4 py-3 text-sm font-medium text-red-700">
			Couldn't connect that calendar ({data.error}). Try again from Google Cloud console settings.
		</div>
	{/if}

	<div class="flex flex-wrap items-start gap-4">
		{#each data.familyMembers as member (member.id)}
			{@const hidden = data.hiddenMembers.includes(member.id)}
			<a href={toggleHideUrl(member.id)} class="flex flex-col items-center gap-1.5">
				<span
					class="flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-md transition {hidden
						? 'opacity-30 grayscale'
						: 'ring-4 ring-white'}"
					style="background-color: {member.colorHex}"
				>
					{member.avatarEmoji}
				</span>
				<span
					class="text-xs font-bold {hidden ? 'text-slate-300' : 'text-slate-600'}"
					style={hidden ? '' : `color:${member.colorHex}`}>{member.name}</span
				>
			</a>
		{/each}
	</div>

	<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
		{#if data.view === 'agenda'}
			<div class="flex flex-col gap-5">
				{#if agendaGroups.length === 0}
					<p class="rounded-3xl bg-white p-8 text-center text-slate-400 shadow-sm">
						No events in the next two weeks.
					</p>
				{/if}
				{#each agendaGroups as { day, events } (day.toDateString())}
					<div>
						<h2
							class="mb-2 flex items-center gap-2 text-sm font-extrabold tracking-wide text-slate-500 uppercase"
						>
							{dayHeaderFmt.format(day)}
							{#if isSameDay(day, new Date())}
								<span class="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs text-white">Today</span>
							{/if}
						</h2>
						<div class="flex flex-col divide-y divide-slate-100 rounded-3xl bg-white shadow-sm">
							{#each events as event (event.id)}
								<button
									type="button"
									onclick={() => openEditModal(event)}
									class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50"
								>
									<span
										class="h-10 w-1.5 shrink-0 rounded-full"
										style="background-color: {eventOwner(event).colorHex}"
									></span>
									<span class="w-20 shrink-0 text-sm font-semibold text-slate-500">
										{event.allDay ? 'All day' : timeFmt.format(new Date(event.startAt))}
									</span>
									<div class="min-w-0 flex-1">
										<p class="truncate font-bold text-slate-800">{event.title}</p>
										{#if event.location}
											<p class="truncate text-sm text-slate-400">{event.location}</p>
										{/if}
									</div>
									<span class="text-xl">{eventOwner(event).avatarEmoji}</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{:else if data.view === 'month'}
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white shadow-sm">
				<div class="grid shrink-0 grid-cols-7 border-b border-slate-100 bg-slate-50">
					{#each monthGrid.slice(0, 7) as day (day.toISOString())}
						<div
							class="py-2.5 text-center text-xs font-extrabold tracking-wide text-slate-400 uppercase"
						>
							{weekdayShortFmt.format(day)}
						</div>
					{/each}
				</div>
				{#each monthRows as row (row[0].toISOString())}
					{@const lanes = monthRowLanes(row)}
					{@const bars = monthRowBars(row)}
					<div
						class="grid min-h-0 flex-1 border-b border-slate-100"
						style={`grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: 2rem repeat(${lanes}, 1.5rem) 1fr;`}
					>
						{#each row as day, i (day.toISOString() + '-num')}
							{@const inMonth = day.getMonth() === anchor.getMonth()}
							<a
								href={navUrl({ view: 'day', date: toLocalDateParam(day) })}
								class="flex items-start border-r border-slate-100 px-1.5 pt-1.5 {inMonth
									? ''
									: 'bg-slate-50/70'}"
								style={`grid-column:${i + 1}; grid-row:1`}
							>
								<span
									class="flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold {isSameDay(
										day,
										new Date()
									)
										? 'bg-blue-600 text-white'
										: inMonth
											? 'text-slate-700'
											: 'text-slate-300'}"
								>
									{dayNumFmt.format(day)}
								</span>
							</a>
						{/each}

						{#each bars.filter((b) => b.lane < MONTH_BAR_LANE_CAP) as bar (bar.event.id + '-' + bar.colStart)}
							<div
								class="relative mx-0.5 my-px"
								style={`grid-column:${bar.colStart + 1} / span ${bar.colSpan}; grid-row:${bar.lane + 2}`}
							>
								<button
									type="button"
									onclick={() => openEditModal(bar.event)}
									class="flex h-[1.4rem] w-full items-center truncate px-2 text-[11px] font-bold text-white shadow-sm {bar.continuesBefore
										? 'rounded-l-none'
										: 'rounded-l-full'} {bar.continuesAfter ? 'rounded-r-none' : 'rounded-r-full'}"
									style={`background-color: ${eventOwner(bar.event).colorHex}`}
								>
									{bar.event.title}
								</button>
							</div>
						{/each}

						{#each row as day, i (day.toISOString() + '-chips')}
							{@const inMonth = day.getMonth() === anchor.getMonth()}
							{@const chips = monthDayChips(day)}
							<div
								class="flex flex-col gap-0.5 border-r border-slate-100 px-1.5 pt-0.5 pb-1.5 {inMonth
									? ''
									: 'bg-slate-50/70'}"
								style={`grid-column:${i + 1}; grid-row:${lanes + 2}`}
							>
								{#each chips.slice(0, MONTH_CHIP_CAP) as event (event.id)}
									<button
										type="button"
										onclick={() => openEditModal(event)}
										class="truncate rounded-lg px-1.5 py-0.5 text-left text-[10px] font-bold text-white shadow-sm"
										style={`background-color: ${eventOwner(event).colorHex}`}
									>
										{#if !event.allDay}<span class="opacity-80"
												>{timeFmt.format(new Date(event.startAt))}</span
											>{/if}
										{event.title}
									</button>
								{/each}
								{#if chips.length > MONTH_CHIP_CAP}
									<a
										href={navUrl({ view: 'day', date: toLocalDateParam(day) })}
										class="px-1 text-[10px] font-bold text-slate-400"
									>
										+{chips.length - MONTH_CHIP_CAP} more
									</a>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{:else}
			<!-- day + week share the same hourly-grid layout; week just has 7 columns -->
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white shadow-sm">
				<div
					class="grid shrink-0 border-b border-slate-100"
					style={`grid-template-columns: 3.5rem repeat(${gridDays.length}, 1fr);`}
				>
					<div></div>
					{#each gridDays as day (day.toISOString())}
						<div class="border-l border-slate-100 py-2.5 text-center">
							<div class="text-xs font-extrabold tracking-wide text-slate-400 uppercase">
								{weekdayShortFmt.format(day)}
							</div>
							<a
								href={navUrl({ view: 'day', date: toLocalDateParam(day) })}
								class="mx-auto mt-1 flex h-9 w-9 items-center justify-center rounded-full text-base font-extrabold {isSameDay(
									day,
									new Date()
								)
									? 'bg-blue-600 text-white'
									: 'text-slate-700'}"
							>
								{dayNumFmt.format(day)}
							</a>
						</div>
					{/each}
				</div>

				{#if data.view === 'week' && weekBars.length}
					<div
						class="grid shrink-0 border-b border-slate-100 py-1"
						style={`grid-template-columns: 3.5rem repeat(7, 1fr); min-height: ${weekBarLanes * 26}px;`}
					>
						<div style="grid-column:1"></div>
						<div class="relative" style="grid-column: 2 / -1; grid-row: 1">
							{#each weekBars.filter((b) => b.lane < WEEK_BAR_LANE_CAP) as bar (bar.event.id + '-' + bar.colStart)}
								<button
									type="button"
									onclick={() => openEditModal(bar.event)}
									class="absolute flex h-[1.5rem] items-center truncate rounded-full px-2.5 text-left text-xs font-bold text-white shadow-sm"
									style={`${barStyle(bar, 7)} background-color: ${eventOwner(bar.event).colorHex};`}
								>
									{bar.event.title}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if data.view === 'day' && dayAllDayEvents.length}
					<div class="flex shrink-0 flex-col gap-1.5 border-b border-slate-100 p-2">
						{#each dayAllDayEvents as event (event.id)}
							<button
								type="button"
								onclick={() => openEditModal(event)}
								class="flex w-full items-center gap-2 truncate rounded-full px-3 py-1.5 text-left text-sm font-bold text-white shadow-sm"
								style={`background-color: ${eventOwner(event).colorHex}`}
							>
								{event.title}
							</button>
						{/each}
					</div>
				{/if}

				<div bind:this={hourGridEl} class="min-h-0 flex-1 overflow-y-auto">
					<div
						class="relative grid"
						style={`grid-template-columns: 3.5rem repeat(${gridDays.length}, 1fr);`}
					>
						<div class="flex flex-col">
							{#each HOURS as h (h)}
								<div
									class="border-t border-slate-100 pr-2 text-right text-[11px] font-medium text-slate-400"
									style={`height:${HOUR_HEIGHT_PX}px`}
								>
									{hourLabel(h)}
								</div>
							{/each}
						</div>

						{#each gridDays as day (day.toISOString())}
							<div class="relative border-l border-slate-100">
								{#each HOURS as h (h)}
									<button
										type="button"
										onclick={() => openCreateModal(day, h)}
										aria-label={`Add event at ${hourLabel(h)} on ${dayHeaderFmt.format(day)}`}
										class="block w-full border-t border-slate-100 text-left transition hover:bg-blue-50/50"
										style={`height:${HOUR_HEIGHT_PX}px`}
									></button>
								{/each}

								{#each dayTimedBlocks(day) as block (block.event.id)}
									<button
										type="button"
										onclick={() => openEditModal(block.event)}
										class="absolute overflow-hidden rounded-xl px-2 py-1 text-left text-[11px] leading-tight text-white shadow-sm"
										style={`top:${block.topPct}%; height:${block.heightPct}%; left:calc(${(block.col / block.cols) * 100}% + 2px); width:calc(${(1 / block.cols) * 100}% - 4px); background-color: ${eventOwner(block.event).colorHex};`}
									>
										<div class="font-bold">{timeFmt.format(new Date(block.event.startAt))}</div>
										<div class="truncate">{block.event.title}</div>
									</button>
								{/each}

								{#if isSameDay(day, now)}
									<div
										class="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
										style={`top:${nowPct}%`}
									>
										<span class="absolute -top-1.5 -left-1 h-3 w-3 rounded-full bg-red-500"></span>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<details class="rounded-3xl bg-white p-5 shadow-sm">
		<summary class="cursor-pointer font-bold text-slate-700">Manage connected calendars</summary>

		<div class="mt-4 flex flex-col gap-4">
			{#each data.accounts as account (account.id)}
				<div class="rounded-2xl border border-slate-100 p-3">
					<div class="flex items-center justify-between">
						<div>
							<p class="font-bold text-slate-800">
								{account.familyMember.avatarEmoji}
								{account.familyMember.name}
							</p>
							<p class="text-sm text-slate-400">{account.googleEmail}</p>
						</div>
						<form method="POST" action="?/disconnect" use:enhance>
							<input type="hidden" name="accountId" value={account.id} />
							<button type="submit" class="text-sm font-bold text-red-500">Disconnect</button>
						</form>
					</div>
					<div class="mt-2 flex flex-col gap-1">
						{#each account.calendars as cal (cal.id)}
							<form method="POST" action="?/toggleCalendar" use:enhance>
								<input type="hidden" name="calendarId" value={cal.id} />
								<input type="hidden" name="enabled" value={String(cal.enabled)} />
								<button
									type="submit"
									class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-50"
								>
									<span
										class="flex h-4 w-4 items-center justify-center rounded border {cal.enabled
											? 'border-blue-600 bg-blue-600 text-white'
											: 'border-slate-300'}"
									>
										{#if cal.enabled}✓{/if}
									</span>
									{cal.summary}
								</button>
							</form>
						{/each}
					</div>
				</div>
			{/each}

			{#if data.localCalendars.length}
				<div class="flex flex-col gap-2">
					<p class="text-xs font-bold tracking-wide text-slate-400 uppercase">
						Local-only calendars
					</p>
					{#each data.localCalendars as cal (cal.id)}
						<div
							class="flex items-center gap-2 rounded-2xl border border-slate-100 px-3 py-2.5 text-sm text-slate-600"
						>
							<span class="text-lg">{cal.familyMember?.avatarEmoji}</span>
							<span class="font-bold text-slate-700">{cal.familyMember?.name}</span>
							<span class="text-slate-400"
								>— stays in Home Manager only, no Google account connected</span
							>
						</div>
					{/each}
				</div>
			{/if}

			<a
				href="/calendar/connect"
				class="rounded-2xl bg-blue-600 px-4 py-3 text-center font-bold text-white"
				>+ Connect a Google Calendar</a
			>
		</div>
	</details>
</div>

<button
	type="button"
	onclick={() => openCreateModal()}
	aria-label="Add event"
	class="fixed right-6 bottom-6 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-3xl leading-none font-light text-white shadow-xl transition hover:scale-105 active:scale-95"
>
	+
</button>

{#if modal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
		role="button"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeModal();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') closeModal();
		}}
	>
		<div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
			<form
				method="POST"
				action={modal.mode === 'create' ? '?/createEvent' : '?/updateEvent'}
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'failure') {
							modalError = (result.data?.error as string) ?? 'Something went wrong.';
							return;
						}
						closeModal();
						await update();
					};
				}}
				class="flex flex-col gap-4"
			>
				{#if modal.mode === 'edit'}
					<input type="hidden" name="eventId" value={modal.eventId} />
				{/if}
				<input type="hidden" name="allDay" value={modal.allDay ? 'true' : 'false'} />
				<input type="hidden" name="familyMemberId" value={modal.familyMemberId} />

				<h2 class="text-xl font-extrabold text-slate-800">
					{modal.mode === 'create' ? 'Add event' : 'Edit event'}
				</h2>

				{#if modalError}
					<p class="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
						{modalError}
					</p>
				{/if}

				<input
					name="title"
					bind:value={modal.title}
					placeholder="Event title"
					required
					class="rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold text-slate-800 focus:border-blue-400 focus:outline-none"
				/>

				<div class="flex flex-wrap gap-2">
					{#each data.familyMembers as member (member.id)}
						<button
							type="button"
							onclick={() => modal && (modal.familyMemberId = member.id)}
							class="flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition {modal.familyMemberId ===
							member.id
								? 'border-transparent text-white shadow'
								: 'border-slate-200 text-slate-500'}"
							style={modal.familyMemberId === member.id
								? `background-color:${member.colorHex}`
								: ''}
						>
							<span>{member.avatarEmoji}</span>{member.name}
						</button>
					{/each}
				</div>

				<label class="flex items-center gap-2 text-sm font-bold text-slate-600">
					<input type="checkbox" bind:checked={modal.allDay} class="h-4 w-4 rounded" />
					All day
				</label>

				<div class="grid grid-cols-2 gap-3">
					<label class="flex flex-col gap-1 text-xs font-bold text-slate-500">
						Start
						<input
							type="date"
							name="startDate"
							bind:value={modal.startDate}
							required
							class="rounded-xl border border-slate-200 px-3 py-2 text-sm"
						/>
						{#if !modal.allDay}
							<input
								type="time"
								name="startTime"
								bind:value={modal.startTime}
								class="rounded-xl border border-slate-200 px-3 py-2 text-sm"
							/>
						{/if}
					</label>
					<label class="flex flex-col gap-1 text-xs font-bold text-slate-500">
						End
						<input
							type="date"
							name="endDate"
							bind:value={modal.endDate}
							required
							class="rounded-xl border border-slate-200 px-3 py-2 text-sm"
						/>
						{#if !modal.allDay}
							<input
								type="time"
								name="endTime"
								bind:value={modal.endTime}
								class="rounded-xl border border-slate-200 px-3 py-2 text-sm"
							/>
						{/if}
					</label>
				</div>

				<input
					name="location"
					bind:value={modal.location}
					placeholder="Location (optional)"
					class="rounded-xl border border-slate-200 px-4 py-2 text-sm"
				/>
				<textarea
					name="description"
					bind:value={modal.description}
					placeholder="Notes (optional)"
					rows="2"
					class="rounded-xl border border-slate-200 px-4 py-2 text-sm"></textarea>

				<div class="flex items-center justify-between gap-2 pt-2">
					<div>
						{#if modal.mode === 'edit'}
							<button type="button" onclick={confirmDelete} class="text-sm font-bold text-red-500"
								>Delete</button
							>
						{/if}
					</div>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={closeModal}
							class="rounded-xl px-4 py-2 text-sm font-bold text-slate-500">Cancel</button
						>
						<button
							type="submit"
							class="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow"
							>Save</button
						>
					</div>
				</div>
			</form>
		</div>
	</div>

	<form
		bind:this={deleteFormEl}
		method="POST"
		action="?/deleteEvent"
		class="hidden"
		use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'failure') {
					modalError = (result.data?.error as string) ?? 'Could not delete the event.';
					return;
				}
				closeModal();
				await update();
			};
		}}
	>
		<input type="hidden" name="eventId" value={modal.eventId ?? ''} />
	</form>
{/if}

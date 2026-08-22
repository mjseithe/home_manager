<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dayHeaderFmt = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
	const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
	const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
	const dayNumFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric' });
	const weekdayShortFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

	const anchor = $derived(new Date(data.anchor));

	const eventsByDay = $derived.by(() => {
		const map = new Map<string, typeof data.events>();
		for (const event of data.events) {
			const key = new Date(event.startAt).toDateString();
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(event);
		}
		return [...map.entries()];
	});

	const monthGrid = $derived.by(() => {
		if (data.view !== 'month') return [];
		const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
		const start = new Date(first);
		start.setDate(start.getDate() - start.getDay());
		const days: Date[] = [];
		for (let i = 0; i < 42; i++) {
			days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
		}
		return days;
	});

	function eventsOnDay(day: Date) {
		return data.events.filter((e) => new Date(e.startAt).toDateString() === day.toDateString());
	}

	function navUrl(overrides: { view?: 'agenda' | 'month'; date?: string }) {
		const params = new URLSearchParams();
		params.set('view', overrides.view ?? data.view);
		params.set('date', overrides.date ?? data.anchor.slice(0, 10));
		for (const id of data.hiddenMembers) params.append('hide', id);
		return `/calendar?${params.toString()}`;
	}

	function toggleHideUrl(memberId: string) {
		const hidden = new Set(data.hiddenMembers);
		if (hidden.has(memberId)) hidden.delete(memberId);
		else hidden.add(memberId);

		const params = new URLSearchParams();
		params.set('view', data.view);
		params.set('date', data.anchor.slice(0, 10));
		for (const id of hidden) params.append('hide', id);
		return `/calendar?${params.toString()}`;
	}

	function shiftedDate(days: number) {
		const d = new Date(anchor);
		if (data.view === 'month') d.setMonth(d.getMonth() + days);
		else d.setDate(d.getDate() + days);
		return d.toISOString().slice(0, 10);
	}

	function todayDate() {
		return new Date().toISOString().slice(0, 10);
	}
</script>

<svelte:head>
	<title>Calendar · Home Manager</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-bold text-slate-800">
			{data.view === 'month' ? monthFmt.format(anchor) : 'Agenda'}
		</h1>

		<div class="flex items-center gap-2">
			<div class="flex overflow-hidden rounded-xl border border-slate-300">
				<a
					href={navUrl({ view: 'agenda' })}
					class="px-4 py-2 text-sm font-medium {data.view === 'agenda'
						? 'bg-blue-600 text-white'
						: 'bg-white text-slate-600'}">Agenda</a
				>
				<a
					href={navUrl({ view: 'month' })}
					class="px-4 py-2 text-sm font-medium {data.view === 'month'
						? 'bg-blue-600 text-white'
						: 'bg-white text-slate-600'}">Month</a
				>
			</div>

			<a
				href={navUrl({ date: shiftedDate(-1) })}
				class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-lg">‹</a
			>
			<a
				href={navUrl({ date: todayDate() })}
				class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium">Today</a
			>
			<a
				href={navUrl({ date: shiftedDate(1) })}
				class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-lg">›</a
			>

			<form method="POST" action="?/sync" use:enhance>
				<button
					type="submit"
					class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
					>🔄 Sync</button
				>
			</form>
		</div>
	</div>

	{#if data.error}
		<div class="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-700">
			Couldn't connect that calendar ({data.error}). Try again from Google Cloud console settings.
		</div>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		{#each data.familyMembers as member (member.id)}
			{@const hidden = data.hiddenMembers.includes(member.id)}
			<a
				href={toggleHideUrl(member.id)}
				class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition {hidden
					? 'border-slate-200 bg-slate-100 text-slate-400'
					: 'border-transparent text-white'}"
				style={hidden ? '' : `background-color: ${member.colorHex}`}
			>
				<span>{member.avatarEmoji}</span>
				{member.name}
			</a>
		{/each}
	</div>

	{#if data.view === 'agenda'}
		<div class="flex flex-col gap-5">
			{#if eventsByDay.length === 0}
				<p class="rounded-xl bg-white p-6 text-center text-slate-400">
					No events in the next two weeks.
				</p>
			{/if}
			{#each eventsByDay as [dayKey, dayEvents] (dayKey)}
				<div>
					<h2 class="mb-2 text-sm font-semibold text-slate-500 uppercase">
						{dayHeaderFmt.format(new Date(dayKey))}
					</h2>
					<div class="flex flex-col divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
						{#each dayEvents as event (event.id)}
							<div class="flex items-center gap-3 px-4 py-3">
								<span
									class="h-3 w-3 shrink-0 rounded-full"
									style="background-color: {event.calendar.account.familyMember.colorHex}"
								></span>
								<span class="w-20 shrink-0 text-sm text-slate-500">
									{event.allDay ? 'All day' : timeFmt.format(new Date(event.startAt))}
								</span>
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium text-slate-800">{event.title}</p>
									{#if event.location}
										<p class="truncate text-sm text-slate-400">{event.location}</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl bg-white shadow-sm">
			<div class="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
				{#each monthGrid.slice(0, 7) as day (day.toISOString())}
					<div class="py-2 text-center text-xs font-semibold text-slate-500">
						{weekdayShortFmt.format(day)}
					</div>
				{/each}
			</div>
			<div class="grid grid-cols-7">
				{#each monthGrid as day (day.toISOString())}
					{@const dayEvents = eventsOnDay(day)}
					{@const inMonth = day.getMonth() === anchor.getMonth()}
					<a
						href={navUrl({ view: 'agenda', date: day.toISOString().slice(0, 10) })}
						class="flex min-h-24 flex-col gap-1 border-r border-b border-slate-100 p-2 {inMonth
							? 'bg-white'
							: 'bg-slate-50 text-slate-300'}"
					>
						<span class="text-sm font-medium">{dayNumFmt.format(day)}</span>
						<div class="flex flex-wrap gap-1">
							{#each dayEvents.slice(0, 4) as event (event.id)}
								<span
									class="h-2 w-2 rounded-full"
									style="background-color: {event.calendar.account.familyMember.colorHex}"
								></span>
							{/each}
							{#if dayEvents.length > 4}
								<span class="text-xs text-slate-400">+{dayEvents.length - 4}</span>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<details class="rounded-xl bg-white p-4 shadow-sm">
		<summary class="cursor-pointer font-semibold text-slate-700">Manage connected calendars</summary
		>

		<div class="mt-4 flex flex-col gap-4">
			{#each data.accounts as account (account.id)}
				<div class="rounded-lg border border-slate-100 p-3">
					<div class="flex items-center justify-between">
						<div>
							<p class="font-medium text-slate-800">
								{account.familyMember.avatarEmoji}
								{account.familyMember.name}
							</p>
							<p class="text-sm text-slate-400">{account.googleEmail}</p>
						</div>
						<form method="POST" action="?/disconnect" use:enhance>
							<input type="hidden" name="accountId" value={account.id} />
							<button type="submit" class="text-sm font-medium text-red-500">Disconnect</button>
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

			<a
				href="/calendar/connect"
				class="rounded-xl bg-blue-600 px-4 py-3 text-center font-medium text-white"
				>+ Connect a Google Calendar</a
			>
		</div>
	</details>
</div>

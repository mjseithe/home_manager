<script lang="ts">
	import type { PageProps } from './$types';
	import { calendarOwner } from '$lib/calendar-layout';

	let { data }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
	const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

	const choresByMember = $derived.by(() => {
		return data.familyMembers
			.map((member) => ({
				member,
				items: data.choresDueToday.filter((i) => i.chore.assignedToId === member.id)
			}))
			.filter((g) => g.items.length > 0);
	});
</script>

<svelte:head>
	<title>Dashboard · Home Manager</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-3xl font-bold text-slate-800">{dateFmt.format(new Date())}</h1>

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
		<a href="/calendar" class="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm">
			<h2 class="font-semibold text-slate-700">📅 Today's Events</h2>
			{#if data.todaysEvents.length === 0}
				<p class="text-sm text-slate-400">Nothing on the calendar today.</p>
			{/if}
			{#each data.todaysEvents as event (event.id)}
				<div class="flex items-center gap-2">
					<span
						class="h-2.5 w-2.5 shrink-0 rounded-full"
						style="background-color: {calendarOwner(event.calendar).colorHex}"
					></span>
					<span class="w-16 shrink-0 text-sm text-slate-500">
						{event.allDay ? 'All day' : timeFmt.format(new Date(event.startAt))}
					</span>
					<span class="truncate text-sm text-slate-800">{event.title}</span>
				</div>
			{/each}
		</a>

		<a href="/chores" class="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm">
			<h2 class="font-semibold text-slate-700">✅ Chores Due Today</h2>
			{#if choresByMember.length === 0}
				<p class="text-sm text-slate-400">No chores scheduled today.</p>
			{/if}
			{#each choresByMember as { member, items } (member.id)}
				<div>
					<p class="text-xs font-medium text-slate-400">
						{member.avatarEmoji}
						{member.name} &middot; {items.filter((i) => i.doneToday).length}/{items.length}
					</p>
					<ul class="ml-1 flex flex-col gap-0.5">
						{#each items as { chore, doneToday } (chore.id)}
							<li class="text-sm {doneToday ? 'text-slate-300 line-through' : 'text-slate-700'}">
								{doneToday ? '✓' : '○'}
								{chore.title}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</a>

		<a href="/grocery" class="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm">
			<h2 class="font-semibold text-slate-700">🛒 Grocery List</h2>
			<p class="text-sm text-slate-400">
				{data.groceryCount} item{data.groceryCount === 1 ? '' : 's'} needed
			</p>
			<ul class="flex flex-col gap-0.5">
				{#each data.groceryPreview as item (item.id)}
					<li class="truncate text-sm text-slate-700">
						{item.name}{#if item.quantity}<span class="text-slate-400">
								· {item.quantity}</span
							>{/if}
					</li>
				{/each}
			</ul>
		</a>
	</div>
</div>

<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	let newRecurrence = $state<'once' | 'daily' | 'weekly' | 'weekdays' | 'custom'>('daily');

	function recurrenceLabel(chore: (typeof data.allChores)[number]) {
		switch (chore.recurrence) {
			case 'once':
				return chore.dueDate ? `Once, ${new Date(chore.dueDate).toLocaleDateString()}` : 'Once';
			case 'daily':
				return 'Every day';
			case 'weekdays':
				return 'Weekdays';
			case 'weekly':
			case 'custom':
				return (chore.recurrenceDays ?? []).map((d) => dayLabels[d]).join(', ') || 'Custom';
			default:
				return chore.recurrence;
		}
	}
</script>

<svelte:head>
	<title>Chores · Home Manager</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-2xl font-bold text-slate-800">Chores</h1>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
		{#each data.board as { member, items } (member.id)}
			<div class="flex flex-col rounded-xl bg-white p-4 shadow-sm">
				<div class="mb-3 flex items-center gap-2">
					<span
						class="flex h-10 w-10 items-center justify-center rounded-full text-xl text-white"
						style="background-color: {member.colorHex}">{member.avatarEmoji}</span
					>
					<div>
						<p class="font-semibold text-slate-800">{member.name}</p>
						<p class="text-xs text-slate-400">
							{items.filter((i) => i.doneToday).length}/{items.length} done today
						</p>
					</div>
				</div>

				<div class="flex flex-col gap-2">
					{#if items.length === 0}
						<p class="text-sm text-slate-300">Nothing due today 🎈</p>
					{/if}
					{#each items as { chore, doneToday } (chore.id)}
						<form method="POST" action="?/toggle" use:enhance>
							<input type="hidden" name="choreId" value={chore.id} />
							<input type="hidden" name="forDate" value={data.todayKey} />
							<button
								type="submit"
								class="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left {doneToday
									? 'bg-green-50'
									: 'bg-slate-50'}"
							>
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 {doneToday
										? 'border-green-500 bg-green-500 text-white'
										: 'border-slate-300'}"
								>
									{#if doneToday}✓{/if}
								</span>
								<span class={doneToday ? 'text-slate-400 line-through' : 'text-slate-700'}
									>{chore.title}</span
								>
							</button>
						</form>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<details class="rounded-xl bg-white p-4 shadow-sm">
		<summary class="cursor-pointer font-semibold text-slate-700">Manage chores</summary>

		<div class="mt-4 flex flex-col gap-4">
			<div class="flex flex-col divide-y divide-slate-100">
				{#each data.allChores as chore (chore.id)}
					<div class="flex items-center justify-between py-2">
						<div>
							<p class="font-medium text-slate-700">{chore.title}</p>
							<p class="text-xs text-slate-400">
								{chore.assignedTo.avatarEmoji}
								{chore.assignedTo.name} · {recurrenceLabel(chore)}
							</p>
						</div>
						<form method="POST" action="?/deleteChore" use:enhance>
							<input type="hidden" name="choreId" value={chore.id} />
							<button type="submit" class="text-sm font-medium text-red-500">Remove</button>
						</form>
					</div>
				{/each}
			</div>

			<form
				method="POST"
				action="?/addChore"
				use:enhance
				class="flex flex-col gap-3 border-t border-slate-100 pt-4"
			>
				<input
					type="text"
					name="title"
					placeholder="Chore title (e.g. Feed the dog)"
					required
					class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
				/>

				<div class="flex flex-wrap gap-2">
					<select
						name="assignedToId"
						required
						class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
					>
						{#each data.familyMembers as member (member.id)}
							<option value={member.id}>{member.avatarEmoji} {member.name}</option>
						{/each}
					</select>

					<select
						name="recurrence"
						bind:value={newRecurrence}
						class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
					>
						<option value="once">Once</option>
						<option value="daily">Every day</option>
						<option value="weekdays">Weekdays</option>
						<option value="weekly">Weekly (pick a day)</option>
						<option value="custom">Custom days</option>
					</select>
				</div>

				{#if newRecurrence === 'once'}
					<input
						type="date"
						name="dueDate"
						required
						class="w-fit rounded-lg border border-slate-300 px-3 py-2 text-sm"
					/>
				{:else if newRecurrence === 'weekly' || newRecurrence === 'custom'}
					<div class="flex flex-wrap gap-2">
						{#each dayLabels as label, i (label)}
							<label
								class="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
							>
								<input type="checkbox" name="recurrenceDays" value={i} />
								{label}
							</label>
						{/each}
					</div>
				{/if}

				<button
					type="submit"
					class="w-fit rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
					>+ Add chore</button
				>
			</form>
		</div>
	</details>
</div>

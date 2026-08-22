<script lang="ts">
	import { enhance } from '$app/forms';
	import { describeOffset } from '$lib/reminder-presets';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const offsetPresets = [10, 30, 60, 180, 1440, 2880];
</script>

<svelte:head>
	<title>Settings · Home Manager</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-2xl font-bold text-slate-800">Settings</h1>

	<section class="rounded-xl bg-white p-4 shadow-sm">
		<h2 class="mb-3 font-semibold text-slate-700">Reminder emails</h2>
		<p class="mb-4 text-sm text-slate-500">
			Where should calendar reminders go for each person? Reminders for someone's events are sent to
			their address below.
		</p>
		<div class="flex flex-col gap-3">
			{#each data.familyMembers as member (member.id)}
				<form method="POST" action="?/updateEmail" use:enhance class="flex items-center gap-3">
					<span class="w-28 shrink-0 font-medium text-slate-700"
						>{member.avatarEmoji} {member.name}</span
					>
					<input type="hidden" name="memberId" value={member.id} />
					<input
						type="email"
						name="email"
						placeholder="email address"
						value={member.email ?? ''}
						class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
					/>
					<button
						type="submit"
						class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white">Save</button
					>
				</form>
			{/each}
		</div>
	</section>

	<section class="rounded-xl bg-white p-4 shadow-sm">
		<h2 class="mb-3 font-semibold text-slate-700">Reminder rules</h2>
		<p class="mb-4 text-sm text-slate-500">
			When should reminder emails go out before an event starts?
		</p>

		<div class="flex flex-col divide-y divide-slate-100">
			{#each data.reminderRules as rule (rule.id)}
				<div class="flex items-center justify-between py-2">
					<span class="text-slate-700">
						{describeOffset(rule.offsetMinutes)} before
						{#if rule.familyMember}
							&mdash; {rule.familyMember.avatarEmoji} {rule.familyMember.name} only
						{:else}
							&mdash; everyone
						{/if}
					</span>
					<div class="flex items-center gap-2">
						<form method="POST" action="?/toggleRule" use:enhance>
							<input type="hidden" name="ruleId" value={rule.id} />
							<input type="hidden" name="enabled" value={String(rule.enabled)} />
							<button
								type="submit"
								class="rounded-full px-3 py-1 text-xs font-medium {rule.enabled
									? 'bg-green-100 text-green-700'
									: 'bg-slate-100 text-slate-400'}"
							>
								{rule.enabled ? 'Enabled' : 'Disabled'}
							</button>
						</form>
						<form method="POST" action="?/deleteRule" use:enhance>
							<input type="hidden" name="ruleId" value={rule.id} />
							<button type="submit" class="text-sm font-medium text-red-500">Remove</button>
						</form>
					</div>
				</div>
			{/each}
		</div>

		<form
			method="POST"
			action="?/addRule"
			use:enhance
			class="mt-4 flex flex-wrap items-center gap-2"
		>
			<select name="offsetMinutes" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
				{#each offsetPresets as minutes (minutes)}
					<option value={minutes}>{describeOffset(minutes)} before</option>
				{/each}
			</select>
			<select name="familyMemberId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
				<option value="">Everyone</option>
				{#each data.familyMembers as member (member.id)}
					<option value={member.id}>{member.name} only</option>
				{/each}
			</select>
			<button type="submit" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
				>+ Add rule</button
			>
		</form>
	</section>
</div>

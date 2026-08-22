<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const unchecked = $derived(data.items.filter((i) => !i.checked));
	const checked = $derived(data.items.filter((i) => i.checked));

	let nameInput: HTMLInputElement;
</script>

<svelte:head>
	<title>Grocery List · Home Manager</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-2xl font-bold text-slate-800">Grocery List</h1>

	<form
		method="POST"
		action="?/add"
		use:enhance={() => {
			return async ({ update }) => {
				await update();
				nameInput?.focus();
			};
		}}
		class="flex gap-2"
	>
		<input
			bind:this={nameInput}
			type="text"
			name="name"
			placeholder="Add an item..."
			required
			class="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg"
		/>
		<input
			type="text"
			name="quantity"
			placeholder="qty"
			class="w-20 rounded-xl border border-slate-300 px-3 py-3 text-lg"
		/>
		<button type="submit" class="rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white"
			>Add</button
		>
	</form>

	<div class="flex flex-col gap-2">
		{#if unchecked.length === 0}
			<p class="rounded-xl bg-white p-6 text-center text-slate-400">List is empty. 🎉</p>
		{/if}
		{#each unchecked as item (item.id)}
			<div class="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
				<form method="POST" action="?/toggle" use:enhance class="flex-1">
					<input type="hidden" name="itemId" value={item.id} />
					<input type="hidden" name="checked" value={String(item.checked)} />
					<button type="submit" class="flex w-full items-center gap-3 text-left">
						<span
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-slate-300"
						></span>
						<span class="flex-1">
							<span class="text-lg font-medium text-slate-800">{item.name}</span>
							{#if item.quantity}
								<span class="text-slate-400">· {item.quantity}</span>
							{/if}
						</span>
						{#if item.addedBy}
							<span
								class="rounded-full px-2 py-0.5 text-xs font-medium text-white"
								style="background-color: {item.addedBy.colorHex}">{item.addedBy.avatarEmoji}</span
							>
						{/if}
					</button>
				</form>
				<form method="POST" action="?/remove" use:enhance>
					<input type="hidden" name="itemId" value={item.id} />
					<button type="submit" class="px-2 text-xl text-slate-300">×</button>
				</form>
			</div>
		{/each}
	</div>

	{#if checked.length > 0}
		<details class="rounded-xl bg-white p-4 shadow-sm">
			<summary class="cursor-pointer font-semibold text-slate-500"
				>Checked off ({checked.length})</summary
			>
			<div class="mt-3 flex flex-col gap-2">
				{#each checked as item (item.id)}
					<div class="flex items-center gap-3 px-2 py-1">
						<form method="POST" action="?/toggle" use:enhance class="flex-1">
							<input type="hidden" name="itemId" value={item.id} />
							<input type="hidden" name="checked" value={String(item.checked)} />
							<button type="submit" class="flex w-full items-center gap-3 text-left">
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-white"
									>✓</span
								>
								<span class="flex-1 text-slate-400 line-through">{item.name}</span>
							</button>
						</form>
					</div>
				{/each}
			</div>
			<form method="POST" action="?/clearChecked" use:enhance class="mt-3">
				<button type="submit" class="text-sm font-medium text-red-500">Clear checked items</button>
			</form>
		</details>
	{/if}
</div>

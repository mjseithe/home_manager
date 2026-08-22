<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Who's using the house?</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-10 bg-slate-100 p-8">
	<h1 class="text-4xl font-bold text-slate-800">Who's this?</h1>

	<div class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-5">
		{#each data.familyMembers as member (member.id)}
			<form method="POST" action="?/select">
				<input type="hidden" name="memberId" value={member.id} />
				<button
					type="submit"
					class="flex h-40 w-40 flex-col items-center justify-center gap-3 rounded-3xl text-white shadow-lg transition active:scale-95"
					style="background-color: {member.colorHex}"
				>
					<span class="text-5xl">{member.avatarEmoji}</span>
					<span class="text-xl font-semibold">{member.name}</span>
				</button>
			</form>
		{/each}
	</div>
</div>

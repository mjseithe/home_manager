<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const navItems = [
		{ href: '/dashboard', label: 'Home', icon: '🏠' },
		{ href: '/calendar', label: 'Calendar', icon: '📅' },
		{ href: '/grocery', label: 'Grocery', icon: '🛒' },
		{ href: '/chores', label: 'Chores', icon: '✅' },
		{ href: '/settings', label: 'Settings', icon: '⚙️' }
	];
</script>

<div class="flex min-h-screen flex-col bg-slate-100">
	<header
		class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm"
	>
		<span class="text-lg font-bold text-slate-800">🏡 Home Manager</span>

		<form method="POST" action="/switch-profile">
			<button
				type="submit"
				class="flex items-center gap-2 rounded-full px-3 py-1.5 text-white shadow"
				style="background-color: {data.activeMember.colorHex}"
			>
				<span class="text-xl">{data.activeMember.avatarEmoji}</span>
				<span class="font-semibold">{data.activeMember.name}</span>
			</button>
		</form>
	</header>

	<main class="flex-1 overflow-y-auto p-6 pb-28">
		{@render children()}
	</main>

	<nav
		class="fixed inset-x-0 bottom-0 flex justify-around border-t border-slate-200 bg-white py-2 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]"
	>
		{#each navItems as item (item.href)}
			<a
				href={item.href}
				class="flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-sm font-medium transition {page.url.pathname.startsWith(
					item.href
				)
					? 'text-blue-600'
					: 'text-slate-500'}"
			>
				<span class="text-2xl">{item.icon}</span>
				{item.label}
			</a>
		{/each}
	</nav>
</div>

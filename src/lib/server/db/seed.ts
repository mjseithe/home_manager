import 'dotenv/config';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const db = drizzle(new Database(DATABASE_URL), { schema });

const familyMembers: (typeof schema.familyMembers.$inferInsert)[] = [
	{ name: 'Mark', colorHex: '#2563eb', avatarEmoji: '👨', isChild: false, sortOrder: 0 },
	{ name: 'Liz', colorHex: '#db2777', avatarEmoji: '👩', isChild: false, sortOrder: 1 },
	{ name: 'Harlow', colorHex: '#16a34a', avatarEmoji: '🧒', isChild: true, sortOrder: 2 },
	{ name: 'Violet', colorHex: '#9333ea', avatarEmoji: '👧', isChild: true, sortOrder: 3 },
	{ name: 'Josie', colorHex: '#ea580c', avatarEmoji: '👶', isChild: true, sortOrder: 4 }
];

for (const member of familyMembers) {
	const existing = await db.query.familyMembers.findFirst({
		where: (fm, { eq }) => eq(fm.name, member.name)
	});
	if (!existing) {
		await db.insert(schema.familyMembers).values(member);
		console.log(`Seeded family member: ${member.name}`);
	} else {
		console.log(`Skipping existing family member: ${member.name}`);
	}
}

// Default global reminders: a day before and an hour before, for everyone.
const defaultOffsets = [1440, 60];
for (const offsetMinutes of defaultOffsets) {
	const existing = await db.query.reminderRules.findFirst({
		where: (rr, { and, eq, isNull }) =>
			and(isNull(rr.familyMemberId), eq(rr.offsetMinutes, offsetMinutes))
	});
	if (!existing) {
		await db.insert(schema.reminderRules).values({ familyMemberId: null, offsetMinutes });
		console.log(`Seeded reminder rule: ${offsetMinutes} minutes before`);
	} else {
		console.log(`Skipping existing reminder rule: ${offsetMinutes} minutes before`);
	}
}

console.log('Seed complete.');

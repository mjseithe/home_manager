import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date());

// --- Family ---

export const familyMembers = sqliteTable('family_members', {
	id: id(),
	name: text('name').notNull(),
	colorHex: text('color_hex').notNull(),
	avatarEmoji: text('avatar_emoji').notNull(),
	isChild: integer('is_child', { mode: 'boolean' }).notNull().default(false),
	sortOrder: integer('sort_order').notNull().default(0),
	// where calendar reminder emails for this person's events get sent
	email: text('email'),
	createdAt: createdAt()
});

export const familyMembersRelations = relations(familyMembers, ({ many }) => ({
	calendarAccounts: many(calendarAccounts),
	groceryItemsAdded: many(groceryItems, { relationName: 'addedBy' }),
	choresAssigned: many(chores),
	choreCompletions: many(choreCompletions),
	reminderRules: many(reminderRules)
}));

// --- Calendar ---

export const calendarAccounts = sqliteTable('calendar_accounts', {
	id: id(),
	familyMemberId: text('family_member_id')
		.notNull()
		.references(() => familyMembers.id, { onDelete: 'cascade' }),
	googleEmail: text('google_email').notNull(),
	accessToken: text('access_token').notNull(),
	refreshToken: text('refresh_token').notNull(),
	tokenExpiry: integer('token_expiry', { mode: 'timestamp' }),
	lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
	createdAt: createdAt()
});

export const calendarAccountsRelations = relations(calendarAccounts, ({ one, many }) => ({
	familyMember: one(familyMembers, {
		fields: [calendarAccounts.familyMemberId],
		references: [familyMembers.id]
	}),
	calendars: many(calendars)
}));

export const calendars = sqliteTable('calendars', {
	id: id(),
	// null for local-only calendars (no connected Google account) — see familyMemberId below
	accountId: text('account_id').references(() => calendarAccounts.id, { onDelete: 'cascade' }),
	// only set for local-only calendars, so we know whose personal calendar this is
	// without going through an account. Google-backed calendars get their owner via
	// account.familyMember instead.
	familyMemberId: text('family_member_id').references(() => familyMembers.id, {
		onDelete: 'cascade'
	}),
	isLocal: integer('is_local', { mode: 'boolean' }).notNull().default(false),
	googleCalendarId: text('google_calendar_id'),
	summary: text('summary').notNull(),
	colorHex: text('color_hex'),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true)
});

export const calendarsRelations = relations(calendars, ({ one, many }) => ({
	account: one(calendarAccounts, {
		fields: [calendars.accountId],
		references: [calendarAccounts.id]
	}),
	familyMember: one(familyMembers, {
		fields: [calendars.familyMemberId],
		references: [familyMembers.id]
	}),
	events: many(calendarEvents)
}));

export const calendarEvents = sqliteTable(
	'calendar_events',
	{
		id: id(),
		calendarId: text('calendar_id')
			.notNull()
			.references(() => calendars.id, { onDelete: 'cascade' }),
		// null for events created locally that haven't been (or will never be) pushed
		// to Google — i.e. anything on a local-only calendar
		googleEventId: text('google_event_id'),
		title: text('title').notNull(),
		description: text('description'),
		location: text('location'),
		startAt: integer('start_at', { mode: 'timestamp' }).notNull(),
		endAt: integer('end_at', { mode: 'timestamp' }).notNull(),
		allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
		status: text('status').notNull().default('confirmed'),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [unique().on(table.calendarId, table.googleEventId)]
);

export const calendarEventsRelations = relations(calendarEvents, ({ one, many }) => ({
	calendar: one(calendars, {
		fields: [calendarEvents.calendarId],
		references: [calendars.id]
	}),
	reminderLog: many(eventReminderLog)
}));

// day/hour-before style reminders; a null familyMemberId means "applies to everyone"
export const reminderRules = sqliteTable('reminder_rules', {
	id: id(),
	familyMemberId: text('family_member_id').references(() => familyMembers.id, {
		onDelete: 'cascade'
	}),
	offsetMinutes: integer('offset_minutes').notNull(),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true)
});

export const reminderRulesRelations = relations(reminderRules, ({ one }) => ({
	familyMember: one(familyMembers, {
		fields: [reminderRules.familyMemberId],
		references: [familyMembers.id]
	})
}));

export const eventReminderLog = sqliteTable(
	'event_reminder_log',
	{
		id: id(),
		eventId: text('event_id')
			.notNull()
			.references(() => calendarEvents.id, { onDelete: 'cascade' }),
		offsetMinutes: integer('offset_minutes').notNull(),
		sentAt: createdAt()
	},
	(table) => [unique().on(table.eventId, table.offsetMinutes)]
);

export const eventReminderLogRelations = relations(eventReminderLog, ({ one }) => ({
	event: one(calendarEvents, {
		fields: [eventReminderLog.eventId],
		references: [calendarEvents.id]
	})
}));

// --- Grocery list ---

export const groceryItems = sqliteTable('grocery_items', {
	id: id(),
	name: text('name').notNull(),
	quantity: text('quantity'),
	category: text('category'),
	addedById: text('added_by_id').references(() => familyMembers.id, { onDelete: 'set null' }),
	checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
	checkedById: text('checked_by_id').references(() => familyMembers.id, { onDelete: 'set null' }),
	checkedAt: integer('checked_at', { mode: 'timestamp' }),
	createdAt: createdAt()
});

export const groceryItemsRelations = relations(groceryItems, ({ one }) => ({
	addedBy: one(familyMembers, {
		fields: [groceryItems.addedById],
		references: [familyMembers.id],
		relationName: 'addedBy'
	}),
	checkedBy: one(familyMembers, {
		fields: [groceryItems.checkedById],
		references: [familyMembers.id]
	})
}));

// --- Chores ---

export const recurrenceTypes = ['once', 'daily', 'weekly', 'weekdays', 'custom'] as const;
export type RecurrenceType = (typeof recurrenceTypes)[number];

export const chores = sqliteTable('chores', {
	id: id(),
	title: text('title').notNull(),
	description: text('description'),
	assignedToId: text('assigned_to_id')
		.notNull()
		.references(() => familyMembers.id, { onDelete: 'cascade' }),
	recurrence: text('recurrence').$type<RecurrenceType>().notNull().default('once'),
	// JSON array of day-of-week ints (0=Sun..6=Sat), only used when recurrence is 'custom'
	recurrenceDays: text('recurrence_days', { mode: 'json' }).$type<number[]>(),
	dueDate: integer('due_date', { mode: 'timestamp' }),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: createdAt()
});

export const choresRelations = relations(chores, ({ one, many }) => ({
	assignedTo: one(familyMembers, {
		fields: [chores.assignedToId],
		references: [familyMembers.id]
	}),
	completions: many(choreCompletions)
}));

export const choreCompletions = sqliteTable(
	'chore_completions',
	{
		id: id(),
		choreId: text('chore_id')
			.notNull()
			.references(() => chores.id, { onDelete: 'cascade' }),
		completedById: text('completed_by_id').references(() => familyMembers.id, {
			onDelete: 'set null'
		}),
		// the calendar day (YYYY-MM-DD) this completion counts for, so a recurring
		// chore can only be marked done once per period
		forDate: text('for_date').notNull(),
		completedAt: createdAt()
	},
	(table) => [unique().on(table.choreId, table.forDate)]
);

export const choreCompletionsRelations = relations(choreCompletions, ({ one }) => ({
	chore: one(chores, {
		fields: [choreCompletions.choreId],
		references: [chores.id]
	}),
	completedBy: one(familyMembers, {
		fields: [choreCompletions.completedById],
		references: [familyMembers.id]
	})
}));

// --- Convenience types ---

export type FamilyMember = typeof familyMembers.$inferSelect;
export type CalendarAccount = typeof calendarAccounts.$inferSelect;
export type Calendar = typeof calendars.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type ReminderRule = typeof reminderRules.$inferSelect;
export type GroceryItem = typeof groceryItems.$inferSelect;
export type Chore = typeof chores.$inferSelect;
export type ChoreCompletion = typeof choreCompletions.$inferSelect;

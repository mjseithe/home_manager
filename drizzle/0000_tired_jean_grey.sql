CREATE TABLE `calendar_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`family_member_id` text NOT NULL,
	`google_email` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`token_expiry` integer,
	`last_synced_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`family_member_id`) REFERENCES `family_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`google_event_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`location` text,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_calendar_id_google_event_id_unique` ON `calendar_events` (`calendar_id`,`google_event_id`);--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`google_calendar_id` text NOT NULL,
	`summary` text NOT NULL,
	`color_hex` text,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `calendar_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chore_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`chore_id` text NOT NULL,
	`completed_by_id` text,
	`for_date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chore_id`) REFERENCES `chores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by_id`) REFERENCES `family_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_completions_chore_id_for_date_unique` ON `chore_completions` (`chore_id`,`for_date`);--> statement-breakpoint
CREATE TABLE `chores` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`assigned_to_id` text NOT NULL,
	`recurrence` text DEFAULT 'once' NOT NULL,
	`recurrence_days` text,
	`due_date` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assigned_to_id`) REFERENCES `family_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_reminder_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`offset_minutes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_reminder_log_event_id_offset_minutes_unique` ON `event_reminder_log` (`event_id`,`offset_minutes`);--> statement-breakpoint
CREATE TABLE `family_members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color_hex` text NOT NULL,
	`avatar_emoji` text NOT NULL,
	`is_child` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `grocery_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`quantity` text,
	`category` text,
	`added_by_id` text,
	`checked` integer DEFAULT false NOT NULL,
	`checked_by_id` text,
	`checked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`added_by_id`) REFERENCES `family_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`checked_by_id`) REFERENCES `family_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `reminder_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`family_member_id` text,
	`offset_minutes` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`family_member_id`) REFERENCES `family_members`(`id`) ON UPDATE no action ON DELETE cascade
);

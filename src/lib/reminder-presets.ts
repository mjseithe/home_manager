export function describeOffset(minutes: number) {
	if (minutes % 1440 === 0 && minutes > 0) {
		const days = minutes / 1440;
		return days === 1 ? '1 day' : `${days} days`;
	}
	if (minutes % 60 === 0 && minutes > 0) {
		const hours = minutes / 60;
		return hours === 1 ? '1 hour' : `${hours} hours`;
	}
	return `${minutes} minutes`;
}

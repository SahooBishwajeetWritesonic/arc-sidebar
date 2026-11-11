/**
 * Arc Sidebar's Live Calendar, for Google accounts without a secret iCal address: serves your
 * next few days of meetings, to you only, as an iCal feed.
 *
 * At script.google.com, signed in with the account whose calendar this is:
 * 1. Turn on the Calendar service: Services (+) → Google Calendar API → Add. If that dialog
 *    doesn't open: Project Settings → tick "Show appsscript.json", then in that file replace
 *    "dependencies": {} with
 *    "dependencies": { "enabledAdvancedServices": [
 *      { "userSymbol": "Calendar", "serviceId": "calendar", "version": "v3" } ] }
 * 2. Deploy → New deployment → Web app. Execute as: Me. Who has access: Only myself.
 * 3. Authorise when asked and copy the web app URL (it ends in /exec). In Arc Sidebar,
 *    right-click your calendar pin → Live Calendar… and paste it.
 */
const HOURS_BEHIND = 12;
const DAYS_AHEAD = 3;

function doGet() {
  const now = Date.now();
  const events = [];
  let pageToken;
  do {
    const page = Calendar.Events.list('primary', {
      timeMin: new Date(now - HOURS_BEHIND * 3600e3).toISOString(),
      timeMax: new Date(now + DAYS_AHEAD * 86400e3).toISOString(),
      singleEvents: true, // repeating meetings come as one event per occurrence
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    });
    events.push(...(page.items || []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Arc Sidebar//Live Calendar//EN'];
  for (const event of events) {
    // All-day events have a date but no time; working location isn't a meeting.
    if (event.status === 'cancelled' || !event.start || !event.start.dateTime) continue;
    if (event.eventType === 'workingLocation') continue;
    const me = (event.attendees || []).find((attendee) => attendee.self);
    if (me && me.responseStatus === 'declined') continue;
    const video = ((event.conferenceData && event.conferenceData.entryPoints) || []).find(
      (entry) => entry.entryPointType === 'video',
    );
    const call = event.hangoutLink || (video && video.uri);

    lines.push(
      'BEGIN:VEVENT',
      'UID:' + event.id,
      'DTSTAMP:' + stamp(new Date()),
      'DTSTART:' + stamp(new Date(event.start.dateTime)),
      'DTEND:' + stamp(new Date(event.end.dateTime)),
      'SUMMARY:' + text(event.summary || '(No title)'),
    );
    if (event.location) lines.push('LOCATION:' + text(event.location));
    if (event.description) lines.push('DESCRIPTION:' + text(event.description));
    if (call) lines.push('X-GOOGLE-CONFERENCE:' + call);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  return ContentService.createTextOutput(lines.map(fold).join('\r\n')).setMimeType(
    ContentService.MimeType.ICAL,
  );
}

/** iCal's UTC time: 20261111T093000Z. */
function stamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** iCal text escapes backslashes, semicolons, commas and line breaks. */
function text(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** iCal keeps lines short: a long one continues on the next line after a space. */
function fold(line) {
  const chars = Array.from(line);
  if (chars.length <= 73) return line;
  const parts = [];
  for (let i = 0; i < chars.length; i += 73) parts.push(chars.slice(i, i + 73).join(''));
  return parts.join('\r\n ');
}

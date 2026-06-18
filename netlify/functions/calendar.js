// Génère un flux iCalendar (.ics) depuis les activités Supabase.
// Apple Calendar s'y abonne et se rafraîchit automatiquement (~1h).

const SUPABASE_URL = 'https://mftzzejtxzxlqvqtibds.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mdHp6ZWp0eHp4bHF2cXRpYmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NjM1NTcsImV4cCI6MjA5MDQzOTU1N30.pzVSuXZaEausombOaar9hTHxvHIoTjtJtFTUk7o_Ogg';

const ACT_LABELS = { walk: 'Marche', run: 'Course à pied', bike: 'Vélo', gym: 'Musculation' };
const ACT_EMOJI  = { walk: '🚶', run: '🏃', bike: '🚴', gym: '🏋️' };
const GYM_LABELS = { push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper', lower: 'Lower', full_body: 'Full Body' };

exports.handler = async function () {
  try {
    const [actsRes, stepsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/activities?select=*&order=date.desc&limit=500`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/daily_steps?select=date,steps&order=date.desc&limit=500`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      }),
    ]);

    if (!actsRes.ok)  throw new Error(`Supabase activities: ${actsRes.status}`);
    if (!stepsRes.ok) throw new Error(`Supabase steps: ${stepsRes.status}`);

    const activities = await actsRes.json();
    const steps      = await stepsRes.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type':        'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="lifestyle.ics"',
        'Cache-Control':       'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
      body: generateICS(activities, steps),
    };
  } catch (err) {
    return { statusCode: 500, body: `Erreur : ${err.message}` };
  }
};

function generateICS(activities, steps) {
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//mandar170//Lifestyle Tracker//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lifestyle — Sport & Pas',
    'X-WR-CALDESC:Activités physiques et pas depuis lifestyle.mandar170.fr',
    'X-WR-TIMEZONE:Europe/Paris',
    'X-PUBLISHED-TTL:PT1H',
  ];

  // ── Activités ──
  for (const a of activities) {
    const label   = ACT_LABELS[a.type] || a.type;
    const emoji   = ACT_EMOJI[a.type]  || '•';
    const dateStr = a.date.replace(/-/g, '');
    const nextDay = nextDateStr(a.date);

    const parts = [];
    if (a.duration_min) parts.push(`${a.duration_min} min`);
    if (a.distance_km)  parts.push(`${a.distance_km} km`);
    if (a.type === 'run' && a.duration_min && a.distance_km) {
      const p = a.duration_min / a.distance_km;
      parts.push(`${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')}/km`);
    }
    if (a.type === 'bike') {
      const sp = a.avg_speed_kmh || (a.duration_min && a.distance_km ? (a.distance_km / a.duration_min) * 60 : null);
      if (sp) parts.push(`${parseFloat(sp).toFixed(1)} km/h`);
    }
    if (a.avg_hr_bpm)   parts.push(`FC ${a.avg_hr_bpm} bpm`);
    if (a.elevation_m)  parts.push(`D+ ${a.elevation_m} m`);
    if (a.avg_power_w)  parts.push(`${a.avg_power_w} W`);
    if (a.steps)        parts.push(`${a.steps.toLocaleString('fr-FR')} pas`);
    if (a.session_type) parts.push(GYM_LABELS[a.session_type] || a.session_type);
    if (a.description)  parts.push(a.description);

    const summary = `${emoji} ${label}${a.duration_min ? ` — ${a.duration_min} min` : ''}`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:lifestyle-act-${a.id}@mandar170`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${nextDay}`,
      `SUMMARY:${esc(summary)}`,
      ...(parts.length ? [`DESCRIPTION:${esc(parts.join(' · '))}`] : []),
      'END:VEVENT',
    );
  }

  // ── Pas (jours ≥ 10 000) mis en avant ──
  for (const s of steps) {
    if (!s.steps || s.steps < 1000) continue;
    const dateStr = s.date.replace(/-/g, '');
    const nextDay = nextDateStr(s.date);
    const goal    = s.steps >= 10000;
    const summary = goal
      ? `👣 ${s.steps.toLocaleString('fr-FR')} pas ✅`
      : `👣 ${s.steps.toLocaleString('fr-FR')} pas`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:lifestyle-steps-${s.date}@mandar170`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${nextDay}`,
      `SUMMARY:${esc(summary)}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function nextDateStr(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

function esc(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

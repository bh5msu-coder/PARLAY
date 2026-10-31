/** GET /api/health — reports which integrations are configured on this deployment.
 *  Only booleans and public deploy metadata are returned; secret values never leave the server. */

function has(...names) {
  return names.some((n) => typeof process.env[n] === 'string' && process.env[n].trim() !== '');
}

export function healthReport() {
  const espn = {
    s2: has('ESPN_S2', 'espn_s2'),
    swid: has('ESPN_SWID', 'SWID'),
    leagueIdOverride: has('ESPN_LEAGUE_ID'),
  };
  const supabase = {
    // api/pick.js falls back to the publishable project URL/key when these are unset.
    url: has('SUPABASE_URL'),
    key: has('SUPABASE_ANON_KEY', 'SUPABASE_KEY'),
  };
  const problems = [];
  if (!espn.s2 || !espn.swid) {
    problems.push('ESPN_S2 and ESPN_SWID are not both set; the private fantasy league (last-place payer) cannot load.');
  }
  return {
    ok: problems.length === 0,
    espn,
    supabase: Object.assign(supabase, { usingBuiltInFallback: !supabase.url || !supabase.key }),
    deploy: {
      env: process.env.VERCEL_ENV || null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    },
    problems,
  };
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }
  res.status(200).json(healthReport());
}

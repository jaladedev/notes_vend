// The registry of school deployments, from the SCHOOLS_JSON env var:
//   [{"slug":"greenfield","name":"Greenfield Academy","baseUrl":"https://greenfield.example.com","secret":"<same value as that school's PLATFORM_SECRET>"}]
// Secrets live in env (never in the repo, never sent to the browser).

export type School = { slug: string; name: string; baseUrl: string; secret: string };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function parseSchools(raw: string | undefined): School[] {
  if (!raw || !raw.trim()) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("SCHOOLS_JSON is not valid JSON.");
  }
  if (!Array.isArray(data)) throw new Error("SCHOOLS_JSON must be an array.");

  const seen = new Set<string>();
  return data.map((item, i) => {
    const r = (item ?? {}) as Record<string, unknown>;
    const where = `SCHOOLS_JSON[${i}]`;
    if (typeof r.slug !== "string" || !SLUG_RE.test(r.slug)) throw new Error(`${where}.slug must be lowercase letters, digits and dashes.`);
    if (seen.has(r.slug)) throw new Error(`${where}.slug "${r.slug}" is duplicated.`);
    seen.add(r.slug);
    if (typeof r.name !== "string" || !r.name.trim()) throw new Error(`${where}.name is required.`);
    if (typeof r.secret !== "string" || r.secret.length < 32) throw new Error(`${where}.secret must be at least 32 characters.`);
    if (typeof r.baseUrl !== "string") throw new Error(`${where}.baseUrl is required.`);

    let url: URL;
    try {
      url = new URL(r.baseUrl);
    } catch {
      throw new Error(`${where}.baseUrl is not a valid URL.`);
    }
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
      throw new Error(`${where}.baseUrl must be https (http is allowed for localhost only).`);
    }
    return { slug: r.slug, name: r.name.trim(), baseUrl: url.origin, secret: r.secret };
  });
}

export function getSchools(): School[] {
  return parseSchools(process.env.SCHOOLS_JSON);
}

export function getSchool(slug: string): School | undefined {
  return getSchools().find((s) => s.slug === slug);
}

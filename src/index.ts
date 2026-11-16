import express, { Request, Response } from 'express';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 8080;

// Helper function to normalize input into an array
// as a defensive measure when dealing with XML-to-JSON
// array conversion inconsistencies
function toArray<T>(val: T | T[] | undefined | null): T[] {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
}

app.use(express.json());

app.get('/institution-portfolio', async (req: Request, res: Response) => {
    // STEP 1: Input Validation & Defaults
    // - Extract `institution` (string), `limit` (number, default 10, max 10), and `publicationsPerGrant` (number, default 5, max 5) from req.query
    // - Return 400 Bad Request if `institution` is missing/empty or numeric params are invalid/out of range

    const rawInst = req.query.institution;
    if (typeof rawInst !== 'string' || !rawInst.trim()) {
        return res.status(400).json({ error: 'Missing or empty institution parameter' });
    }
    const institution = rawInst.trim();

    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 5;
    const publicationsPerGrant = req.query.publicationsPerGrant !== undefined ? Number(req.query.publicationsPerGrant) : 3;

    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
        return res.status(400).json({ error: 'Invalid "limit" parameter; must be an integer between 1 and 10' });
    }

    if (!Number.isInteger(publicationsPerGrant) || publicationsPerGrant < 1 || publicationsPerGrant > 5) {
        return res.status(400).json({ error: 'Invalid "publicationsPerGrant" parameter; must be an integer between 1 and 5' });
    }

    // STEP 2: Europe PMC Grants (Grist) API Lookup
    // - Construct safe query for `aff:"<institution>"` with `format=json` and `resultType=core`
    // - Handle upstream failure/timeout cleanly (return 502/503 if the primary Grants API is unreachable)
    // - Slice results to at most `limit` grants, preserving Grist order
    // - Extract grant ID, title, funder, and reported institution

    const encodedAff = encodeURIComponent(`aff:"${institution}"`);
    const gristUrl = `https://www.ebi.ac.uk/europepmc/GristAPI/rest/get/query=${encodedAff}&resultType=core&format=json`;

    let gristResponse;
    try {
        gristResponse = await axios.get(gristUrl, { timeout: 8000 });
    } catch (err) {
        return res.status(502).json({ error: 'Failed to fetch grants from Europe PMC Grist API' });
    }

    const rawRecords = toArray<any>(gristResponse.data?.RecordList?.Record).slice(0, limit);

    const grants = rawRecords.map((r: any) => ({
        grantId: String(r.Grant?.Id || ''),
        title: r.Grant?.Title || '',
        funder: r.Grant?.Funder?.Name || 'Unknown Funder',
        reportedInstitution: r.Institution?.Name || institution
    }));

    // STEP 3: Bounded Concurrent Articles API Lookups
    // - For each grant, query the Europe PMC Articles API using `GRANT_ID:"<grantId>"` with `pageSize=<publicationsPerGrant>` and `format=json`
    // - Bound concurrency (e.g., max 3-5 simultaneous requests) so we do not overwhelm Europe PMC
    // - Isolate failures (e.g., using Promise.allSettled or per-task try/catch) so one failed lookup does not fail the entire portfolio

    async function enrichGrant(record: any) {
        
        const artRes = await axios.get('https://www.ebi.ac.uk/europepmc/webservices/rest/search', {
            params: {
                query: `GRANT_ID:"${record.grantId}"`,
                resultType: 'core',
                format: 'json',
                pageSize: publicationsPerGrant
            },
            timeout: 5000
        });

        const rawArticles = toArray<any>(artRes.data?.resultList?.result).slice(0, publicationsPerGrant);

        if (rawArticles.length === 0) {
            return {
                ...record,
                publicationStatus: 'NONE_FOUND',
                publications: []
            };
        }

        // STEP 4: Data Enrichment, Linking Status & Stable Identity
        // - For each publication, construct a stable identity (`source` + `id`, plus `doi` if present) and extract title, journal, pubYear
        // - Categorise each grant's publication status: 'PUBLICATIONS_FOUND', 'NONE_FOUND', 'UNCERTAIN_ASSOCIATION', or 'LOOKUP_ERROR'

        const publications = rawArticles.map((a: any) => {

            const linkedGrants = toArray<any>(a.grantsList?.grant);
            
            // Check if both grantId AND funder agency match (case-insensitive substring)
            const verifiedAssociation = linkedGrants.some((g: any) => {
                const idMatches = String(g.grantId || '').toLowerCase() === record.grantId.toLowerCase();
                const agency = String(g.agency || '').toLowerCase();
                const funder = String(record.funder || '').toLowerCase();
                const funderMatches = Boolean(agency && funder && (funder.includes(agency) || agency.includes(funder)));
                return idMatches && funderMatches;
            });
            
            return {
                identity: `${a.source}:${a.id}`,
                source: a.source,
                id: a.id,
                doi: a.doi || undefined,
                title: a.title,
                journal: a.journalTitle || a.bookOrReportDetails?.publisher || undefined,
                pubYear: a.pubYear || undefined,
                verifiedAssociation
            };
        });

        const hasVerified = publications.some((p: any) => p.verifiedAssociation);

        return {
            ...record,
            publicationStatus: hasVerified ? 'PUBLICATIONS_FOUND' : 'UNCERTAIN_ASSOCIATION',
            publications
        };

    }

    // Run in bounded concurrent batches of 3
    const CONCURRENCY_LIMIT = 3;
    const enrichedGrants: any[] = [];

    for (let i = 0; i < grants.length; i += CONCURRENCY_LIMIT) {
        const batch = grants.slice(i, i + CONCURRENCY_LIMIT);
        const results = await Promise.allSettled(batch.map((g: any) => enrichGrant(g)));

        results.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                enrichedGrants.push(result.value);
            } else {
                enrichedGrants.push({
                    ...batch[idx],
                    publicationStatus: 'LOOKUP_ERROR',
                    publications: [],
                    errorMessage: result.reason?.message || 'Article lookup failed'
                });
            }
        });
    }

    // STEP 5: Portfolio Sample Summary & Response
    // - Calculate sample counts: grants returned, grants by funder, and total publication associations in this sample
    // - Return 200 OK with the structured JSON payload

    const grantsByFunder: Record<string, number> = {};
    let totalPublicationAssociations = 0;

    for (const g of enrichedGrants) {
        grantsByFunder[g.funder] = (grantsByFunder[g.funder] || 0) + 1;
        totalPublicationAssociations += g.publications.length;
    }

    return res.json({
        requestedInstitution: institution,
        parameters: { limit, publicationsPerGrant },
        sampleSummary: {
            note: 'Sample counts reflect only the truncated page returned by this request, not complete institutional totals.',
            grantsReturned: enrichedGrants.length,
            grantsByFunder,
            totalPublicationAssociations
        },
        grants: enrichedGrants
    });

});

if (require.main === module) {
    app.listen(port, () => console.log(`Server running on port ${port}`));
}
export default app;

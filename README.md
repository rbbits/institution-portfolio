# Europe PMC Institution Funding Portfolio

A Dockerised REST API that retrieves funding awards for a given university and enriches them with linked scientific publications using the Europe PMC Grist and Articles APIs.

## Build, Run and Test Instructions

**Build the Docker image:**
`docker build -t institution-portfolio .`

**Run the container:**
`docker run --rm -p 8080:8080 institution-portfolio`

**Run locally (development):**
`npm install`
`npm start`

**Run automated tests (offline):**
`npm test`

## Example Requests
* `GET /institution-portfolio?institution=University%20of%20Cambridge`
* `GET /institution-portfolio?institution=University%20of%20Manchester&limit=5&publicationsPerGrant=3`

## Main Design and Identity Choices

- Input Validation & Defaults: The endpoint /institution-portfolio enforces strict input validation (1 <= limit <= 10, default 5; 1 <= publicationsPerGrant <= 5, default 3; non-empty institution string). Invalid parameters immediately return 400 Bad Request rather than silently clamping values, ensuring a predictable API contract.

- Stable Publication Identity: Each publication is assigned a composite identity field formatted as <source>:<id> (e.g., MED:42720975 or PPR:PPR1331636), supplemented by doi where available.

- Deduplication Strategy: Publications are preserved in the Articles API order under each associated grant without cross-grant deduplication, as a single collaborative publication can legitimately acknowledge multiple institutional awards.

## Institution-Matching and Grant-Linking Strategies

- Institution Matching (aff:): User-supplied institution names are wrapped in quotes and URL-encoded (aff:"<institution>") against the Europe PMC Grist REST API (resultType=core&format=json) using path-style query routing. Because affiliation strings in grant metadata vary (e.g., "University of Cambridge" vs department-level strings), exact phrase matching trades recall for precision.

- Grant-to-Publication Linking (GRANT_ID): Grant IDs are not globally unique across funding agencies, and publication funding metadata is frequently incomplete. When querying the Articles API (GRANT_ID:"<grantId>"), the service inspects each returned article's grantsList.grant array:

- PUBLICATIONS_FOUND: At least one returned publication explicitly matches both the grantId and the grant's reported funder (agency) via case-insensitive substring comparison (verifiedAssociation: true).

- UNCERTAIN_ASSOCIATION: Publications were returned by the GRANT_ID search, but funder metadata in grantsList.grant was absent or differed from the Grist funder name (for example, "National Institute for Health Research (NIHR)" in Grist vs "National Institute for Health and Care Research" in Articles).

- NONE_FOUND: The Articles API returned zero matching publications (which does not prove the award produced no publications).

- LOOKUP_ERROR: The upstream Articles API request timed out or failed for that specific grant.

## Concurrency and Failure Handling

- Bounded Concurrency: Article lookups execute in bounded batches of 3 simultaneous requests using native Promise.allSettled() chunking, preventing upstream rate-limiting or socket exhaustion against Europe PMC while avoiding external ESM queue dependencies.

- Failure Isolation & Timeouts: Primary Grist API failures return 502 Bad Gateway (with an 8-second timeout). Individual Article API calls enforce a 5-second timeout; if one lookup fails or times out, Promise.allSettled() isolates the fault, preserving results for all other grants and marking only the affected grant as LOOKUP_ERROR.

## Limitations

- Grist uses path-style routing (`/rest/get/query=...`) instead of standard query parameters (`?query=...`), and it concatenates unrecognised parameters like `pageSize=2` directly into the search query string (`pageSize=2aff:"University of Cambridge"`), causing `HitCount: 0`!


## Review of my solution

**1. Which design decision worked particularly well?**

Using native chunked Promise.allSettled() batches (bounded concurrency of 3) combined with an explicit four-state publicationStatus enum (PUBLICATIONS_FOUND, UNCERTAIN_ASSOCIATION, NONE_FOUND, LOOKUP_ERROR) and a defensive toArray() XML-to-JSON normaliser. This provided bounded concurrency and per-grant fault isolation using standard language primitives without introducing third-party dependency conflicts.

**2. What would you change or improve with more time?**

First, I would refactor the single-file orchestration into a layered architecture (Controller, Service, and Europe PMC Client) with dependency injection to expand unit test coverage across edge cases. Second, I would enhance grant-linking accuracy by querying across all normalised Grant.Alias variants and leveraging persistent identifiers present in the Grist payload (RORID for institutions and Crossref FundRefID DOIs for funders) rather than relying solely on free-text funder string matching. Finally, I would add upstream resilience (retry with exponential backoff/jitter on transient 5xx responses and short-TTL caching).

**3. Which assumption about Europe PMC data would you validate before production?**

During exploratory testing against the live APIs, two structural anomalies stood out that I would validate with the Europe PMC data team before production:

Funder naming divergence between Grist and the Articles API (e.g., Grist reports "National Institute for Health Research (NIHR)" whereas Articles records "National Institute for Health and Care Research"), which directly impacts automated verification of grant-to-publication links.

XML-to-JSON serialisation behaviour in Grist where fields such as RecordList.Record or Grant.Alias serialise as a single object/primitive when count is 1, an array when count > 1, and undefined when 0.

**4. Which piece of technical debt did you deliberately accept?**

To prioritise a working, containerised vertical slice within the 3-hour timebox, I kept the routing and orchestration logic consolidated in src/index.ts and executed TypeScript via ts-node inside a single-stage Dockerfile rather than configuring a multi-stage TypeScript compilation (tsc -> node dist/index.js) pipeline.

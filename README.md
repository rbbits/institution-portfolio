# Europe PMC Institution Funding Portfolio

A Dockerised REST API that retrieves funding awards for a given university and enriches them with linked scientific publications using the Europe PMC Grist and Articles APIs.

## Build, Run and Test Instructions

**To Build:**
`docker build -t institution-portfolio .`

**To Run:**
`docker run --rm -p 8080:8080 institution-portfolio`

**To Test:**
`npm test`

## Example Requests
* `GET /institution-portfolio?institution=University%20of%20Cambridge`
* `GET /institution-portfolio?institution=University%20of%20Manchester&limit=5&publicationsPerGrant=3`

## Main Design and Identity Choices
[To be completed: Outline of JSON schema choices, TypeScript interface decisions, and stable identity creation (e.g., source + id + DOI).]

## Institution-Matching and Grant-Linking Strategies
[To be completed: Explanation of how the `aff:` parameter is encoded and how `GRANT_ID` lookups are structured.]

## Concurrency and Failure Handling
[To be completed: Details on the bounded concurrency model for Article API lookups, timeout parameters, and how failure isolation prevents a single failed lookup from rejecting the entire request.]

## Limitations
[To be completed: Acknowledgement of incomplete upstream funding metadata, affiliation name variances, and the non-exhaustive nature of "no publications found".]

## Review of my solution

**1. Which design decision worked particularly well?**
[To be drafted]

**2. What would you change or improve with more time?**
[To be drafted]

**3. Which assumption about Europe PMC data would you validate before production?**
[To be drafted]

**4. Which piece of technical debt did you deliberately accept?**
[To be drafted]


export type GrantPublicationStatus =
  | 'PUBLICATIONS_FOUND'
  | 'NONE_FOUND'
  | 'UNCERTAIN_ASSOCIATION'
  | 'LOOKUP_ERROR';

export interface PublicationItem {
  identity: string;          // e.g. `${source}:${id}`
  source: string;
  id: string;
  doi?: string;
  title: string;
  journal?: string;
  pubYear?: string;
  verifiedAssociation: boolean;
}

export interface GrantPortfolioItem {
  grantId: string;
  title?: string;
  funder: string;
  reportedInstitution?: string;
  publicationStatus: GrantPublicationStatus;
  publications: PublicationItem[];
  errorMessage?: string;     // Populated only if publicationStatus === 'LOOKUP_ERROR'
}

export interface PortfolioResponse {
  requestedInstitution: string;
  parameters: {
    limit: number;
    publicationsPerGrant: number;
  };
  sampleSummary: {
    note: string;
    grantsReturned: number;
    grantsByFunder: Record<string, number>;
    totalPublicationAssociations: number;
  };
  grants: GrantPortfolioItem[];
}
